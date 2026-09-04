import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * `POST /__scene` — the Scene Editor's Save button, in `vite dev` only.
 *
 * ## Why the dev server writes a file at all
 *
 * The editor produces a placement draft, and a draft is only worth anything if
 * somebody can read it back: turning one into the shipped CSS means reading
 * the numbers, and the site owner has to be able to close the tab without
 * losing an hour of dragging. `localStorage` fails both — it is invisible to
 * `git status` and it belongs to one browser profile. So in dev the draft
 * lands in the working tree at `public/scene/draft.json`, where it shows up in
 * a diff like anything else and survives a restart.
 *
 * ## Why it is `apply: 'serve'` and can never reach a build
 *
 * This is an unauthenticated write endpoint. It is fine on a laptop talking to
 * its own dev server and it would be a hole on anything else, so it exists
 * only while `vite dev` is running: `apply: 'serve'` keeps it out of the
 * production plugin list entirely, and `src/scene/store.ts` guards the fetch
 * behind `import.meta.env.DEV` so a built bundle never even asks. A built
 * site's Save falls back to `localStorage` plus a Download button, and says
 * which it did rather than pretending.
 *
 * **The path is fixed here and is never taken from the request.** A
 * body-supplied filename is exactly how an endpoint like this turns into a way
 * to write anywhere on the disk, and there is one file this ever needs.
 *
 * ## Why this is a `.mjs` beside a `.d.ts` rather than part of vite.config.ts
 *
 * It needs `node:fs`. `vite.config.ts` is compiled by `npm run typecheck`
 * under the app's own tsconfig, which has no `@types/node` — and AGENTS.md §5
 * spends a page on not adding packages, which a types package for four lines
 * of file writing does not earn. Plain JavaScript needs no types, and
 * `scene-draft-plugin.d.ts` gives the import its shape at the one place it is
 * imported.
 */
export function sceneDraftPlugin() {
  const here = fileURLToPath(new URL('.', import.meta.url))
  const file = resolve(here, '..', 'public', 'scene', 'draft.json')
  return {
    name: 'tdg-scene-draft',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__scene', (req, res, next) => {
        if (req.method !== 'POST') return next()
        let body = ''
        req.setEncoding('utf8')
        req.on('data', (chunk) => {
          body += chunk
          /* A draft of a few dozen placements is a few kB. Anything past a
             megabyte is not one, and an endpoint that buffers whatever it is
             handed is a way to run the dev server out of memory. */
          if (body.length > 1_000_000) req.destroy()
        })
        req.on('end', () => {
          try {
            JSON.parse(body)
            mkdirSync(dirname(file), { recursive: true })
            writeFileSync(file, body.endsWith('\n') ? body : body + '\n', 'utf8')
            res.statusCode = 200
            res.setHeader('content-type', 'application/json')
            res.end('{"ok":true}')
          } catch {
            res.statusCode = 400
            res.setHeader('content-type', 'application/json')
            res.end('{"ok":false}')
          }
        })
      })
    },
  }
}
