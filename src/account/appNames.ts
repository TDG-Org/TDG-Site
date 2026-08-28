import { useMemo } from 'react'
import { resolvedApps } from '../content/resolve'
import { useSiteContent } from '../content/store'
import { prettyId } from './format'

/**
 * What to call an app the DATABASE named.
 *
 * `tdg_my_account_stats()` answers keyed by app id — `bea`, `veditor`,
 * `devfleet`, `tdg-site` — because that is what the rows themselves carry. A
 * page that printed those would tell somebody they have a `Bea` streak, which
 * is a Supabase column value wearing a product's clothes and is not the name
 * of anything they have ever opened.
 *
 * ## The mapping is data, and it is read through the overlay
 *
 * `backend` on each card in `src/data/content.ts` is the one place an app's
 * database id is written down beside its name (rule 1: a product's copy lives
 * in the data file). This reads it through `src/content/resolve`, never from
 * `content.ts` directly, so a product renamed from `#/dev` is renamed here in
 * the same breath — rule 1's second half, and the reason `Apps.tsx`,
 * `Tools.tsx`, `Building.tsx`, `AppPage.tsx` and `Store.tsx` all go the same
 * way.
 *
 * ## An id with no card still gets a face
 *
 * `prettyId` is the fallback, and it is not a nicety: an app that has never
 * been given a `backend`, one added by a migration after this build shipped,
 * or this site itself — which files feedback as `tdg-site` — all have real
 * rows and a reader is entitled to see them. `tdg-site` comes out as
 * `TDG Site` and `music-everything` as `Music Everything`, so the fallback is
 * usually right anyway.
 *
 * A list that dropped what it could not name would under-report what somebody
 * uses, and under-reporting is the failure nobody notices (AGENTS.md rule 17).
 */
export function useAppNames(): (appId: string) => string {
  const doc = useSiteContent()

  return useMemo(() => {
    const byBackend = new Map<string, string>()
    for (const app of resolvedApps(doc)) {
      if (app.backend) byBackend.set(app.backend, app.title)
    }
    return (appId: string) => byBackend.get(appId) ?? prettyId(appId)
  }, [doc])
}
