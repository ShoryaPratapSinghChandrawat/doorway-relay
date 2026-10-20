import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const previewPort = Number(process.env.APP_PREVIEW_PORT ?? 5173);
if (!Number.isInteger(previewPort) || previewPort < 1 || previewPort > 65_535) {
  throw new Error('APP_PREVIEW_PORT must be a valid TCP port.');
}

const apiProxyTarget = process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:3001';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: previewPort,
    strictPort: true,
    allowedHosts: ['.e2b.app'],
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
});
