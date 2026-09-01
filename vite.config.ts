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
     A deploy (manual, from the Actions tab — AGENTS.md §6) replaces every
     chunk, GitHub Pages caches index.html, and a tab left open
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

           There are seven dynamic imports: the Developer console, AppPage,
           About, the account page, a profile, the hero's PointCloud and the
           walk's CabinScene. The Developer console is the one
           this rule was written for — Vite's default would publish it as
           `DevConsole-<hash>.js`, a file name in the deployed asset list that
           announces a page most visitors should never think about. (Tidiness,
           not security: what actually keeps the console shut is that every
           function it calls refuses a non-admin in Postgres. See
           src/dev/README.md.)

           The rule is not narrowed to that one chunk, because it cannot be
           without naming it here — and a build config that has to be edited
           every time a page becomes lazy is a build config somebody forgets.
           So all seven go out anonymous. The hash is enough to cache-bust,
           which is all a chunk name is for. */
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
