/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string
}

/** package.json's "version", baked in at build time by vite.config.ts. */
declare const __TDG_SITE_VERSION__: string
