import { defineConfig } from 'vite';

// One bundled file, `dist/server.mjs`, with Core, Sensors and `magvar` inlined (design §7.4).
// Core and Sensors are imported as TypeScript source with extensionless relative imports, which
// Node cannot load directly.
export default defineConfig({
  build: {
    ssr: 'src/server.ts',
    outDir: 'dist',
    emptyOutDir: true,
    target: 'node24',
    minify: false,
    rollupOptions: { output: { entryFileNames: 'server.mjs', format: 'es' } },
  },
  ssr: { noExternal: true },
});
