import { useMemo } from 'react'
import { resolvedApps } from '../content/resolve'
import { useSiteContent } from '../content/store'
import { SITE_APP_ID, SITE_NAME } from '../data/content'
import { STORE_APPS } from '../data/store'
import { appHash, storeAppHash } from '../lib/route'
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
 * been given a `backend`, or one added by a migration after this build
 * shipped, has real rows and a reader is entitled to see them.
 * `music-everything` comes out as `Music Everything`, so the fallback is
 * usually right anyway.
 *
 * A list that dropped what it could not name would under-report what somebody
 * uses, and under-reporting is the failure nobody notices (AGENTS.md rule 17).
 *
 * ## This site is the one id the fallback gets WRONG
 *
 * It has no card — a catalogue does not list the shop it is printed in — so it
 * used to arrive here as `tdg-site` and leave as `TDG Site`, which was right
 * by accident for as long as the id and the name were the same word. They
 * stopped being the same word on 2026-08-31: the site is called **TDG Cebu**
 * and the id it writes rows under is still `tdg-site`, because those rows
 * already exist. Spelled out of the slug, the account page would tell somebody
 * they use an app that no longer exists under that name.
 *
 * So it is mapped explicitly, from `SITE_NAME` in `src/data/content.ts` — the
 * one place the site's own name is written down (rule 1: a product's name is
 * copy, and copy lives in the data file).
 */
export function useAppNames(): (appId: string) => string {
  const doc = useSiteContent()

  return useMemo(() => {
    const byBackend = new Map<string, string>([[SITE_APP_ID, SITE_NAME]])
    for (const app of resolvedApps(doc)) {
      if (app.backend) byBackend.set(app.backend, app.title)
    }
    return (appId: string) => byBackend.get(appId) ?? prettyId(appId)
  }, [doc])
}

/** Where an app the database named can be READ about, and bought for. */
export type AppWhere = {
  /** That app's own page on this site, or null when it has no card. */
  page: string | null
  /** That app's packs in the Store, or null when it sells nothing. */
  store: string | null
}

const NOWHERE: AppWhere = { page: null, store: null }

/**
 * Where to SEND somebody from an app the database named.
 *
 * The companion to `useAppNames`, and it exists for the same reason: the
 * account page lists apps by their database id — one row saying an account has
 * owned the Theme Pack since March — and until this it named them and stopped
 * there. A row that says you own something, with nothing on it to open, is a
 * dead end at the exact moment somebody wants to go and use the thing
 * (CLAUDE.md: a feature I cannot find is a feature I do not have).
 *
 * Both answers are DERIVED, and both may be null. `backend` on the card
 * catalogue is the id-to-page mapping, read through the overlay so a page
 * renamed from `#/dev` is renamed here too; `STORE_APPS` matched on that page
 * is whether there is a shop. An id with no card — `tdg-site` (this site), an
 * app added by a migration after this build shipped — still gets its ROW and
 * its name from
 * `useAppNames`; it simply gets no links, which is the honest answer rather
 * than a link to `#/app/undefined` (rule 17: an unknown entry gets a face, not
 * a guess).
 */
export function useAppWhere(): (appId: string) => AppWhere {
  const doc = useSiteContent()

  return useMemo(() => {
    const byBackend = new Map<string, AppWhere>()
    for (const app of resolvedApps(doc)) {
      if (!app.backend) continue
      const shop = STORE_APPS.find((s) => s.page === app.page)
      byBackend.set(app.backend, {
        page: appHash(app.page),
        store: shop ? storeAppHash(shop.id) : null,
      })
    }
    return (appId: string) => byBackend.get(appId) ?? NOWHERE
  }, [doc])
}
