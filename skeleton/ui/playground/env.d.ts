/// <reference types="vite/client" />

// The Playground's environment (Req 18.5), documented in `skeleton/ui/.env.example`.
interface ImportMetaEnv {
  /** One or more tile URL templates with `{z}`, `{x}` and `{y}`, separated by whitespace. */
  readonly VITE_TILE_URL_TEMPLATE?: string;
  readonly VITE_TILE_ATTRIBUTION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
