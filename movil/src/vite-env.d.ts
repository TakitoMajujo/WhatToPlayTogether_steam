/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_STEAM_WEB_API_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
