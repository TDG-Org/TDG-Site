import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/* GitHub Pages serves a project site from https://<org>.github.io/<repo>/, so a
   production build has to be rooted at /TDG-Site/. Dev stays at /, and `vite
   preview` runs in production mode, so it sees the deployed paths too.

   See src/lib/asset.ts for runtime srcSet rewriting via BASE_URL. */
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'production' ? '/TDG-Site/' : '/',
  server: { port: 5180 },
  build: {
    rollupOptions: {
      output: {
        /* Lazy chunks are named by hash alone rather than by their source file.
           The one dynamic import on this site is the Developer console, and
           Vite's default would publish it as `DevConsole-<hash>.js`, a file
           name in the deployed asset list that announces a page most visitors
           should never think about. The hash is enough to cache-bust, which is
           all a chunk name is for. (Tidiness, not security: what actually keeps
           the console shut is that every function it calls refuses a non-admin
           in Postgres. See src/dev/README.md.) */
        chunkFileNames: 'assets/[hash].js',
        /* Same reasoning for the stylesheet a chunk pulls in: Rollup names it
           after the chunk it came from, so the default would put the console
           back in the asset list as `DevConsole-<hash>.css` right beside the
           anonymous JS. Real assets like the wordmark images keep their readable
           names, because those are meant to be recognisable. */
        assetFileNames: (info) =>
          info.name?.endsWith('.css') ? 'assets/[hash][extname]' : 'assets/[name]-[hash][extname]',
      },
    },
  },
}))
