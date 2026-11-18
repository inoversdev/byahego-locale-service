/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API origin, e.g. https://locale-api.example.com. Empty = same origin. */
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
