import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { version as siteVersion } from './package.json'

/* GitHub Pages serves a project site from https://<org>.github.io/<repo>/, so a
   production build has to be rooted at /TDG-Site/. Dev stays at /, and `vite
   preview` runs in production mode, so it sees the deployed paths too.

   See src/lib/asset.ts for runtime srcSet rewriting via BASE_URL. */
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'production' ? '/TDG-Site/' : '/',
  /* package.json is this repo's only version carrier (AGENTS.md §6), so it is
     read from there and never restated: a second place to write the number is a
     second place to forget it. Two consumers today — a feedback report that
     says which deploy the reporter was on (src/feedback/api.ts), and the
     Developer page's own header (src/dev/).

     The build STAMP is here for a failure the version alone cannot catch.
     Push to main deploys, GitHub Pages caches index.html, and a tab left open
     never asks again — so a browser can be running a bundle that disagrees with
     the database it is talking to, and look completely normal doing it. That
     cost most of a day once, because there was no way to ask a page which build
     it was. A version answers it only if somebody remembered to bump; a
     timestamp answers it either way, which is the point, since the case worth
     catching is the one where a rule got skipped.

     Evaluated when the config loads, which is once per build, and once per
     `vite dev` start — so in dev it honestly reads as "this is when the server
     you are talking to came up". */
  define: {
    __TDG_SITE_VERSION__: JSON.stringify(siteVersion),
    __TDG_SITE_BUILT_AT__: JSON.stringify(new Date().toISOString()),
  },
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
