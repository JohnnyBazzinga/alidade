import { defineConfig } from 'vite';

// Throwaway probe. Relative base so /probe/dist works behind any HTTPS path.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2022',
    sourcemap: false,
  },
});
