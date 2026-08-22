import { createContext, useContext, useMemo, type ReactNode } from 'react'

/**
 * One search box for the whole Developer page.
 *
 * ## Why it is client-side, and therefore instant
 *
 * Everything the console shows is already in memory: the roster, both ledgers,
 * and the selected account's own history all arrive in one read each. Filtering
 * them is a string compare over a few hundred rows, so there is no debounce and
 * no round trip anywhere in this file. A search that waits 250ms to tell you
 * something the browser already knows is a search that feels broken.
 *
 * The roster is the one exception, and only as a bonus: it ALSO re-queries
 * Postgres on a debounce, because `tdg_admin_accounts` caps what it returns and
 * a server search can reach accounts this browser never loaded. The instant
 * local filter runs first either way, so typing never waits for it.
 *
 * ## Every word has to match, anywhere
 *
 * `luke pro` finds the row that mentions both, in any order and any field. That
 * is what you actually type when you half-remember two things about a purchase,
 * and it costs nothing over matching one word.
 */

/** Lowercase words. Every one must appear somewhere in the haystack. */
export function searchTerms(q: string): string[] {
  return q.toLowerCase().trim().split(/\s+/).filter(Boolean)
}

/** Join whatever a row or a panel is about into one string to match against. */
export function hay(...parts: (string | number | null | undefined | readonly string[])[]): string {
  return parts
    .flatMap((p) => (Array.isArray(p) ? p : [p]))
    .filter((p) => p != null && p !== '')
    .join(' ')
    .toLowerCase()
}

export function matchesTerms(haystack: string, terms: readonly string[]): boolean {
  if (terms.length === 0) return true
  const h = haystack.toLowerCase()
  return terms.every((t) => h.includes(t))
}

function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

type SearchValue = {
  /** What is in the box, verbatim, for placeholders and counts. */
  query: string
  setQuery: (q: string) => void
  /** The words to match. Empty when the box is empty. */
  terms: readonly string[]
  /** True while the box has something in it. */
  active: boolean
  /** Does this text match? True for everything when the box is empty. */
  matches: (haystack: string) => boolean
  /**
   * One regex covering every term, built once per query rather than once per
   * call. Three hundred rows times three fields is nine hundred `Highlight`s a
   * keystroke, and compiling a pattern in each of them is the one thing here
   * that could actually cost something.
   */
  rx: RegExp | null
}

const SearchContext = createContext<SearchValue | null>(null)

export function useSearch(): SearchValue {
  const ctx = useContext(SearchContext)
  if (!ctx) throw new Error('useSearch must be used within SearchProvider')
  return ctx
}

export function SearchProvider({
  query,
  setQuery,
  children,
}: {
  query: string
  setQuery: (q: string) => void
  children: ReactNode
}) {
  const value = useMemo<SearchValue>(() => {
    const terms = searchTerms(query)
    return {
      query,
      setQuery,
      terms,
      active: terms.length > 0,
      matches: (haystack) => matchesTerms(haystack, terms),
      rx: terms.length
        ? new RegExp(`(${terms.map(escapeForRegex).join('|')})`, 'i')
        : null,
    }
  }, [query, setQuery])

  return <SearchContext.Provider value={value}>{children}</SearchContext.Provider>
}

/**
 * The same text, with whatever matched picked out.
 *
 * Splitting on a capturing group interleaves the captures at the odd indices,
 * so no manual index arithmetic is needed and a term that appears twice is
 * marked both times.
 */
export function Highlight({ text }: { text: string | null | undefined }) {
  const { rx } = useSearch()
  if (!text) return null
  if (!rx) return <>{text}</>
  const parts = text.split(rx)
  if (parts.length === 1) return <>{text}</>
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="dev__mark">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  )
}
