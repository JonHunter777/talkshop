/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend base URL including the /api prefix, e.g. http://localhost:3000/api */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
