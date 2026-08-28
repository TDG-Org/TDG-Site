import { pageForSlug, type AppPage } from '../data/appPages'
import type { SiteContentDoc } from './types'

/**
 * One product's own page, with the overlay's edits over the built-in copy.
 *
 * Its own file, and this is not tidiness. `src/data/appPages.ts` is the ten
 * pages of prose — by far the largest content file on the site — and it ships
 * in a lazy chunk that only a visitor who opens a product page ever downloads.
 * `resolve.ts` must therefore never import it, or the home page starts paying
 * for pages nobody asked for. `AppPage.tsx` is the only importer of this file,
 * so it travels in that same chunk and the split holds.
 *
 * Each stated field REPLACES the built-in one whole; see `types.ts` for why
 * arrays cannot merge. A page the overlay says nothing about is returned
 * exactly as `appPages.ts` wrote it, object identity included.
 */
export function resolvePage(doc: SiteContentDoc, slug: string): AppPage | undefined {
  const base = pageForSlug(slug)
  if (!base) return undefined
  const over = doc.items[slug]?.page
  if (!over) return base

  const out: AppPage = { ...base }
  if (over.index !== undefined) out.index = over.index
  if (over.group !== undefined) out.group = over.group
  if (over.backHash !== undefined) out.backHash = over.backHash
  if (over.backLabel !== undefined) out.backLabel = over.backLabel
  if (over.title !== undefined) out.title = over.title
  if (over.lede !== undefined) out.lede = over.lede
  if (over.intro !== undefined) out.intro = over.intro
  if (over.facts !== undefined) out.facts = over.facts
  if (over.links !== undefined) out.links = over.links
  if (over.sections !== undefined) out.sections = over.sections
  return out
}
