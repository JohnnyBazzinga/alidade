// The address of `maplibre-gl`'s worker script (Req 15.18), imported by `maplibre-loader.ts` with
// Vite's `?url` suffix: the build copies the file beside the page's other files and the import gives
// its address, relative to the script that imports it. Declared here, not through `vite/client`; a
// package that type-checks this source (an app) lists this file in its `tsconfig.json` `include`.
declare module 'maplibre-gl/dist/maplibre-gl-worker.mjs?url' {
  const url: string;
  export default url;
}
