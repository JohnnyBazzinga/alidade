import { defineConfig } from 'vite';

// JSX is compiled by Vite's built-in Oxc transform; no plugin (design §3, Req 20.2).
export default defineConfig({
  root: 'playground',
  envDir: '..',
  oxc: { jsx: { runtime: 'automatic' } },
  build: { outDir: 'dist', emptyOutDir: true },
});
