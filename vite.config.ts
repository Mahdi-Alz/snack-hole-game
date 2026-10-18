import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5101, strictPort: true },
  preview: { port: 5101, strictPort: true },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    rolldownOptions: {
      output: {
        // three.js in its own chunk: game updates do not invalidate the browser's cached copy.
        codeSplitting: { groups: [{ name: 'three', test: /node_modules[\\/]three[\\/]/ }] },
      },
    },
  },
});
