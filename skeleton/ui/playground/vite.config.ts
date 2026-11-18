import { defineConfig } from 'vite';

// JSX is compiled by Vite's built-in Oxc transform; no plugin (design §3, Req 20.2). `base: './'`
// makes every asset path relative, so the built page works when served from any path.
export default defineConfig({
  root: 'playground',
  base: './',
  envDir: '..',
  oxc: { jsx: { runtime: 'automatic' } },
  build: { outDir: 'dist', emptyOutDir: true },
});
