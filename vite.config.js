import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    assetsDir: 'static',
    chunkSizeWarningLimit: 1200,
  },
});
