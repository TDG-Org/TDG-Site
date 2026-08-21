import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

/**
 * Which sections of the Developer console are open.
 *
 * ## Why this is shared state rather than a `useState` per panel
 *
 * Expand All and Collapse All have to reach every section on screen, including
 * the nine inside an account's detail — panels this file never sees and that
 * mount and unmount as you click between people. So each Panel registers its id
 * here on mount, and the two buttons work from that register rather than from a
 * list somebody has to remember to update when a panel is added.
 *
 * ## Everything starts collapsed
 *
 * The page is long and most of it is not what you came for. Opening with twelve
 * expanded sections means scrolling past eight of them to reach the one you
 * wanted; opening with none means the whole page is an index you can read in a
 * glance and one click gets you in.
 *
 * ## Open sections survive an unmount, on purpose
 *
 * A section leaves the register when it unmounts but keeps its open state. So
 * expanding Identity and then clicking a different account shows Identity open
 * again — the shape you set up follows you between people instead of resetting
 * every time, which is what makes comparing two accounts bearable. Nothing is
 * persisted across a reload: every visit starts collapsed, as above.
 */
type SectionsValue = {
  isOpen: (id: string) => boolean
  toggle: (id: string) => void
  /** Called on mount; returns the matching unregister for the effect cleanup. */
  register: (id: string) => () => void
  expandAll: () => void
  collapseAll: () => void
  /** Open AND currently on screen — the count the buttons are about. */
  openCount: number
  /** How many sections are on screen at all. */
  total: number
}

const SectionsContext = createContext<SectionsValue | null>(null)

export function useSections(): SectionsValue {
  const ctx = useContext(SectionsContext)
  if (!ctx) throw new Error('useSections must be used within SectionsProvider')
  return ctx
}

export function SectionsProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set())
  /** Ids currently mounted, in mount order. */
  const [ids, setIds] = useState<readonly string[]>([])

  const register = useCallback((id: string) => {
    // The includes guard also makes this correct under StrictMode's
    // mount-unmount-mount, which would otherwise register the same id twice.
    setIds((list) => (list.includes(id) ? list : [...list, id]))
    return () => setIds((list) => list.filter((x) => x !== id))
  }, [])

  const value = useMemo<SectionsValue>(() => {
    const onScreenOpen = ids.filter((id) => open.has(id))
    return {
      isOpen: (id) => open.has(id),
      toggle: (id) =>
        setOpen((prev) => {
          const next = new Set(prev)
          if (!next.delete(id)) next.add(id)
          return next
        }),
      register,
      // Only what is on screen. Expanding all should not silently re-open a
      // section belonging to a tab you are not looking at.
      expandAll: () => setOpen((prev) => new Set([...prev, ...ids])),
      collapseAll: () =>
        setOpen((prev) => {
          const next = new Set(prev)
          for (const id of ids) next.delete(id)
          return next
        }),
      openCount: onScreenOpen.length,
      total: ids.length,
    }
  }, [open, ids, register])

  return <SectionsContext.Provider value={value}>{children}</SectionsContext.Provider>
}

/** A section id as something safe to put in an `id` attribute. */
export function sectionDomId(id: string): string {
  return `dev-sec-${id.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`
}
