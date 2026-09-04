import { useCallback, useEffect, useMemo, useRef, useState, type JSX, type PointerEvent as ReactPointerEvent } from 'react'
import { asset } from '../../lib/asset'
import { motionIntensity, onFrame, setMotionIntensity } from '../../lib/motion'
import { useTheme } from '../../theme/ThemeProvider'
import { measurePlacement } from '../apply'
import {
  addExtra,
  clearLocal,
  getDoc,
  loadDraft,
  patchExtra,
  patchSlot,
  saveDraft,
  setDoc,
  setEditing,
  useDoc,
} from '../store'
import { emptyDoc, SECTION_IDS, type ArtSlotInfo, type Extra, type Motion, type Placement, type SceneDoc, type SectionId, type SlotOverride } from '../types'
import './SceneEditor.css'

/**
 * The Scene Editor.
 *
 * A dock over the home page that selects, moves, resizes, retimes, duplicates,
 * deletes and adds the art. Everything it changes goes into the draft in
 * `scene/store.ts`, which is keyed by theme — so Light and Dark are two
 * documents edited one at a time, and the theme pill in the header is what
 * switches which one you are holding.
 *
 * ## It is a draft, and that is the whole arrangement
 *
 * Nothing here writes CSS. A draft is applied over the shipped stylesheet as
 * inline style while the editor is on, saved to `public/scene/draft.json`, and
 * turned into the default by hand afterwards — see `src/scene/README.md` for
 * why that last step is a person's job and not a build step. So the worst this
 * can do to the site is nothing at all: close the editor and the page is the
 * page again.
 *
 * ## Why it freezes motion by default
 *
 * Every drifting layer is somewhere other than where its stylesheet put it,
 * by up to a couple of hundred pixels, for as long as the page is anywhere but
 * the exact scroll position that zeroes it. Placing art against that is
 * placing it against a moving target, and reading a position back off it
 * records wherever it happened to have drifted to.
 *
 * `setMotionIntensity(0)` is the site's own control for this — declared in
 * `lib/motion.ts`, honoured by every hook on the page, and until now called by
 * nothing. At 0 every drift lerps to its resting position and every sway
 * reads 0,0, so what is on screen is what the CSS says. Turn Motion back on in
 * the header to watch what a piece actually does; the editor restores whatever
 * the intensity was when it opened, on the way out.
 */

type Sel = { kind: 'slot'; id: string } | { kind: 'extra'; id: string }

type ArtRow = {
  el: HTMLImageElement
  sel: Sel
  section: SectionId | null
  label: string
}

const SECTION_SELECTOR = '.hero, .origin, .apps, .tools, .games, .faith, .outro'

/** Which motions are offered, and what they are called in the panel. */
const MOTIONS: { id: Motion; label: string; hint: string }[] = [
  { id: 'still', label: 'Still', hint: 'Anchored. Moves only with the page.' },
  { id: 'drift', label: 'Scroll Drift', hint: 'Slides against its own distance from the middle of the screen.' },
  { id: 'sway', label: 'Cursor Sway', hint: 'Follows the mouse. Best on a near-foreground piece.' },
  { id: 'hero', label: 'Hero Ride', hint: 'Sinks with the hero instead of against it. Hero only.' },
]

export default function SceneEditor({ onClose }: { onClose: () => void }): JSX.Element {
  const { theme, toggle } = useTheme()
  const doc = useDoc()
  const [sel, setSel] = useState<Sel | null>(null)
  const [tab, setTab] = useState<'piece' | 'library' | 'layers'>('piece')
  const [pick, setPick] = useState(true)
  const [frozen, setFrozen] = useState(true)
  const [manifest, setManifest] = useState<ArtSlotInfo[] | null>(null)
  const [status, setStatus] = useState<string>('Loading draft…')
  const [dirty, setDirty] = useState(false)
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState(false)
  const history = useRef<SceneDoc[]>([])

  /* ── boot: load the draft, take the page over, and hand it back ────────── */
  useEffect(() => {
    let live = true
    const previousIntensity = motionIntensity()
    setMotionIntensity(0)
    void loadDraft().then((d) => {
      if (!live) return
      setDoc(d)
      setEditing(true)
      const n = count(d)
      setStatus(n === 0 ? 'Empty draft. Click a piece to start.' : `Draft loaded — ${n} edits.`)
    })
    return () => {
      live = false
      setEditing(false)
      setDoc(null)
      setMotionIntensity(previousIntensity)
    }
  }, [])

  useEffect(() => {
    setMotionIntensity(frozen ? 0 : 1)
  }, [frozen])

  useEffect(() => {
    document.documentElement.setAttribute('data-scene-edit', 'on')
    return () => document.documentElement.removeAttribute('data-scene-edit')
  }, [])

  /* The library index. Fetched rather than imported so it costs the main
     bundle nothing — see scripts/art-manifest.mjs. */
  useEffect(() => {
    let live = true
    void fetch(asset('assets/parallax/manifest.json'))
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (live && j?.slots) setManifest(j.slots as ArtSlotInfo[])
      })
      .catch(() => {
        if (live) setManifest([])
      })
    return () => {
      live = false
    }
  }, [])

  /* ── every mutation goes through here, so undo is free ─────────────────── */
  const commit = useCallback((fn: () => void) => {
    const before = getDoc()
    if (before) {
      history.current.push(before)
      if (history.current.length > 80) history.current.shift()
    }
    fn()
    setDirty(true)
  }, [])

  const undo = useCallback(() => {
    const prev = history.current.pop()
    if (!prev) {
      setStatus('Nothing to undo.')
      return
    }
    setDoc(prev)
    setDirty(true)
    setStatus('Undone.')
  }, [])

  /* ── the current selection, resolved against the live DOM ──────────────── */
  const selEl = useCallback((s: Sel | null): HTMLImageElement | null => {
    if (!s) return null
    const q = s.kind === 'slot' ? `[data-slot="${cssEscape(s.id)}"]` : `[data-extra="${cssEscape(s.id)}"]`
    return document.querySelector<HTMLImageElement>(q)
  }, [])

  const override: SlotOverride | Extra | undefined = useMemo(() => {
    if (!doc || !sel) return undefined
    return sel.kind === 'slot' ? doc[theme].slots[sel.id] : doc[theme].extras.find((e) => e.id === sel.id)
  }, [doc, sel, theme])

  /** Write a patch to whichever kind of thing is selected. */
  const patchSelected = useCallback(
    (patch: Partial<Extra>) => {
      if (!sel) return
      commit(() => {
        if (sel.kind === 'slot') patchSlot(theme, sel.id, patch as Partial<SlotOverride>)
        else patchExtra(theme, sel.id, patch)
      })
    },
    [commit, sel, theme],
  )

  /**
   * The placement a drag starts from.
   *
   * If the draft already holds x/y/w for this piece, those are the truth. If it
   * does not — the first time anything touches a shipped piece — the live
   * element is measured, so the very first pixel of movement is relative to
   * where the stylesheet actually put it rather than to a corner.
   */
  const basePlacement = useCallback(
    (s: Sel): Required<Pick<Placement, 'x' | 'y' | 'w'>> | null => {
      const el = selEl(s)
      if (!el) return null
      const d = getDoc()
      const held = d ? (s.kind === 'slot' ? d[theme].slots[s.id] : d[theme].extras.find((e) => e.id === s.id)) : undefined
      const measured = measurePlacement(el)
      return {
        x: held?.x ?? measured.x,
        y: held?.y ?? measured.y,
        /* A slot the stylesheet is not drawing measures 0 wide, and a drag
           that started from that would write `width: 0vw` and make the piece
           permanently invisible — a hidden thing turned into a broken thing.
           18vw is the same size a piece dropped from the library lands at. */
        w: held?.w ?? (measured.w > 0.5 ? measured.w : 18),
      }
    },
    [selEl, theme],
  )

  /* ── keyboard ──────────────────────────────────────────────────────────── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.key === 'Escape') {
        if (sel) setSel(null)
        else onClose()
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        undo()
        return
      }
      if (!sel) return
      const step = e.shiftKey ? 10 : 1
      const arrows: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      }
      const move = arrows[e.key]
      if (move) {
        e.preventDefault()
        const el = selEl(sel)
        const base = basePlacement(sel)
        if (!el || !base) return
        const parent = ((el.offsetParent as HTMLElement | null) ?? document.documentElement).getBoundingClientRect()
        patchSelected({
          x: base.x + (move[0] / (parent.width || 1)) * 100,
          y: base.y + (move[1] / (parent.height || 1)) * 100,
          w: base.w,
        })
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        remove()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, undo, onClose, basePlacement, patchSelected, selEl])

  /* ── actions ───────────────────────────────────────────────────────────── */

  const remove = useCallback(() => {
    if (!sel) return
    commit(() => {
      if (sel.kind === 'slot') patchSlot(theme, sel.id, { hidden: true })
      else patchExtra(theme, sel.id, null)
    })
    if (sel.kind === 'extra') setSel(null)
    setStatus(sel.kind === 'slot' ? 'Hidden. Reset brings it back.' : 'Deleted.')
  }, [commit, sel, theme])

  const duplicate = useCallback(() => {
    if (!sel) return
    const el = selEl(sel)
    const base = basePlacement(sel)
    if (!el || !base) return
    const section = sectionOf(el)
    const art = artNameOf(el, theme)
    if (!art || !section) {
      setStatus('Could not read that piece to copy it.')
      return
    }
    const src = override
    const id = `x${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`
    const copy: Extra = {
      id,
      section,
      art,
      motion: src?.motion ?? motionOf(el),
      factor: src?.factor,
      swayX: src?.swayX,
      swayY: src?.swayY,
      x: base.x + 2,
      y: base.y + 2,
      w: base.w,
      opacity: src?.opacity ?? (Number(getComputedStyle(el).opacity) || undefined),
      z: src?.z,
      rotate: src?.rotate,
      flip: src?.flip,
      label: `${labelOf(el)} copy`,
    }
    commit(() => addExtra(theme, copy))
    setSel({ kind: 'extra', id })
    setStatus('Duplicated. It is a new piece — delete removes it for good.')
  }, [basePlacement, commit, override, sel, selEl, theme])

  const reset = useCallback(() => {
    if (!sel) return
    if (sel.kind === 'extra') {
      remove()
      return
    }
    commit(() => patchSlot(theme, sel.id, null))
    setStatus('Back to the shipped placement.')
  }, [commit, remove, sel, theme])

  const save = useCallback(async () => {
    const d = getDoc() ?? emptyDoc()
    setStatus('Saving…')
    const res = await saveDraft(d)
    setDirty(false)
    setStatus(
      res.where === 'repo'
        ? `Saved to ${res.detail}. It is in the working tree.`
        : `Saved to ${res.detail}. Use Download to get the file out.`,
    )
  }, [])

  const download = useCallback(() => {
    const d = getDoc() ?? emptyDoc()
    const blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'scene-draft.json'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setStatus('Downloaded scene-draft.json.')
  }, [])

  const revert = useCallback(() => {
    commit(() => setDoc(emptyDoc()))
    clearLocal()
    setSel(null)
    setStatus('Draft cleared. Nothing saved until you press Save.')
  }, [commit])

  /* ── dropping a piece in from the library ──────────────────────────────── */
  const pendingDrop = useRef<{ id: string; x: number; y: number } | null>(null)

  const dropArt = useCallback(
    (name: string, clientX: number, clientY: number) => {
      /* `elementsFromPoint`, not `elementFromPoint`. The pick sheet is a
         fixed box over the whole viewport, so the singular call returns the
         SHEET every time and the section under the cursor is never found —
         which read exactly like the drop silently doing nothing. The plural
         call hands back the whole stack at that point, in paint order, and
         the first entry that is inside a section is the answer. */
      const section = document
        .elementsFromPoint(clientX, clientY)
        .map((n) => (n as HTMLElement).closest?.(SECTION_SELECTOR) as HTMLElement | null)
        .find((n): n is HTMLElement => Boolean(n)) ?? null
      const id = sectionIdOf(section)
      if (!id) {
        setStatus('Drop it over one of the page sections.')
        return
      }
      const key = `x${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`
      commit(() =>
        addExtra(theme, {
          id: key,
          section: id,
          art: name,
          motion: 'still',
          /* No `z`, so it lands in FRONT of the section it was dropped on.
             `z: -1` was the first answer — scenery usually wants to be behind
             the words — and it is the wrong default for exactly the reason a
             render caught: the host is the last child of its section, so -1
             put a freshly dropped palm behind the palm row that was already
             there and the drop looked like it had done nothing. A piece you
             cannot see is a piece you cannot place. Depth z is one field away
             on the panel, and its hint says what -1 does. */
          w: 18,
          label: name.split('/').pop(),
        }),
      )
      pendingDrop.current = { id: key, x: clientX, y: clientY }
      setSel({ kind: 'extra', id: key })
      setTab('piece')
      setStatus(`Added ${name} to #${id}.`)
    },
    [commit, theme],
  )

  /* The piece exists after the next render; centre it under the cursor then,
     when it has a box to measure. Doing this in the drop handler would be
     measuring an element that does not exist yet. */
  useEffect(() => {
    const p = pendingDrop.current
    if (!p) return
    const el = document.querySelector<HTMLImageElement>(`[data-extra="${cssEscape(p.id)}"]`)
    if (!el) return
    pendingDrop.current = null
    const place = () => {
      const parent = ((el.offsetParent as HTMLElement | null) ?? document.documentElement).getBoundingClientRect()
      const r = el.getBoundingClientRect()
      patchExtra(theme, p.id, {
        x: ((p.x - r.width / 2 - parent.left) / (parent.width || 1)) * 100,
        y: ((p.y - r.height / 2 - parent.top) / (parent.height || 1)) * 100,
      })
    }
    if (el.complete && el.naturalWidth) place()
    else el.addEventListener('load', place, { once: true })
  })

  /* ── the rows the Layers tab and the hit test both read ────────────────── */
  const rows = useCallback((): ArtRow[] => {
    const out: ArtRow[] = []
    for (const el of document.querySelectorAll<HTMLImageElement>('.scene__art')) {
      const extraId = el.dataset.extra
      const slot = el.dataset.slot
      const s: Sel | null = extraId ? { kind: 'extra', id: extraId } : slot ? { kind: 'slot', id: slot } : null
      if (!s) continue
      out.push({ el, sel: s, section: sectionOf(el), label: labelOf(el) })
    }
    return out
  }, [])

  return (
    <>
      {pick && (
        <PickLayer
          rows={rows}
          sel={sel}
          onSelect={setSel}
          onDragStart={(s) => basePlacement(s)}
          onDragMove={(s, base, dx, dy) => {
            const el = selEl(s)
            if (!el) return
            const parent = ((el.offsetParent as HTMLElement | null) ?? document.documentElement).getBoundingClientRect()
            const patch = {
              x: base.x + (dx / (parent.width || 1)) * 100,
              y: base.y + (dy / (parent.height || 1)) * 100,
              w: base.w,
            }
            if (s.kind === 'slot') patchSlot(theme, s.id, patch)
            else patchExtra(theme, s.id, patch)
          }}
          onDragEnd={() => setDirty(true)}
          onDragCommit={commit}
          onResize={(s, base, dw) => {
            const patch = { x: base.x, y: base.y, w: Math.max(1, base.w + (dw / (window.innerWidth || 1)) * 100) }
            if (s.kind === 'slot') patchSlot(theme, s.id, patch)
            else patchExtra(theme, s.id, patch)
          }}
          onDropArt={dropArt}
        />
      )}

      <aside className={`sceneed${collapsed ? ' sceneed--collapsed' : ''}`} aria-label="Scene Editor">
        <header className="sceneed__head">
          <button
            type="button"
            className="sceneed__fold"
            onClick={() => setCollapsed((c) => !c)}
            aria-expanded={!collapsed}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? '›' : '‹'}
          </button>
          <span className="sceneed__title">Scene Editor</span>
          <button type="button" className="sceneed__x" onClick={onClose} title="Close (Esc)">
            ✕
          </button>
        </header>

        {!collapsed && (
          <>
            <div className="sceneed__bar">
              <button
                type="button"
                className="sceneed__theme"
                onClick={(e) => toggle(e)}
                title="Light and Dark are two separate drafts. This switches which one you are editing."
              >
                <span className={`sceneed__theme-half${theme === 'light' ? ' is-on' : ''}`}>Light</span>
                <span className={`sceneed__theme-half${theme === 'dark' ? ' is-on' : ''}`}>Dark</span>
              </button>
              <Toggle label="Pick" on={pick} onChange={setPick} title="Click the page to select art. Off to use the page normally." />
              <Toggle label="Motion" on={!frozen} onChange={(v) => setFrozen(!v)} title="Frozen while you place things. Turn on to watch the motion you set." />
            </div>

            <nav className="sceneed__tabs">
              {(['piece', 'library', 'layers'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`sceneed__tab${tab === t ? ' is-on' : ''}`}
                  onClick={() => setTab(t)}
                >
                  {t === 'piece' ? 'Piece' : t === 'library' ? 'Library' : 'Layers'}
                </button>
              ))}
            </nav>

            <div className="sceneed__body">
              {tab === 'piece' && (
                <PiecePanel
                  sel={sel}
                  el={selEl(sel)}
                  override={override}
                  onPatch={patchSelected}
                  onDuplicate={duplicate}
                  onRemove={remove}
                  onReset={reset}
                  basePlacement={basePlacement}
                />
              )}
              {tab === 'library' && (
                <LibraryPanel
                  manifest={manifest}
                  theme={theme}
                  query={query}
                  onQuery={setQuery}
                  onPick={(name) =>
                    dropArt(name, window.innerWidth / 2 - 180, window.innerHeight / 2)
                  }
                />
              )}
              {tab === 'layers' && (
                <LayersPanel
                  rows={rows}
                  sel={sel}
                  /* Picking a row moves you to the controls for it. Without
                     this, selecting a slot the theme does not draw left you
                     looking at the list with its "Draw It" button one
                     un-signposted tab away — a selection that did nothing
                     visible, which is the whole failure this panel is for. */
                  onSelect={(s) => {
                    setSel(s)
                    setTab('piece')
                  }}
                  doc={doc}
                  theme={theme}
                />
              )}
            </div>

            <footer className="sceneed__foot">
              <p className="sceneed__status" role="status">
                {status}
              </p>
              <div className="sceneed__actions">
                <button type="button" className="sceneed__btn" onClick={undo} title="Ctrl+Z">
                  Undo
                </button>
                <button type="button" className="sceneed__btn" onClick={download}>
                  Download
                </button>
                <button type="button" className="sceneed__btn sceneed__btn--danger" onClick={revert}>
                  Clear
                </button>
                <button
                  type="button"
                  className={`sceneed__btn sceneed__btn--go${dirty ? ' is-dirty' : ''}`}
                  onClick={() => void save()}
                >
                  {dirty ? 'Save •' : 'Save'}
                </button>
              </div>
            </footer>
          </>
        )}
      </aside>
    </>
  )
}

/* ══ the pick layer ═══════════════════════════════════════════════════════ */

/**
 * The transparent sheet over the page that turns a click into a selection and
 * a drag into a placement.
 *
 * ## Why a sheet rather than `pointer-events` on the art
 *
 * Every piece of the kit is `pointer-events: none` in `Scene.css`, and turning
 * that off in edit mode would work for clicking and break everything else:
 * the art sits over the copy in several sections, so the page's own links and
 * buttons would stop answering the moment the editor opened. A sheet keeps the
 * decision in one place — Pick on, the sheet is there and the page is a canvas;
 * Pick off, the sheet is gone and the page is a page.
 *
 * Wheel events are not captured, so scrolling works through it exactly as it
 * would if the sheet were not there. That matters more than it sounds: placing
 * art means scrolling to the beat you are placing it in.
 *
 * ## Picking through transparency
 *
 * A cutout of a palm is mostly nothing, and hit-testing its rectangle picks it
 * from half a section away. So a candidate whose `object-fit` is the default
 * gets its actual pixel tested — one `drawImage` of a single source pixel into
 * a 1x1 canvas and one `getImageData` — and is skipped when the alpha there is
 * near zero. Pieces with `object-fit: cover` (the band plates) keep the
 * rectangle test, because their source-to-box mapping is a crop this does not
 * try to invert; they are edge-to-edge bands anyway, so the rectangle is very
 * nearly the truth.
 *
 * Clicking the same spot twice steps DOWN the stack, which is how you reach
 * the sea behind the palm without hiding the palm first.
 */
function PickLayer({
  rows,
  sel,
  onSelect,
  onDragStart,
  onDragMove,
  onDragEnd,
  onDragCommit,
  onResize,
  onDropArt,
}: {
  rows: () => ArtRow[]
  sel: Sel | null
  onSelect: (s: Sel | null) => void
  onDragStart: (s: Sel) => Required<Pick<Placement, 'x' | 'y' | 'w'>> | null
  onDragMove: (s: Sel, base: Required<Pick<Placement, 'x' | 'y' | 'w'>>, dx: number, dy: number) => void
  onDragEnd: () => void
  onDragCommit: (fn: () => void) => void
  onResize: (s: Sel, base: Required<Pick<Placement, 'x' | 'y' | 'w'>>, dw: number) => void
  onDropArt: (name: string, x: number, y: number) => void
}): JSX.Element {
  const box = useRef<HTMLDivElement | null>(null)
  const hover = useRef<HTMLDivElement | null>(null)
  const lastPick = useRef<{ x: number; y: number; index: number }>({ x: -1, y: -1, index: 0 })
  const drag = useRef<
    | null
    | {
        sel: Sel
        base: Required<Pick<Placement, 'x' | 'y' | 'w'>>
        startX: number
        startY: number
        mode: 'move' | 'size'
      }
  >(null)

  /* The two outlines follow the page from inside the site's one frame loop —
     rule 9, and it is also the only thing that keeps a box glued to a layer
     that is drifting while Motion is on. `hold()` while the editor is open,
     because a box that stops following when the loop parks is a box that lies. */
  useEffect(() => {
    return onFrame(({ hold }) => {
      hold()
      const selected = sel
        ? document.querySelector<HTMLElement>(
            sel.kind === 'slot' ? `[data-slot="${cssEscape(sel.id)}"]` : `[data-extra="${cssEscape(sel.id)}"]`,
          )
        : null
      const r = selected?.getBoundingClientRect() ?? null
      return () => {
        const el = box.current
        if (!el) return
        if (!r) {
          el.style.display = 'none'
          return
        }
        el.style.display = 'block'
        el.style.translate = `${r.left}px ${r.top}px`
        el.style.width = `${r.width}px`
        el.style.height = `${r.height}px`
      }
    })
  }, [sel])

  const hit = useCallback(
    (x: number, y: number, cycle: boolean): Sel | null => {
      const candidates = rows().filter((row) => {
        const r = row.el.getBoundingClientRect()
        if (x < r.left || x > r.right || y < r.top || y > r.bottom) return false
        if (r.width < 2 || r.height < 2) return false
        return opaqueAt(row.el, x, y)
      })
      if (candidates.length === 0) return null
      /* Nearest to the front: z-index first, DOM order second, which is the
         order the browser painted them in. */
      candidates.sort((a, b) => {
        const za = Number(getComputedStyle(a.el).zIndex) || 0
        const zb = Number(getComputedStyle(b.el).zIndex) || 0
        if (za !== zb) return zb - za
        return a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? 1 : -1
      })
      /* Only a real pick moves the cycle on. The hover test calls this on
         every pointer move, and letting THAT write `lastPick` meant the first
         click at any point was always already "the second click there" — it
         selected the layer behind the one under the cursor, every time. Found
         by clicking a palm crown and being handed the sand behind it. */
      if (!cycle) return candidates[0].sel
      const near = Math.abs(x - lastPick.current.x) < 4 && Math.abs(y - lastPick.current.y) < 4
      const index = near ? (lastPick.current.index + 1) % candidates.length : 0
      lastPick.current = { x, y, index }
      return candidates[index].sel
    },
    [rows],
  )

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    const onHandle = (e.target as HTMLElement).classList.contains('sceneed__handle')
    if (onHandle && sel) {
      const base = onDragStart(sel)
      if (!base) return
      onDragCommit(() => {})
      drag.current = { sel, base, startX: e.clientX, startY: e.clientY, mode: 'size' }
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      return
    }
    const found = hit(e.clientX, e.clientY, true)
    onSelect(found)
    if (!found) return
    const base = onDragStart(found)
    if (!base) return
    /* One history entry per drag, taken before the first pixel — otherwise a
       drag across the screen is four hundred undo steps. */
    onDragCommit(() => {})
    drag.current = { sel: found, base, startX: e.clientX, startY: e.clientY, mode: 'move' }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) {
      const found = hit(e.clientX, e.clientY, false)
      const el = hover.current
      if (el) {
        const target = found
          ? document.querySelector<HTMLElement>(
              found.kind === 'slot' ? `[data-slot="${cssEscape(found.id)}"]` : `[data-extra="${cssEscape(found.id)}"]`,
            )
          : null
        const r = target?.getBoundingClientRect()
        if (r) {
          el.style.display = 'block'
          el.style.translate = `${r.left}px ${r.top}px`
          el.style.width = `${r.width}px`
          el.style.height = `${r.height}px`
        } else {
          el.style.display = 'none'
        }
      }
      return
    }
    if (d.mode === 'size') {
      onResize(d.sel, d.base, e.clientX - d.startX)
      return
    }
    let dx = e.clientX - d.startX
    let dy = e.clientY - d.startY
    if (e.shiftKey) {
      if (Math.abs(dx) > Math.abs(dy)) dy = 0
      else dx = 0
    }
    onDragMove(d.sel, d.base, dx, dy)
  }

  const endDrag = () => {
    if (!drag.current) return
    drag.current = null
    onDragEnd()
  }

  return (
    <div
      className="sceneed__pick"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('text/tdg-art')) e.preventDefault()
      }}
      onDrop={(e) => {
        const name = e.dataTransfer.getData('text/tdg-art')
        if (!name) return
        e.preventDefault()
        onDropArt(name, e.clientX, e.clientY)
      }}
    >
      <div ref={hover} className="sceneed__hover" />
      <div ref={box} className="sceneed__sel">
        <span className="sceneed__handle" />
      </div>
    </div>
  )
}

/* ══ the panels ═══════════════════════════════════════════════════════════ */

function PiecePanel({
  sel,
  el,
  override,
  onPatch,
  onDuplicate,
  onRemove,
  onReset,
  basePlacement,
}: {
  sel: Sel | null
  el: HTMLImageElement | null
  override: SlotOverride | Extra | undefined
  onPatch: (p: Partial<Extra>) => void
  onDuplicate: () => void
  onRemove: () => void
  onReset: () => void
  basePlacement: (s: Sel) => Required<Pick<Placement, 'x' | 'y' | 'w'>> | null
}): JSX.Element {
  if (!sel) {
    return (
      <div className="sceneed__empty">
        <p>
          <strong>Click any piece of art</strong> on the page to select it. Click the same spot again
          to step behind it.
        </p>
        <p>
          Drag to move · Shift-drag for one axis · the corner handle resizes · arrows nudge, with
          Shift for ten · Delete hides · Ctrl+Z undoes.
        </p>
        <p>
          Light and Dark are two separate drafts. Switch with the pill above and edit the other one.
        </p>
      </div>
    )
  }
  const place = basePlacement(sel)
  const motion = override?.motion ?? (el ? motionOf(el) : 'still')
  const isExtra = sel.kind === 'extra'
  const inHero = el ? sectionOf(el) === 'hero' : false
  /* Selected but not on screen, because this theme's stylesheet says
     `display: none` — the whole Cebu clearance is written that way, so a third
     of the Layers list is in this state. Without a face and a button it is a
     selection that does nothing, which is worse than not listing it. */
  const notDrawn =
    !override?.shown && Boolean(el) && getComputedStyle(el as HTMLElement).display === 'none'

  return (
    <div className="sceneed__panel">
      <div className="sceneed__id">
        {/* Every added piece carries the same class, so `labelOf` would call
            them all `scene__extra`. The draft knows what it actually is. */}
        <span className="sceneed__id-name">
          {isExtra
            ? ((override as Extra | undefined)?.label ?? (override as Extra | undefined)?.art ?? sel.id)
            : el
              ? labelOf(el)
              : sel.id}
        </span>
        <span className="sceneed__id-meta">
          {isExtra ? 'added' : 'shipped'} · {el ? (sectionOf(el) ?? '—') : '—'}
        </span>
        <span className="sceneed__id-file">{el ? fileOf(el) : ''}</span>
      </div>

      {notDrawn && (
        <div className="sceneed__offnote">
          <p>
            <strong>Not drawn in this theme.</strong> Its stylesheet hides it here. Draw it and it
            comes back where its own CSS puts it — then move it from there.
          </p>
          <button type="button" className="sceneed__btn" onClick={() => onPatch({ shown: true, hidden: false })}>
            Draw It
          </button>
        </div>
      )}

      <Field label="Motion">
        <div className="sceneed__motions">
          {MOTIONS.filter((m) => m.id !== 'hero' || inHero).map((m) => (
            <button
              key={m.id}
              type="button"
              className={`sceneed__chip${motion === m.id ? ' is-on' : ''}`}
              title={m.hint}
              onClick={() => onPatch({ motion: m.id })}
            >
              {m.label}
            </button>
          ))}
        </div>
      </Field>

      {(motion === 'drift' || motion === 'hero') && (
        <Num
          label="Drift amount"
          value={override?.factor ?? 0.06}
          min={-0.4}
          max={0.4}
          step={0.005}
          onChange={(v) => onPatch({ factor: v })}
          hint="Negative is nearer to you — it moves against the page harder."
        />
      )}
      {motion === 'sway' && (
        <>
          <Num label="Sway across" value={override?.swayX ?? 12} min={0} max={80} step={1} onChange={(v) => onPatch({ swayX: v })} />
          <Num label="Sway down" value={override?.swayY ?? 7} min={0} max={80} step={1} onChange={(v) => onPatch({ swayY: v })} />
        </>
      )}

      <div className="sceneed__grid">
        <Num label="X %" value={place?.x ?? 0} min={-120} max={220} step={0.1} onChange={(v) => place && onPatch({ x: v, y: place.y, w: place.w })} />
        <Num label="Y %" value={place?.y ?? 0} min={-120} max={220} step={0.1} onChange={(v) => place && onPatch({ y: v, x: place.x, w: place.w })} />
        <Num label="Width vw" value={place?.w ?? 20} min={1} max={200} step={0.2} onChange={(v) => place && onPatch({ w: v, x: place.x, y: place.y })} />
        <Num
          label="Opacity"
          value={override?.opacity ?? (el ? Number(getComputedStyle(el).opacity) : 1)}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => onPatch({ opacity: v })}
        />
        <Num label="Rotate °" value={override?.rotate ?? 0} min={-180} max={180} step={1} onChange={(v) => onPatch({ rotate: v })} />
        <Num label="Depth z" value={override?.z ?? 0} min={-5} max={30} step={1} onChange={(v) => onPatch({ z: v })} hint="-1 sits behind the words." />
      </div>

      <Field label="Mirror">
        <Toggle label="Flip across" on={Boolean(override?.flip)} onChange={(v) => onPatch({ flip: v })} />
      </Field>

      {/* An ADDED piece has no shipped placement to go back to, so Reset and
          Delete would be the same button twice — which is what the first
          render showed, two buttons both saying Delete. A shipped piece gets
          all three: Reset drops the draft's override, Hide keeps the override
          and draws nothing. */}
      <div className="sceneed__row">
        <button type="button" className="sceneed__btn" onClick={onDuplicate}>
          Duplicate
        </button>
        {!isExtra && (
          <button type="button" className="sceneed__btn" onClick={onReset}>
            Reset
          </button>
        )}
        <button type="button" className="sceneed__btn sceneed__btn--danger" onClick={onRemove}>
          {isExtra ? 'Delete' : 'Hide'}
        </button>
      </div>
    </div>
  )
}

function LibraryPanel({
  manifest,
  theme,
  query,
  onQuery,
  onPick,
}: {
  manifest: ArtSlotInfo[] | null
  theme: 'dark' | 'light'
  query: string
  onQuery: (q: string) => void
  onPick: (name: string) => void
}): JSX.Element {
  if (manifest === null) return <p className="sceneed__note">Reading the art kit…</p>
  if (manifest.length === 0)
    return (
      <p className="sceneed__note">
        No manifest. Run <code>npm run art:manifest</code> and reload.
      </p>
    )
  const q = query.trim().toLowerCase()
  const shown = manifest.filter((s) => (q ? s.name.toLowerCase().includes(q) : true))
  return (
    <div className="sceneed__lib">
      <input
        className="sceneed__search"
        type="search"
        value={query}
        placeholder={`Search ${manifest.length} pieces`}
        onChange={(e) => onQuery(e.target.value)}
      />
      <p className="sceneed__note">
        Drag one onto the page, or click to drop it in the middle. It lands in whichever section it
        is over.
      </p>
      <div className="sceneed__tiles">
        {shown.map((s) => {
          const has = theme === 'light' ? s.light : s.dark
          return (
            <button
              key={s.name}
              type="button"
              className={`sceneed__tile${has ? '' : ' is-missing'}`}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('text/tdg-art', s.name)
                e.dataTransfer.effectAllowed = 'copy'
              }}
              onClick={() => onPick(s.name)}
              title={has ? s.name : `${s.name} — no ${theme} file, it will draw nothing in this theme`}
            >
              <img
                src={asset(`assets/parallax/${s.name}-${has ? theme : theme === 'light' ? 'dark' : 'light'}.webp`)}
                alt=""
                loading="lazy"
                decoding="async"
              />
              <span>{s.name.split('/').pop()}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function LayersPanel({
  rows,
  sel,
  onSelect,
  doc,
  theme,
}: {
  rows: () => ArtRow[]
  sel: Sel | null
  onSelect: (s: Sel) => void
  doc: SceneDoc | null
  theme: 'dark' | 'light'
}): JSX.Element {
  const [, bump] = useState(0)
  useEffect(() => {
    const t = window.setInterval(() => bump((n) => n + 1), 700)
    return () => window.clearInterval(t)
  }, [])
  const all = rows()
  const hiddenSlots = doc ? Object.entries(doc[theme].slots).filter(([, v]) => v.hidden) : []
  return (
    <div className="sceneed__layers">
      {SECTION_IDS.map((id) => {
        const mine = all.filter((r) => r.section === id)
        if (mine.length === 0) return null
        return (
          <section key={id} className="sceneed__layer-group">
            <h3>#{id}</h3>
            {mine.map((r) => {
              const on = sel && sel.kind === r.sel.kind && sel.id === r.sel.id
              /* A slot this theme does not draw is still listed — it can be
                 brought back from the Piece tab — but it says so rather than
                 looking like a layer that is simply somewhere else. */
              const off = getComputedStyle(r.el).display === 'none'
              return (
                <button
                  key={`${r.sel.kind}:${r.sel.id}`}
                  type="button"
                  className={`sceneed__layer${on ? ' is-on' : ''}${off ? ' is-off' : ''}`}
                  onClick={() => onSelect(r.sel)}
                >
                  <span className="sceneed__layer-name">{r.label}</span>
                  <span className="sceneed__layer-kind">
                    {r.sel.kind === 'extra' ? 'added' : off ? 'not drawn' : ''}
                  </span>
                </button>
              )
            })}
          </section>
        )
      })}
      {hiddenSlots.length > 0 && (
        <section className="sceneed__layer-group">
          <h3>Hidden in {theme}</h3>
          {hiddenSlots.map(([id]) => (
            <button
              key={id}
              type="button"
              className="sceneed__layer is-hidden"
              onClick={() => onSelect({ kind: 'slot', id })}
            >
              <span className="sceneed__layer-name">{id}</span>
              <span className="sceneed__layer-kind">hidden</span>
            </button>
          ))}
        </section>
      )}
    </div>
  )
}

/* ══ small controls, custom-styled like everything else here (rule 5) ═════ */

function Field({ label, children }: { label: string; children: JSX.Element }): JSX.Element {
  return (
    <div className="sceneed__field">
      <span className="sceneed__label">{label}</span>
      {children}
    </div>
  )
}

function Toggle({
  label,
  on,
  onChange,
  title,
}: {
  label: string
  on: boolean
  onChange: (v: boolean) => void
  title?: string
}): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className={`sceneed__toggle${on ? ' is-on' : ''}`}
      onClick={() => onChange(!on)}
      title={title}
    >
      <span className="sceneed__toggle-label">{label}</span>
      <span className="sceneed__toggle-track" aria-hidden="true">
        <span className="sceneed__toggle-knob" />
      </span>
    </button>
  )
}

function Num({
  label,
  value,
  min,
  max,
  step,
  onChange,
  hint,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  hint?: string
}): JSX.Element {
  return (
    <label className="sceneed__num" title={hint}>
      <span className="sceneed__label">{label}</span>
      <input
        type="number"
        value={Number.isFinite(value) ? Number(value.toFixed(3)) : 0}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const v = Number(e.target.value)
          if (Number.isFinite(v)) onChange(v)
        }}
      />
    </label>
  )
}

/* ══ reading the page ═════════════════════════════════════════════════════ */

function sectionOf(el: HTMLElement): SectionId | null {
  return sectionIdOf(el.closest(SECTION_SELECTOR) as HTMLElement | null)
}

function sectionIdOf(node: HTMLElement | null): SectionId | null {
  if (!node) return null
  for (const id of SECTION_IDS) if (node.classList.contains(id)) return id
  return null
}

/** The class the piece was declared with, minus the kit's own two. */
function labelOf(el: HTMLElement): string {
  const own = [...el.classList].filter((c) => c !== 'scene__art' && c !== 'scene__art--moves')
  return own.join(' ') || el.dataset.extra || 'piece'
}

/** `props/coconut-palm-tall-light.webp` -> the file name, for the panel. */
function fileOf(el: HTMLImageElement): string {
  try {
    return decodeURIComponent(new URL(el.currentSrc || el.src, location.href).pathname.split('/assets/parallax/')[1] ?? '')
  } catch {
    return ''
  }
}

/** The kit name behind a live element, without the theme suffix. */
function artNameOf(el: HTMLImageElement, theme: 'dark' | 'light'): string | null {
  const file = fileOf(el)
  const m = new RegExp(`^(.*)-${theme}\\.webp$`).exec(file)
  return m ? m[1] : null
}

/** What a live element is doing today, read from the class the kit stamps. */
function motionOf(el: HTMLElement): Motion {
  return el.classList.contains('scene__art--moves') ? 'drift' : 'still'
}

/**
 * Is the artwork actually painted at this point?
 *
 * One source pixel into a 1x1 canvas, which is cheap enough to run per
 * candidate per click. `object-fit` other than the default means the box is a
 * crop of the source and this mapping would be wrong, so those fall back to
 * the rectangle — see `PickLayer`'s header.
 */
const probe = (() => {
  let ctx: CanvasRenderingContext2D | null = null
  return () => {
    if (ctx) return ctx
    const c = document.createElement('canvas')
    c.width = 1
    c.height = 1
    ctx = c.getContext('2d', { willReadFrequently: true })
    return ctx
  }
})()

function opaqueAt(el: HTMLImageElement, x: number, y: number): boolean {
  const fit = getComputedStyle(el).objectFit
  if (fit && fit !== 'fill') return true
  if (!el.complete || !el.naturalWidth) return true
  const r = el.getBoundingClientRect()
  const sx = Math.floor(((x - r.left) / r.width) * el.naturalWidth)
  const sy = Math.floor(((y - r.top) / r.height) * el.naturalHeight)
  const ctx = probe()
  if (!ctx) return true
  try {
    ctx.clearRect(0, 0, 1, 1)
    ctx.drawImage(el, sx, sy, 1, 1, 0, 0, 1, 1)
    return ctx.getImageData(0, 0, 1, 1).data[3] > 12
  } catch {
    /* a decode that has not finished, or a canvas the browser refused —
       the rectangle is the honest fallback rather than "nothing is here". */
    return true
  }
}

function count(d: SceneDoc): number {
  return (
    Object.keys(d.dark.slots).length +
    Object.keys(d.light.slots).length +
    d.dark.extras.length +
    d.light.extras.length
  )
}

/**
 * Make a string safe INSIDE a double-quoted attribute selector.
 *
 * Not `CSS.escape`, which escapes for an identifier: several slots here are a
 * pair of classes with a space between them (`faith__cloud
 * faith__cloud--far`), and an identifier escape turns that space into `\ `,
 * which is a different string to match against. A quoted attribute value only
 * has two characters that can end it early, and those are the two dealt with.
 */
function cssEscape(s: string): string {
  return s.replaceAll('\\', '\\\\').replaceAll('"', '\\"')
}
