/// <reference types="vite/client" />

// The build environment of the page (`.env.example`): the tile provider, from four variables.
// No host is written in the source; a build with any of them missing has the plain background.
interface ImportMetaEnv {
  /** One or more tile URL templates with `{z}`, `{x}` and `{y}`, separated by white space. */
  readonly VITE_TILE_URL_TEMPLATE?: string;
  /** The attribution the provider requires, shown on the map. */
  readonly VITE_TILE_ATTRIBUTION?: string;
  /** The provider's name, shown with its terms in the legend of the Map screen. */
  readonly VITE_TILE_SOURCE_NAME?: string;
  /** The address of the provider's terms of use, shown as text. */
  readonly VITE_TILE_TERMS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
