/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MOTIS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
