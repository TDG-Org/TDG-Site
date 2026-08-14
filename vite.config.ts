import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/* GitHub Pages serves a project site from https://<org>.github.io/<repo>/, so a
   production build has to be rooted at /TDG-Site/. Dev stays at / — `vite
   preview` runs in production mode, so it sees the deployed paths too.

   See src/lib/asset.ts for runtime srcSet rewriting via BASE_URL. */
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'production' ? '/TDG-Site/' : '/',
  server: { port: 5180 },
}))
