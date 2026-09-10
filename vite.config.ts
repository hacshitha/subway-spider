import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    host: true,
    allowedHosts: true
  },
  preview: {
    port: 4173,
    host: true,
    allowedHosts: true
  },
  build: {
    target: 'esnext',
    chunkSizeWarningLimit: 2000
  }
});
