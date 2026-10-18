// Base URL for the Playwright scripts. With a URL (argument or BASE_URL env) they use that
// server; otherwise they start their own Vite dev server on a free port and close it when done,
// so no `npm run dev` is needed and nothing clashes with one that is already running.
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

export async function devServer(url = process.env.BASE_URL) {
  if (url) return { base: url, close: async () => {} };
  const server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    // No watcher or HMR: edits made while a script runs must not reload its page mid-test.
    server: { port: 0, strictPort: false, hmr: false, watch: null },
    clearScreen: false,
    logLevel: 'warn',
  });
  await server.listen();
  return { base: server.resolvedUrls.local[0], close: () => server.close() };
}
