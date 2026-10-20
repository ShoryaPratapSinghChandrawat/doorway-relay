import 'dotenv/config';
import { join } from 'node:path';
import { RingPlaygroundError } from '../ring/playground-client.js';
import { runPlaygroundProbe } from '../ring/run-playground-probe.js';

const OUTPUT_DIRECTORY = join(process.cwd(), 'fixtures', 'ring-playground');

async function main(): Promise<void> {
  const accessToken = process.env.RING_ACCESS_TOKEN?.trim();
  if (!accessToken) throw new Error('No Playground token is configured. Set RING_ACCESS_TOKEN in the ignored local .env file.');
  if (process.env.RING_EVENT_SOURCE?.trim() !== 'ring_playground') {
    throw new Error('Set RING_EVENT_SOURCE=ring_playground in the ignored local .env file before probing.');
  }

  await runPlaygroundProbe({
    accessToken,
    apiBaseUrl: process.env.RING_API_BASE_URL?.trim() || 'https://api.amazonvision.com',
    historyDeviceId: process.env.RING_HISTORY_DEVICE_ID ?? null,
    printDeviceIds: process.env.RING_PROBE_PRINT_DEVICE_IDS?.trim().toLowerCase() === 'true',
    outputDirectory: OUTPUT_DIRECTORY,
  });
}

void main().catch((error: unknown) => {
  const message = error instanceof RingPlaygroundError
    ? error.message
    : error instanceof Error && /No Playground token|Set RING_EVENT_SOURCE|RING_HISTORY_DEVICE_ID must/.test(error.message)
      ? error.message
      : 'Probe could not complete. No token, response body, identifier, or request URL was printed.';
  console.error(message);
  process.exitCode = 1;
});
