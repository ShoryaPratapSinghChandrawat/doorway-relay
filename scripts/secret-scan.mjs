#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const environmentFilePath = (path) => {
  const name = path.split(/[/\\]/).at(-1) ?? path;
  return name === '.env' || (name.startsWith('.env.') && name !== '.env.example');
};

function gitBuffer(args, input) {
  const result = spawnSync('git', args, {
    cwd: repositoryRoot,
    input,
    encoding: 'buffer',
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`git ${args[0]} failed while collecting repository metadata.`);
  }
  return result.stdout;
}

function isCandidate(value) {
  return !/(?:example|fake|fixture|mock|placeholder|replace|test[-_ ]only|not[-_ ]for[-_ ]output|never[-_ ]returned)/i.test(value);
}

const patterns = [
  { name: 'private-key PEM marker', expression: /-----BEGIN (?:RSA|EC|OPENSSH|DSA|PRIVATE) PRIVATE KEY-----/g },
  { name: 'AWS access key', expression: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { name: 'GitHub token', expression: /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/g },
  { name: 'Google API key', expression: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { name: 'Slack token', expression: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { name: 'Stripe live secret', expression: /\bsk_live_[A-Za-z0-9]{20,}\b/g },
  { name: 'JWT-shaped value', expression: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g },
  { name: 'credential assignment', expression: /\b(?:api[_-]?key|client[_-]?secret|access[_-]?token|secret[_-]?key)\s*[:=]\s*["']?([A-Za-z0-9_+/-]{24,})/gi, captureGroup: 1, reviewOnly: true },
  { name: 'literal Bearer credential', expression: /\bBearer\s+([A-Za-z0-9._~+/-]{24,})/gi, captureGroup: 1, reviewOnly: true },
];
const counts = new Map(patterns.map(({ name }) => [name, 0]));
const matchedPaths = new Map(patterns.map(({ name }) => [name, new Set()]));
let worktreeFilesScanned = 0;
let commitSnapshotsScanned = 0;
let committedBlobsScanned = 0;

function inspectBuffer(buffer, path) {
  if (buffer.includes(0)) return;
  const text = buffer.toString('utf8');
  for (const pattern of patterns) {
    pattern.expression.lastIndex = 0;
    for (const match of text.matchAll(pattern.expression)) {
      const candidate = match[pattern.captureGroup ?? 0] ?? '';
      if (!isCandidate(candidate)) continue;
      counts.set(pattern.name, counts.get(pattern.name) + 1);
      matchedPaths.get(pattern.name).add(path);
    }
  }
}

const trackedPaths = gitBuffer(['ls-files', '-z']).toString('utf8').split('\0').filter(Boolean);
for (const path of trackedPaths) {
  if (environmentFilePath(path)) continue;
  try {
    const absolutePath = resolve(repositoryRoot, path);
    if (!lstatSync(absolutePath).isFile()) continue;
    inspectBuffer(readFileSync(absolutePath), path);
    worktreeFilesScanned += 1;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') continue;
    throw error;
  }
}

const commits = gitBuffer(['rev-list', '--all']).toString('utf8').trim().split(/\r?\n/).filter(Boolean);
const inspectedBlobIds = new Set();
for (const commit of commits) {
  const entries = gitBuffer(['ls-tree', '-r', '-z', '--full-tree', commit]).toString('utf8').split('\0').filter(Boolean);
  for (const entry of entries) {
    const separator = entry.indexOf('\t');
    if (separator < 0) continue;
    const [mode, type, objectId] = entry.slice(0, separator).split(' ');
    const path = entry.slice(separator + 1);
    if (type !== 'blob' || mode === '120000' || environmentFilePath(path)) continue;
    commitSnapshotsScanned += 1;
    if (inspectedBlobIds.has(objectId)) continue;
    inspectBuffer(gitBuffer(['cat-file', 'blob', objectId]), path);
    inspectedBlobIds.add(objectId);
    committedBlobsScanned += 1;
  }
}

const highConfidenceMatches = patterns
  .filter((pattern) => !pattern.reviewOnly)
  .reduce((sum, pattern) => sum + counts.get(pattern.name), 0);
const reviewOnlyMatches = patterns
  .filter((pattern) => pattern.reviewOnly)
  .reduce((sum, pattern) => sum + counts.get(pattern.name), 0);
console.log(`Tracked worktree files scanned: ${worktreeFilesScanned}`);
console.log(`Reachable commits scanned: ${commits.length}`);
console.log(`Reachable committed file snapshots scanned: ${commitSnapshotsScanned}`);
console.log(`Unique reachable blobs read (environment paths excluded): ${committedBlobsScanned}`);
for (const pattern of patterns) {
  console.log(`${pattern.reviewOnly ? 'Review-only' : 'High-confidence'} — ${pattern.name}: ${counts.get(pattern.name)}`);
  if (pattern.reviewOnly && counts.get(pattern.name) > 0) {
    console.log(`  Paths only (no matching values printed): ${[...matchedPaths.get(pattern.name)].sort().join(', ')}`);
  }
}
console.log(`High-confidence matches: ${highConfidenceMatches}`);
console.log(`Review-only matches: ${reviewOnlyMatches}`);
console.log('Scope excludes ignored/untracked files, .env paths, and all unreachable Git objects.');
console.log('This heuristic is not a dedicated scanner or proof that no secret exists.');
if (highConfidenceMatches > 0) process.exitCode = 1;
