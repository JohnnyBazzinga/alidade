import { defineConfig } from 'vite';

// JSX is compiled by Vite's built-in Oxc transform; no plugin (design D1, §12). `base: './'`
// makes every asset path relative, so the built page works when served from any path.
export default defineConfig({
  root: '.',
  base: './',
  envDir: '.',
  oxc: { jsx: { runtime: 'automatic' } },
  build: { outDir: 'dist', emptyOutDir: true },
});
