import { defineConfig } from 'vite';

// JSX is compiled by Vite's built-in Oxc transform; no plugin (design §3.1, D19). `base: './'`
// makes every asset path relative, so the built page works when served from any path. The alias of
// the cut build (D21) is added in task 13.9.
export default defineConfig({
  root: '.',
  base: './',
  envDir: '.',
  oxc: { jsx: { runtime: 'automatic' } },
  build: { outDir: 'dist', emptyOutDir: true },
});
