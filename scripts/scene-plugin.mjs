import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * `POST /__scene` — the Scene Editor's Save button, in `vite dev` only.
 *
 * ## Why the dev server writes a source file
 *
 * Because Save has to be real. This used to write a *draft* into `public/`,
 * which the editor fetched and drew for the one signed-in admin who had the
 * editor switched on, and which became the actual site only when a person sat
 * down and hand-wrote the equivalent CSS. The site owner had to ask for that
 * by hand — twice — before asking for the arrangement itself to go.
 *
 * So it writes `src/scene/scene.json`, which `src/scene/store.ts` imports.
 * Vite inlines it into the bundle, every visitor gets it, and the next commit
 * ships it. Pressing Save changes the page for everyone, which is what
 * pressing Save is supposed to mean.
 *
 * ## Why it is `apply: 'serve'` and can never reach a build
 *
 * This is an unauthenticated write endpoint. It is fine on a laptop talking to
 * its own dev server and it would be a hole on anything else, so it exists
 * only while `vite dev` is running: `apply: 'serve'` keeps it out of the
 * production plugin list entirely, and `src/scene/store.ts` guards the fetch
 * behind `import.meta.env.DEV` so a built bundle never even asks. A built
 * site's Save writes nothing and says so, and offers the file as a download.
 *
 * **The path is fixed here and is never taken from the request.** A
 * body-supplied filename is exactly how an endpoint like this turns into a way
 * to write anywhere on the disk, and there is one file this ever needs.
 *
 * ## Why this is a `.mjs` beside a `.d.mts` rather than part of vite.config.ts
 *
 * It needs `node:fs`. `vite.config.ts` is compiled by `npm run typecheck`
 * under the app's own tsconfig, which has no `@types/node` — and AGENTS.md §5
 * spends a page on not adding packages, which a types package for four lines
 * of file writing does not earn. Plain JavaScript needs no types, and
 * `scene-plugin.d.mts` gives the import its shape at the one place it is
 * imported.
 */
export function scenePlugin() {
  const here = fileURLToPath(new URL('.', import.meta.url))
  const file = resolve(here, '..', 'src', 'scene', 'scene.json')
  return {
    name: 'tdg-scene',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__scene', (req, res, next) => {
        if (req.method !== 'POST') return next()
        let body = ''
        req.setEncoding('utf8')
        req.on('data', (chunk) => {
          body += chunk
          /* A scene of a few dozen placements is a few kB. Anything past a
             megabyte is not one, and an endpoint that buffers whatever it is
             handed is a way to run the dev server out of memory. */
          if (body.length > 1_000_000) req.destroy()
        })
        req.on('end', () => {
          try {
            const parsed = JSON.parse(body)
            /* The file is IMPORTED by the app, so a malformed one is a build
               error rather than a missing decoration. Two cheap checks here
               are worth more than a stack trace in the browser. */
            if (!parsed || parsed.version !== 1 || !parsed.dark || !parsed.light) {
              throw new Error('not a scene document')
            }
            writeFileSync(file, JSON.stringify(parsed, null, 2) + '\n', 'utf8')
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
