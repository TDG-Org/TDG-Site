import { useCallback, useEffect, useMemo, useRef, useState, type JSX, type PointerEvent as ReactPointerEvent } from 'react'
import { asset } from '../../lib/asset'
import { onFrame, setMotionIntensity } from '../../lib/motion'
import { useTheme } from '../../theme/ThemeProvider'
import { measureHeightVh, measurePlacement, pxToPlacement, pxToVh, pxToVw } from '../apply'
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
import { emptyDoc, SECTION_IDS, type ArtSlotInfo, type Extra, type Motion, type SceneDoc, type SectionId, type SlotOverride } from '../types'
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

export default function SceneEditor({
  open,
  onOpen,
  onClose,
}: {
  open: boolean
  onOpen: () => void
  onClose: () => void
}): JSX.Element | null {
  const { theme, toggle } = useTheme()
  const doc = useDoc()
  const [sel, setSel] = useState<Sel | null>(null)
  /* Hover lives up here rather than inside the sheet because it has TWO
     sources — the pointer over the page and the pointer over a row of the
     Layers list — and a piece highlighted from the list has no pointer over
     the page at all. */
  const [hover, setHover] = useState<Sel | null>(null)
  const [ratioLock, setRatioLock] = useState(true)
  const [dock, setDock] = useState<Dock>(readDock)
  const [tab, setTab] = useState<'piece' | 'library' | 'layers'>('piece')
  const [pick, setPick] = useState(true)
  const [frozen, setFrozen] = useState(true)
  const [manifest, setManifest] = useState<ArtSlotInfo[] | null>(null)
  const [status, setStatus] = useState<string>('Loading draft…')
  const [dirty, setDirty] = useState(false)
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState(false)
  /**
   * Whether the saved draft is being drawn over the page.
   *
   * **This is the fix for "clicking Save doesn't actually save anything when
   * exiting Scene Editor".** Save always did persist — the draft was in
   * localStorage and in `public/scene/draft.json` — but closing the panel tore
   * the document out of the store, so the page snapped back to the shipped CSS
   * and every edit vanished from view. From the outside that is a Save button
   * that does nothing.
   *
   * The draft now stays applied after the panel closes, for the one person who
   * can open the panel at all, and a pill says so and can switch it off. A
   * visitor is unaffected: the chunk that loads a draft is only ever imported
   * for a signed-in admin.
   */
  const [applied, setApplied] = useState(true)
  const [edits, setEdits] = useState(0)
  const history = useRef<SceneDoc[]>([])

  /* ── boot: load the draft once, whether or not the panel is open ───────── */
  useEffect(() => {
    let live = true
    void loadDraft().then((d) => {
      if (!live) return
      setDoc(d)
      const n = count(d)
      setEdits(n)
      setStatus(n === 0 ? 'Empty draft. Click a piece to start.' : `Draft loaded — ${n} edits.`)
    })
    return () => {
      live = false
      setEditing(false)
      setDoc(null)
    }
  }, [])

  /* Keep the edit count in step, so the pill can say how much is in the draft
     without the panel being open to count it. */
  useEffect(() => {
    if (doc) setEdits(count(doc))
  }, [doc])

  /* The draft is drawn while the panel is open, and after it closes for as
     long as the pill says it is. One writer, so the two can never disagree. */
  useEffect(() => {
    setEditing(open || applied)
  }, [open, applied])

  /* Motion is frozen only while the panel is OPEN. Leaving it at zero after
     the panel closed would silently kill every drift on the page and look
     like the editor had broken the site. */
  useEffect(() => {
    if (!open) {
      setMotionIntensity(1)
      return
    }
    setMotionIntensity(frozen ? 0 : 1)
    return () => setMotionIntensity(1)
  }, [open, frozen])

  useEffect(() => {
    if (!open) return
    document.documentElement.setAttribute('data-scene-edit', 'on')
    return () => document.documentElement.removeAttribute('data-scene-edit')
  }, [open])

  /* Where the dock sits is a preference about THIS browser's chrome, like the
     theme switch and the Developer tab beside it, so it is remembered the same
     way and for the same reason: somebody who moved the panel off their cards
     should not have to move it again after every reload. */
  useEffect(() => {
    try {
      window.localStorage.setItem(DOCK_KEY, JSON.stringify(dock))
    } catch {
      /* private mode; the panel still moves, it just forgets */
    }
  }, [dock])

  /**
   * Pull the panel back inside the window after a layout — on mount, and
   * whenever the window changes size.
   *
   * `readDock` cannot do this: it runs before the panel exists, so it does not
   * know how big the panel is. This does, and it is also what answers a
   * restore onto a smaller monitor, a rotated tablet, and a devtools pane
   * opening beside it — each of which can leave a remembered offset pointing
   * at somewhere that is no longer on the screen.
   */
  useEffect(() => {
    const pull = () => {
      const panel = document.querySelector<HTMLElement>('.sceneed')
      if (!panel) return
      setDock((d) => {
        const r = panel.getBoundingClientRect()
        const next = clampOffset({ left: r.left - d.dx, top: r.top - d.dy, w: r.width, h: r.height }, d.dx, d.dy)
        return next.dx === d.dx && next.dy === d.dy ? d : { ...d, ...next }
      })
    }
    pull()
    window.addEventListener('resize', pull)
    return () => window.removeEventListener('resize', pull)
  }, [collapsed, tab])

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
   * Everything a gesture starts from.
   *
   * If the draft already holds a number for this piece, that is the truth. If
   * it does not — the first time anything touches a shipped piece — the live
   * element is measured, so the very first pixel of movement is relative to
   * where the stylesheet actually put it rather than to a corner.
   *
   * The sizes are the LAYOUT sizes and the position comes from
   * `measurePlacement`; `scene/apply.ts` carries the long version of why
   * neither may be read off `getBoundingClientRect`.
   */
  const baseOf = useCallback(
    (s: Sel): Base | null => {
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
        rotate: held?.rotate ?? 0,
        pxW: el.offsetWidth || 1,
        pxH: el.offsetHeight || 1,
        /* Whether the stylesheet is deriving this piece's height from its own
           ratio. If it is, a locked resize can leave the height alone and stay
           one number; if it is not — the band plates state a height and crop
           with `object-fit` — the height has to be written or the box will not
           follow the grip. */
        hasAspect: getComputedStyle(el).aspectRatio !== 'auto',
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
        const base = baseOf(sel)
        if (!el || !base) return
        const step = pxToPlacement(el, move[0], move[1])
        patchSelected({ x: base.x + step.dx, y: base.y + step.dy, w: base.w })
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
  }, [sel, undo, onClose, baseOf, patchSelected, selEl])

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
    const base = baseOf(sel)
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
  }, [baseOf, commit, override, sel, selEl, theme])

  /**
   * Write a section's new stacking order into the draft.
   *
   * `ordered` arrives BACK to front, so the index is the `z` — a contiguous
   * run from zero, which leaves the backmost piece interleaved with the plain
   * bands at `z-index: auto` exactly as it was and lifts the rest above them
   * in the order asked for.
   *
   * Only the pieces whose z actually changes are written, so a reorder that
   * moves one row does not put six no-op entries in the draft.
   */
  const reorder = useCallback(
    (ordered: Sel[]) => {
      const d = getDoc()
      commit(() => {
        ordered.forEach((s, i) => {
          const held = d
            ? s.kind === 'slot'
              ? d[theme].slots[s.id]?.z
              : d[theme].extras.find((e) => e.id === s.id)?.z
            : undefined
          const live = (() => {
            const el = selEl(s)
            return el ? Number(getComputedStyle(el).zIndex) || 0 : 0
          })()
          if ((held ?? live) === i) return
          if (s.kind === 'slot') patchSlot(theme, s.id, { z: i })
          else patchExtra(theme, s.id, { z: i })
        })
      })
      setStatus('Restacked. Depth z on the Piece tab is the same number.')
    },
    [commit, selEl, theme],
  )

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
        ? `Saved to ${res.detail}. It stays on the page after you close this.`
        : `Saved to ${res.detail}. It stays on the page after you close this; Download gets the file out.`,
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

  /** What to call a piece, in the outline chip and in the panel heading. */
  const nameOfSel = useCallback(
    (s: Sel, t: 'dark' | 'light'): string => {
      if (s.kind === 'extra') {
        const d = getDoc()
        const e = d?.[t].extras.find((x) => x.id === s.id)
        return e?.label ?? e?.art ?? s.id
      }
      const el = selEl(s)
      return el ? labelOf(el) : s.id
    },
    [selEl],
  )

  /**
   * Bring a piece on screen when it is picked from the Layers list.
   *
   * Selecting something you cannot see is the same dead end as selecting
   * something that is not drawn: the panel fills in, the outline is somewhere
   * above or below the window, and nothing appears to have happened. Only
   * scrolls when the piece is actually outside the viewport, so picking
   * through a list of layers you can already see does not throw the page
   * around under you.
   */
  const revealSel = useCallback(
    (s: Sel) => {
      const el = selEl(s)
      if (!el) return
      const r = el.getBoundingClientRect()
      if (r.height < 1 && r.width < 1) return
      const vh = window.innerHeight
      if (r.bottom > 0 && r.top < vh) return
      window.scrollTo({ top: window.scrollY + r.top + r.height / 2 - vh / 2, behavior: 'smooth' })
    },
    [selEl],
  )

  /* ── the rows the Layers tab and the hit test both read ────────────────── */
  const rows = useCallback((): ArtRow[] => {
    const out: ArtRow[] = []
    for (const el of document.querySelectorAll<HTMLImageElement>('.scene__art')) {
      const extraId = el.dataset.extra
      const slot = el.dataset.slot
      const s: Sel | null = extraId ? { kind: 'extra', id: extraId } : slot ? { kind: 'slot', id: slot } : null
      if (!s) continue
      /* An added piece is named after the artwork it draws, not after the one
         class every added piece shares — otherwise a list of six of them is
         six rows all called `scene__extra`. */
      out.push({ el, sel: s, section: sectionOf(el), label: extraId ? nameOfSel(s, theme) : labelOf(el) })
    }
    return out
  }, [nameOfSel, theme])

  /* ── closed ─────────────────────────────────────────────────────────────
     Nothing at all when there is no draft: an admin who has never opened the
     editor should not meet a control for a thing that does not exist. With a
     draft, a pill — because a page that differs from the shipped one with
     nothing on screen accounting for it reads as a bug, and gets reported as
     one. It says how many edits, opens the panel, and switches the overlay
     off without throwing the draft away. */
  if (!open) {
    if (edits === 0) return null
    return (
      <div className={`sceneed-pill${applied ? '' : ' is-off'}`} role="status">
        <span className="sceneed-pill__dot" aria-hidden="true" />
        <span className="sceneed-pill__text">
          {applied ? 'Scene draft applied' : 'Scene draft hidden'} · {edits} edit{edits === 1 ? '' : 's'}
        </span>
        <button type="button" className="sceneed-pill__btn" onClick={() => setApplied((a) => !a)}>
          {applied ? 'Hide' : 'Show'}
        </button>
        <button type="button" className="sceneed-pill__btn sceneed-pill__btn--go" onClick={onOpen}>
          Edit
        </button>
      </div>
    )
  }

  return (
    <>
      {pick && (
        <PickLayer
          rows={rows}
          sel={sel}
          hover={hover}
          onSelect={setSel}
          onHover={setHover}
          onGestureStart={baseOf}
          onGesture={(s, patch) => {
            if (s.kind === 'slot') patchSlot(theme, s.id, patch as Partial<SlotOverride>)
            else patchExtra(theme, s.id, patch)
          }}
          onGestureCommit={() => commit(() => {})}
          onGestureEnd={(what) => {
            if (!what) return
            setDirty(true)
            setStatus(
              what === 'move'
                ? 'Moved. Arrows nudge from here, Shift for ten.'
                : what === 'rotate'
                  ? 'Rotated. Shift while dragging snaps to 15°.'
                  : ratioLock
                    ? 'Resized, ratio kept. Unlock Ratio to stretch it.'
                    : 'Resized freely. Lock Ratio to keep its shape.',
            )
          }}
          onDropArt={dropArt}
          ratioLock={ratioLock}
          labelFor={(s) => nameOfSel(s, theme)}
        />
      )}

      <aside
        className={`sceneed sceneed--${dock.side}${collapsed ? ' sceneed--collapsed' : ''}`}
        style={{ translate: `${dock.dx}px ${dock.dy}px` }}
        aria-label="Scene Editor"
      >
        {/* The header is the grab bar. `onPointerDown` here rather than a
            separate strip because a title bar you can drag is what every
            floating panel has taught everyone to expect, and a dedicated
            handle would be one more thing to find. Buttons inside it opt out
            below, or pressing Close would start a drag. */}
        <header
          className="sceneed__head"
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest('button')) return
            const start = { x: e.clientX, y: e.clientY, dx: dock.dx, dy: dock.dy }
            const el = e.currentTarget
            /* The panel's anchored position — where it would be with a zero
               offset — measured once, so the drag can be clamped against the
               window instead of against wherever it currently happens to be. */
            const panel = el.parentElement as HTMLElement
            const r = panel.getBoundingClientRect()
            const anchor = { left: r.left - start.dx, top: r.top - start.dy, w: r.width, h: r.height }
            el.setPointerCapture(e.pointerId)
            const move = (ev: PointerEvent) => {
              setDock((d) => ({
                ...d,
                ...clampOffset(anchor, start.dx + (ev.clientX - start.x), start.dy + (ev.clientY - start.y)),
              }))
            }
            const up = () => {
              el.removeEventListener('pointermove', move)
              el.removeEventListener('pointerup', up)
              el.removeEventListener('pointercancel', up)
            }
            el.addEventListener('pointermove', move)
            el.addEventListener('pointerup', up)
            el.addEventListener('pointercancel', up)
          }}
        >
          <button
            type="button"
            className="sceneed__fold"
            onClick={() => setCollapsed((c) => !c)}
            aria-expanded={!collapsed}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? '▸' : '▾'}
          </button>
          <span className="sceneed__title">Scene Editor</span>
          <button
            type="button"
            className={`sceneed__fold${dock.side === 'left' ? ' is-on' : ''}`}
            onClick={() => setDock({ side: 'left', dx: 0, dy: 0 })}
            title="Anchor to the left edge"
            aria-pressed={dock.side === 'left'}
          >
            ⇤
          </button>
          <button
            type="button"
            className={`sceneed__fold${dock.side === 'right' ? ' is-on' : ''}`}
            onClick={() => setDock({ side: 'right', dx: 0, dy: 0 })}
            title="Anchor to the right edge"
            aria-pressed={dock.side === 'right'}
          >
            ⇥
          </button>
          {/* Only there once it has actually been moved: a Reset that is
              always lit is a control that never means anything, and its being
              there at all is how you find out the panel remembers. */}
          {(dock.dx !== 0 || dock.dy !== 0) && (
            <button
              type="button"
              className="sceneed__fold sceneed__fold--warn"
              onClick={() => setDock((d) => ({ ...d, dx: 0, dy: 0 }))}
              title="Put it back on its anchor"
            >
              ⟲
            </button>
          )}
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
              <Toggle
                label="Ratio"
                on={ratioLock}
                onChange={setRatioLock}
                title="Locked, a corner keeps the piece's shape. Unlocked, corners stretch it."
              />
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
                  baseOf={baseOf}
                  ratioLock={ratioLock}
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
                  hover={hover}
                  onHover={setHover}
                  onReorder={reorder}
                  /* Picking a row moves you to the controls for it. Without
                     this, selecting a slot the theme does not draw left you
                     looking at the list with its "Draw It" button one
                     un-signposted tab away — a selection that did nothing
                     visible, which is the whole failure this panel is for. */
                  onSelect={(s) => {
                    setSel(s)
                    setTab('piece')
                    revealSel(s)
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
 * a drag into a placement, and the outlines that say what is under the cursor
 * and what is selected.
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
 *
 * ## Both outlines are drawn from the frame loop, never from the pointer
 *
 * An outline written on `pointermove` is right until anything moves that is
 * not the pointer: the page scrolls, a drift layer lerps, the theme wave
 * repaints, and the box is left behind on a layer that has gone. Worse, the
 * hover outline could not be driven by the Layers list at all — there is no
 * pointer over the page then. So both boxes are positioned inside the site's
 * one `onFrame` subscriber (rule 9) from whatever the current hover and
 * selection are, wherever those came from.
 */

/** The eight resize grips, and which edges each one moves. */
const HANDLES: { id: string; l?: boolean; r?: boolean; t?: boolean; b?: boolean; cursor: string }[] = [
  { id: 'nw', l: true, t: true, cursor: 'nwse-resize' },
  { id: 'n', t: true, cursor: 'ns-resize' },
  { id: 'ne', r: true, t: true, cursor: 'nesw-resize' },
  { id: 'e', r: true, cursor: 'ew-resize' },
  { id: 'se', r: true, b: true, cursor: 'nwse-resize' },
  { id: 's', b: true, cursor: 'ns-resize' },
  { id: 'sw', l: true, b: true, cursor: 'nesw-resize' },
  { id: 'w', l: true, cursor: 'ew-resize' },
]

function PickLayer({
  rows,
  sel,
  hover,
  onSelect,
  onHover,
  onGestureStart,
  onGesture,
  onGestureCommit,
  onGestureEnd,
  onDropArt,
  ratioLock,
  labelFor,
}: {
  rows: () => ArtRow[]
  sel: Sel | null
  hover: Sel | null
  onSelect: (s: Sel | null) => void
  onHover: (s: Sel | null) => void
  onGestureStart: (s: Sel) => Base | null
  onGesture: (s: Sel, patch: Partial<Extra>) => void
  onGestureCommit: () => void
  onGestureEnd: (what: string) => void
  onDropArt: (name: string, x: number, y: number) => void
  ratioLock: boolean
  labelFor: (s: Sel) => string
}): JSX.Element {
  const box = useRef<HTMLDivElement | null>(null)
  const hoverBox = useRef<HTMLDivElement | null>(null)
  const tag = useRef<HTMLDivElement | null>(null)
  const drag = useRef<Gesture | null>(null)

  /* Both outlines, from the one frame loop. `hold()` while the editor is open,
     because a box that stops following when the loop parks is a box that lies. */
  useEffect(() => {
    return onFrame(({ hold }) => {
      hold()
      const s = geometryOf(sel)
      const h = hover && !sameSel(hover, sel) ? geometryOf(hover) : null
      return () => {
        paint(box.current, s)
        paint(hoverBox.current, h)
        const t = tag.current
        if (t) {
          const g = s ?? h
          if (!g) t.style.display = 'none'
          else {
            t.style.display = 'block'
            /* Outside the rotated box and axis-aligned, so a name stays
               readable at any angle without a counter-rotation. */
            t.style.translate = `${g.aabbLeft}px ${g.aabbTop - 20}px`
          }
        }
      }
    })
  }, [sel, hover])

  /* The name chip is React-rendered rather than written into the DOM by the
     tick above, so it stays one source of truth with the panel's own label. */
  const tagText = sel ? labelFor(sel) : hover ? labelFor(hover) : ''

  /**
   * Everything under a point, front to back.
   *
   * Front means z-index first and DOM order second, which is the order the
   * browser painted them in, and it is the order every decision below reads:
   * `[0]` is what a fresh click selects and the whole list is what a repeated
   * click steps through.
   */
  const candidatesAt = useCallback(
    (x: number, y: number): Sel[] => {
      const found = rows().filter((row) => {
        const r = row.el.getBoundingClientRect()
        if (x < r.left || x > r.right || y < r.top || y > r.bottom) return false
        if (r.width < 2 || r.height < 2) return false
        return opaqueAt(row.el, x, y)
      })
      found.sort((a, b) => {
        const za = Number(getComputedStyle(a.el).zIndex) || 0
        const zb = Number(getComputedStyle(b.el).zIndex) || 0
        if (za !== zb) return zb - za
        return a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? 1 : -1
      })
      return found.map((f) => f.sel)
    },
    [rows],
  )

  const begin = (mode: Gesture['mode'], s: Sel, e: ReactPointerEvent<HTMLDivElement>) => {
    const base = onGestureStart(s)
    if (!base) return
    /* Only a resize needs it, and it costs a forced reflow, so it is not paid
       for on a move or a rotate. */
    const slope = mode.startsWith('size:') ? transformSlope(elementFor(s)) : NO_SLOPE
    /* One history entry per gesture, taken before the first pixel — otherwise
       a drag across the screen is four hundred undo steps. */
    onGestureCommit()
    drag.current = { mode, sel: s, base, slope, startX: e.clientX, startY: e.clientY, moved: false }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  /**
   * ## Pressing selects and moves. Only a CLICK steps behind.
   *
   * The first version cycled on every `pointerdown`, which is wrong in a way
   * that only shows up once there are two layers under the cursor: select a
   * palm, press on it to drag it, and the press re-picks — handing you the
   * sand behind the palm and dragging THAT. Measured on #games, where a
   * drag of the selected `games__pines` moved `games__fog` instead and the
   * palm row did not shift by a pixel.
   *
   * So the two gestures are separated by what the pointer actually did:
   *
   * - **Press** keeps the current selection if it is one of the things under
   *   the cursor, and takes the front-most otherwise. Either way it starts a
   *   move, so a press on what you already have selected drags it.
   * - **Click** — pressed and released without moving — steps to the next
   *   candidate behind, which is how you reach the sea under the palm without
   *   hiding the palm first.
   */
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    const grip = (e.target as HTMLElement).dataset.grip
    if (grip && sel) {
      begin(grip === 'rotate' ? 'rotate' : `size:${grip}`, sel, e)
      return
    }
    const stack = candidatesAt(e.clientX, e.clientY)
    if (stack.length === 0) {
      onSelect(null)
      return
    }
    const keep = sel && stack.some((c) => sameSel(c, sel)) ? sel : stack[0]
    onSelect(keep)
    begin('move', keep, e)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) {
      onHover(candidatesAt(e.clientX, e.clientY)[0] ?? null)
      return
    }
    const el = elementFor(d.sel)
    if (!el) return
    d.moved = true
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY

    if (d.mode === 'rotate') {
      const r = el.getBoundingClientRect()
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      const a0 = Math.atan2(d.startY - cy, d.startX - cx)
      const a1 = Math.atan2(e.clientY - cy, e.clientX - cx)
      let deg = d.base.rotate + ((a1 - a0) * 180) / Math.PI
      if (e.shiftKey) deg = Math.round(deg / 15) * 15
      /* Wrapped rather than allowed to run away: a draft holding 730deg and a
         draft holding 10deg draw the same picture, and only one of them is
         readable when it is time to write it into CSS. */
      deg = ((deg % 360) + 540) % 360 - 180
      onGesture(d.sel, { rotate: deg })
      return
    }

    if (d.mode === 'move') {
      let mx = dx
      let my = dy
      if (e.shiftKey) {
        if (Math.abs(mx) > Math.abs(my)) my = 0
        else mx = 0
      }
      const step = pxToPlacement(el, mx, my)
      onGesture(d.sel, { x: d.base.x + step.dx, y: d.base.y + step.dy, w: d.base.w })
      return
    }

    /* ── resize ─────────────────────────────────────────────────────────────
       The pointer delta is projected onto the element's OWN axes first, so a
       rotated piece grows along the edge whose grip you are holding rather
       than along the screen. At 0deg — which is every piece until somebody
       rotates one — the projection is the identity. */
    const edge = HANDLES.find((h) => h.id === d.mode.slice(5))
    if (!edge) return
    const th = (d.base.rotate * Math.PI) / 180
    const ldx = dx * Math.cos(th) + dy * Math.sin(th)
    const ldy = -dx * Math.sin(th) + dy * Math.cos(th)

    let w = d.base.pxW
    let h = d.base.pxH
    if (edge.r) w = d.base.pxW + ldx
    if (edge.l) w = d.base.pxW - ldx
    if (edge.b) h = d.base.pxH + ldy
    if (edge.t) h = d.base.pxH - ldy

    if (ratioLock && d.base.pxW > 0 && d.base.pxH > 0) {
      const ratio = d.base.pxH / d.base.pxW
      /* A corner or a side grip both drive from ONE axis when the ratio is
         locked, otherwise a corner drag fights itself: horizontal wins wherever
         there is a horizontal edge, because that is the axis `w` is stored in
         and the one a `vw` width has to end up agreeing with. */
      if (edge.l || edge.r) h = w * ratio
      else w = h / ratio
    }
    w = Math.max(4, w)
    h = Math.max(4, h)

    /* ── keeping the opposite edge where it is ────────────────────────────
       The first version of this was `offX = edge.l ? pxW - w : 0`, which is
       right only at zero rotation and was reported by review as such. A CSS
       `rotate` turns the box about its CENTRE, so changing the size moves both
       visual edges symmetrically about that centre; the anchor has to be held
       in the frame it actually lives in.

       Solving `screen(anchor)` before = after, with `c` the centre, `R` the
       rotation and `a` the anchor corner in local coordinates:

           (L', T') = (L, T) + (-dW/2, -dH/2) + R · [ (0.5-ax)·dW, (0.5-ay)·dH ]

       At 0deg `R` is the identity and this collapses to exactly the old
       expression, which is why the original 32-case grip sweep passed: every
       one of those cases was unrotated.

       `ax`/`ay` are where the anchor sits along each axis — 0 at the near
       edge, 1 at the far one, 0.5 when that axis is not being dragged and the
       box must grow symmetrically about its middle. */
    const ax = edge.r ? 0 : edge.l ? 1 : 0.5
    const ay = edge.b ? 0 : edge.t ? 1 : 0.5
    const dW = w - d.base.pxW
    const dH = h - d.base.pxH

    /* And the piece's OWN transform, when its translation is a function of its
       size. Nine layers here are `left: 50%` + `translateX(-50%)`, so growing
       the width slides them another half of the gain — an anchor computed in
       layout space alone cannot see it, and the review measured 50px of drift
       at 0deg on `hero__cloud` because of it. The slope is measured rather
       than assumed: one probe resize at gesture start, read straight off the
       computed matrix, which covers a percentage translate, a pixel one, a
       mirror, and any mixture, without this code having to know which. */
    const localX = (0.5 - ax) * dW - d.slope.sx * dW
    const localY = (0.5 - ay) * dH - d.slope.sy * dH
    const cos = Math.cos(th)
    const sin = Math.sin(th)
    const offX = -dW / 2 + (localX * cos - localY * sin)
    const offY = -dH / 2 + (localX * sin + localY * cos)
    const anchor = pxToPlacement(el, offX, offY)

    const patch: Partial<Extra> = {
      x: d.base.x + anchor.dx,
      y: d.base.y + anchor.dy,
      w: pxToVw(w),
    }
    /* Height is written only when the stylesheet is not already deriving it.
       With the ratio locked and an `aspect-ratio` in the CSS, a bare width is
       the better draft — it keeps the piece's own ratio at every viewport, and
       it is one number to bake instead of two. Everywhere else the height has
       to be stated or the box will not follow the grip. */
    if (!ratioLock || !d.base.hasAspect) patch.h = pxToVh(h)
    onGesture(d.sel, patch)
  }

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    drag.current = null
    if (d.moved) {
      onGestureEnd(d.mode)
      return
    }
    /* A click rather than a drag. Step behind whatever is selected, so the
       same spot pressed twice walks down the stack. `move` is the only mode
       this applies to — releasing a grip without moving it is not a request
       to select something else. */
    onGestureEnd('')
    if (d.mode !== 'move') return
    const stack = candidatesAt(e.clientX, e.clientY)
    if (stack.length < 2) return
    const i = stack.findIndex((c) => sameSel(c, d.sel))
    onSelect(stack[(i + 1) % stack.length])
  }

  return (
    <div
      className="sceneed__pick"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerLeave={() => {
        if (!drag.current) onHover(null)
      }}
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
      <div ref={hoverBox} className="sceneed__hover" />
      <div ref={box} className="sceneed__sel">
        <span className="sceneed__rotate" data-grip="rotate" title="Drag to rotate · Shift snaps to 15°" />
        {HANDLES.map((h) => (
          <span
            key={h.id}
            className={`sceneed__grip sceneed__grip--${h.id}`}
            data-grip={h.id}
            style={{ cursor: h.cursor }}
          />
        ))}
      </div>
      <div ref={tag} className="sceneed__tag">
        {tagText}
      </div>
    </div>
  )
}

/** What a gesture is holding while the pointer is down. */
type Gesture = {
  mode: 'move' | 'rotate' | `size:${string}`
  sel: Sel
  base: Base
  /** How this piece's own CSS transform moves when its box grows. */
  slope: Slope
  startX: number
  startY: number
  moved: boolean
}

type Slope = { sx: number; sy: number }

const NO_SLOPE: Slope = { sx: 0, sy: 0 }

/**
 * How much the element's own `transform` translation moves per pixel of box.
 *
 * A percentage translate is a function of the box it is on — `translateX(-50%)`
 * is `-0.5 x width` — so growing a piece slides it as well as stretching it,
 * and an anchor computed only in layout space drifts by exactly that much.
 * Nine layers on this page are that recipe.
 *
 * Measured rather than parsed: grow the box by 100px, read the computed matrix
 * again, divide. That is right for a percentage translate, a pixel one, a
 * mirror and any mixture of them, and it needs no knowledge of what the
 * stylesheet actually said. Both writes and the read happen inside one
 * synchronous block, before the browser has a chance to paint, so nothing
 * flickers; the cost is one forced reflow per resize gesture.
 */
function transformSlope(el: HTMLElement | null): Slope {
  if (!el) return NO_SLOPE
  const translation = () => {
    const t = getComputedStyle(el).transform
    if (!t || t === 'none') return { e: 0, f: 0 }
    try {
      const m = new DOMMatrixReadOnly(t)
      return { e: m.e, f: m.f }
    } catch {
      return { e: 0, f: 0 }
    }
  }
  const w0 = el.style.width
  const h0 = el.style.height
  const base = translation()
  const W = el.offsetWidth || 1
  const H = el.offsetHeight || 1
  el.style.width = `${W + 100}px`
  el.style.height = `${H + 100}px`
  const grown = translation()
  el.style.width = w0
  el.style.height = h0
  void el.offsetWidth
  const sx = (grown.e - base.e) / 100
  const sy = (grown.f - base.f) / 100
  return {
    sx: Number.isFinite(sx) ? sx : 0,
    sy: Number.isFinite(sy) ? sy : 0,
  }
}

/**
 * Everything a gesture needs to know about where a piece started.
 *
 * `pxW`/`pxH` are the LAYOUT size — `offsetWidth`, not the rect — for the same
 * reason `measurePlacement` uses `offsetLeft`: a rotated or mirrored piece's
 * rect is its axis-aligned bounding box and grows as it turns, so sizing from
 * it would make every rotated resize wrong by the rotation.
 */
type Base = {
  x: number
  y: number
  w: number
  rotate: number
  pxW: number
  pxH: number
  hasAspect: boolean
}

const sameSel = (a: Sel | null, b: Sel | null): boolean =>
  Boolean(a && b && a.kind === b.kind && a.id === b.id)

function elementFor(s: Sel | null): HTMLImageElement | null {
  if (!s) return null
  const q = s.kind === 'slot' ? `[data-slot="${cssEscape(s.id)}"]` : `[data-extra="${cssEscape(s.id)}"]`
  return document.querySelector<HTMLImageElement>(q)
}

type OutlineGeometry = {
  left: number
  top: number
  width: number
  height: number
  deg: number
  aabbLeft: number
  aabbTop: number
}

/**
 * Where to draw an outline around a piece.
 *
 * The rect a browser reports for a rotated element is its axis-aligned
 * bounding box, which is bigger than the element and gets bigger as it turns —
 * an outline drawn on it would be a box the piece rattles around inside, with
 * its resize grips nowhere near the edges they resize. So the outline is built
 * instead from the LAYOUT size and the rect's CENTRE, which a rotation about
 * the default origin leaves exactly where it was, and then turned by the same
 * angle. At 0deg the two constructions agree to the pixel.
 *
 * The angle comes from the standalone `rotate` property only, never from the
 * `transform` matrix. Nine pieces on this page carry a transform and every one
 * of them is a translate or a mirror; `matrix(-1, 0, 0, 1, ...)` decomposes to
 * 180deg of rotation, which is true of the maths and false of the picture.
 */
function geometryOf(s: Sel | null): OutlineGeometry | null {
  const el = elementFor(s)
  if (!el) return null
  const r = el.getBoundingClientRect()
  if (r.width < 1 && r.height < 1) return null
  const w = el.offsetWidth || r.width
  const h = el.offsetHeight || r.height
  const cx = r.left + r.width / 2
  const cy = r.top + r.height / 2
  const raw = getComputedStyle(el).rotate
  const deg = raw && raw !== 'none' ? Number.parseFloat(raw) || 0 : 0
  return {
    left: cx - w / 2,
    top: cy - h / 2,
    width: w,
    height: h,
    deg,
    aabbLeft: r.left,
    aabbTop: r.top,
  }
}

function paint(el: HTMLElement | null, g: OutlineGeometry | null): void {
  if (!el) return
  if (!g) {
    el.style.display = 'none'
    return
  }
  el.style.display = 'block'
  el.style.translate = `${g.left}px ${g.top}px`
  el.style.width = `${g.width}px`
  el.style.height = `${g.height}px`
  el.style.rotate = `${g.deg}deg`
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
  baseOf,
  ratioLock,
}: {
  sel: Sel | null
  el: HTMLImageElement | null
  override: SlotOverride | Extra | undefined
  onPatch: (p: Partial<Extra>) => void
  onDuplicate: () => void
  onRemove: () => void
  onReset: () => void
  baseOf: (s: Sel) => Base | null
  ratioLock: boolean
}): JSX.Element {
  if (!sel) {
    return (
      <div className="sceneed__empty">
        <p>
          <strong>Click any piece of art</strong> on the page to select it. Click the same spot again
          to step behind it.
        </p>
        <p>
          Drag to move · Shift-drag holds one axis · the eight grips resize from any edge or corner
          · the round knob above rotates, Shift snaps it to 15° · arrows nudge, with Shift for ten ·
          Delete hides · Ctrl+Z undoes.
        </p>
        <p>
          <strong>Ratio</strong> in the bar decides whether a corner keeps a piece's shape or
          stretches it. Drag this panel by its title bar, or send it to either edge with ⇤ and ⇥.
        </p>
        <p>
          Light and Dark are two separate drafts. Switch with the pill above and edit the other one.
        </p>
      </div>
    )
  }
  const place = baseOf(sel)
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
        {/* Only when the ratio is unlocked or the piece has no ratio of its
            own to keep. Offering a height beside a locked ratio would be a
            field that silently fights the grips — type a number, drag a
            corner, watch it be overwritten. */}
        {(!ratioLock || !place?.hasAspect) && (
          <Num
            label="Height vh"
            value={override?.h ?? (el ? measureHeightVh(el) : 10)}
            min={0.5}
            max={400}
            step={0.2}
            onChange={(v) => onPatch({ h: v })}
            hint={place?.hasAspect ? 'Set, so this piece no longer follows its own ratio.' : undefined}
          />
        )}
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

/**
 * The Layers list — every piece in the scene, grouped by section, in paint
 * order, and reorderable by dragging a row.
 *
 * ## Front at the top, because that is what the order MEANS
 *
 * The list used to be in DOM order, which is back-to-front, and that is only
 * an answer if nobody is going to act on it. A list you can drag has to read
 * the way the picture is stacked: the row at the top is the piece in front.
 *
 * ## Dragging writes `z`, because `z` is the only order there is
 *
 * A draft cannot move an element in the document — the sections are React
 * components and their DOM order is the page's own structure. What it can do
 * is set `z-index`, and within a section that is exactly equivalent: measured
 * with `getComputedStyle` up the ancestor chain, the art in a section shares
 * one stacking context (nothing between a piece and the root establishes one),
 * so a z on the `<img>` really does reorder it against its neighbours.
 *
 * The one exception found by that measurement is `walk__frost-art`, which sits
 * inside `.walk__frost` — an element with its own opacity, and therefore its
 * own stacking context. It is alone in there, so it cannot be reordered
 * against anything and the list says so rather than offering a drag that
 * would do nothing.
 *
 * A drop rewrites the whole group's `z` as a contiguous run from the back, and
 * only where the value actually changes, so a draft records an order rather
 * than a pile of no-op entries. The panel's own Depth z field is the same
 * number, so typing -1 there drops a piece behind the copy AND moves it to the
 * bottom of this list — one idea with two controls, not two ideas.
 *
 * ## A press is a drag, a click is a selection
 *
 * The same rule the canvas uses, for the same reason: a row has to do both,
 * and the pointer's own behaviour is what tells them apart. Under four pixels
 * of travel it is a click and it selects; past that it is a reorder.
 */
function LayersPanel({
  rows,
  sel,
  hover,
  onSelect,
  onHover,
  onReorder,
  doc,
  theme,
}: {
  rows: () => ArtRow[]
  sel: Sel | null
  hover: Sel | null
  onSelect: (s: Sel) => void
  onHover: (s: Sel | null) => void
  onReorder: (ordered: Sel[]) => void
  doc: SceneDoc | null
  theme: 'dark' | 'light'
}): JSX.Element {
  const [, bump] = useState(0)
  const [drag, setDrag] = useState<{ sel: Sel; section: SectionId; from: number } | null>(null)
  const [over, setOver] = useState<number | null>(null)
  const press = useRef<{ y: number; sel: Sel; section: SectionId; from: number } | null>(null)
  /* Set by a drag so the `click` that follows it does not also select. A row
     is a button and selecting is its CLICK, not its pointerup — that is what
     keeps Enter and Space working on it, which a pointer-only handler quietly
     took away. */
  const dragged = useRef(false)

  /* The list is read off the live DOM, so it has to be re-read for pieces that
     arrive late — a lazy image decoding, a section mounting as it scrolls in.
     A second is slow enough to cost nothing and quick enough that a new piece
     never feels missing. It stops when the tab is not showing, because this
     component only exists while the Layers tab is open. */
  useEffect(() => {
    const t = window.setInterval(() => bump((n) => n + 1), 1000)
    return () => window.clearInterval(t)
  }, [])

  const all = rows()
  const hiddenSlots = doc ? Object.entries(doc[theme].slots).filter(([, v]) => v.hidden) : []

  return (
    <div className="sceneed__layers">
      <p className="sceneed__note">
        Front of the scene at the top. Drag a row to restack it inside its section.
      </p>
      {SECTION_IDS.map((id) => {
        const mine = paintOrder(all.filter((r) => r.section === id))
        if (mine.length === 0) return null
        /* Front at the top: the array is back-to-front, the list is not. */
        const shown = [...mine].reverse()
        const dragging = drag?.section === id
        return (
          <section key={id} className="sceneed__layer-group">
            <h3>#{id}</h3>
            {shown.map((r, i) => {
              const on = sel && sel.kind === r.sel.kind && sel.id === r.sel.id
              /* A slot this theme does not draw is still listed — it can be
                 brought back from the Piece tab — but it says so rather than
                 looking like a layer that is simply somewhere else. */
              const off = getComputedStyle(r.el).display === 'none'
              const lit = sameSel(hover, r.sel)
              const held = dragging && sameSel(drag.sel, r.sel)
              return (
                <div key={`${r.sel.kind}:${r.sel.id}`} className="sceneed__layer-slot">
                  {dragging && over === i && <span className="sceneed__drop" aria-hidden="true" />}
                  <button
                    type="button"
                    className={`sceneed__layer${on ? ' is-on' : ''}${lit ? ' is-lit' : ''}${off ? ' is-off' : ''}${held ? ' is-held' : ''}`}
                    /* Pointer AND focus, so the highlight answers a keyboard
                       walk down the list as well as a mouse. `onPointerLeave`
                       clears only its own row, so moving between two rows never
                       blanks the outline in between. */
                    onPointerEnter={() => !drag && onHover(r.sel)}
                    onPointerLeave={() => !drag && onHover(null)}
                    onFocus={() => onHover(r.sel)}
                    onBlur={() => onHover(null)}
                    onPointerDown={(e) => {
                      if (e.button !== 0) return
                      press.current = { y: e.clientY, sel: r.sel, section: id, from: i }
                      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
                    }}
                    onPointerMove={(e) => {
                      const p = press.current
                      if (!p) return
                      if (!drag) {
                        /* Four pixels of slop, so a click with a shaky hand is
                           still a click. */
                        if (Math.abs(e.clientY - p.y) < 4) return
                        setDrag({ sel: p.sel, section: p.section, from: p.from })
                      }
                      /* Which gap the pointer is over, measured against the
                         rows themselves rather than guessed from the delta —
                         rows are not all the same height once a name wraps. */
                      const list = (e.currentTarget as HTMLElement).closest('.sceneed__layer-group')
                      if (!list) return
                      const btns = [...list.querySelectorAll('.sceneed__layer')]
                      let idx = btns.length
                      for (let k = 0; k < btns.length; k++) {
                        const b = btns[k].getBoundingClientRect()
                        if (e.clientY < b.top + b.height / 2) { idx = k; break }
                      }
                      setOver(idx)
                    }}
                    onClick={() => {
                      if (dragged.current) {
                        dragged.current = false
                        return
                      }
                      onSelect(r.sel)
                    }}
                    onPointerUp={() => {
                      press.current = null
                      if (!drag || over === null) {
                        setDrag(null)
                        setOver(null)
                        /* Not a drag: let the click that follows do the
                           selecting, so the mouse and the keyboard take the
                           same path. */
                        return
                      }
                      dragged.current = true
                      /* Rebuild the displayed (front-first) order, then hand
                         it back BACK-first, which is the order `z` counts in. */
                      const next = shown.filter((x) => !sameSel(x.sel, drag.sel))
                      const at = over > drag.from ? over - 1 : over
                      next.splice(at, 0, shown[drag.from])
                      setDrag(null)
                      setOver(null)
                      onReorder([...next].reverse().map((x) => x.sel))
                    }}
                    onPointerCancel={() => {
                      press.current = null
                      setDrag(null)
                      setOver(null)
                    }}
                  >
                    <span className="sceneed__layer-grip" aria-hidden="true">
                      ⠿
                    </span>
                    <span className="sceneed__layer-name">{r.label}</span>
                    <span className="sceneed__layer-kind">
                      {r.sel.kind === 'extra' ? 'added' : off ? 'not drawn' : ''}
                    </span>
                  </button>
                  {dragging && over === i + 1 && i === shown.length - 1 && (
                    <span className="sceneed__drop" aria-hidden="true" />
                  )}
                </div>
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
              className={`sceneed__layer is-hidden${sameSel(hover, { kind: 'slot', id }) ? ' is-lit' : ''}`}
              onClick={() => onSelect({ kind: 'slot', id })}
              onPointerEnter={() => onHover({ kind: 'slot', id })}
              onPointerLeave={() => onHover(null)}
              onFocus={() => onHover({ kind: 'slot', id })}
              onBlur={() => onHover(null)}
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

/**
 * Back to front: `z-index` first, document order second.
 *
 * The same comparator the canvas hit test uses, and deliberately so — a list
 * that disagreed with what a click picks would be a list that lies about the
 * picture.
 */
function paintOrder(list: ArtRow[]): ArtRow[] {
  return [...list].sort((a, b) => {
    const za = Number(getComputedStyle(a.el).zIndex) || 0
    const zb = Number(getComputedStyle(b.el).zIndex) || 0
    if (za !== zb) return za - zb
    return a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
  })
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

/* ══ where the dock sits ══════════════════════════════════════════════════ */

/**
 * The panel's own position.
 *
 * `side` is the edge it is anchored to and `dx`/`dy` are how far it has been
 * dragged off that anchor. Keeping the two apart is what makes Reset mean
 * something: it zeroes the offset and the panel returns to its anchor,
 * whichever side that is, without having to remember a second set of
 * coordinates or guess which edge the user meant.
 */
type Dock = { side: 'left' | 'right'; dx: number; dy: number }

const DOCK_KEY = 'tdg.scene-dock'
const DEFAULT_DOCK: Dock = { side: 'right', dx: 0, dy: 0 }

function readDock(): Dock {
  try {
    const raw = window.localStorage.getItem(DOCK_KEY)
    if (!raw) return DEFAULT_DOCK
    const d = JSON.parse(raw) as Dock
    if (d?.side !== 'left' && d?.side !== 'right') return DEFAULT_DOCK
    /* Only sanity bounds here: the panel has not been laid out yet, so its
       real size is not knowable. The effect that runs after the first render
       clamps it properly against the box it turned out to be. */
    const wide = Math.max(0, window.innerWidth)
    const tall = Math.max(0, window.innerHeight)
    return {
      side: d.side,
      dx: clamp(Number(d.dx) || 0, -wide, wide),
      dy: clamp(Number(d.dy) || 0, -tall, tall),
    }
  } catch {
    return DEFAULT_DOCK
  }
}

const clamp = (n: number, lo: number, hi: number) => (n < lo ? lo : n > hi ? hi : n)

/** How much window has to be left around the panel, in px. */
const DOCK_MARGIN = 8

/**
 * Keep the whole panel inside the window.
 *
 * **Not a tidiness rule — a recoverability one.** The header's controls sit at
 * its right-hand end, so a panel dragged off the right edge takes Reset and
 * Close with it: measured, shoving it into the bottom-right corner left 186px
 * of panel on screen and every button that could undo it outside. Escape and
 * the account-menu switch still closed the editor, but "drag it back" is the
 * thing a person tries first and it was the thing that no longer worked.
 *
 * Clamping the OFFSET rather than the final position is what keeps Reset
 * meaning "zero the offset": the anchor is always a legal position, so a
 * clamped drag can always be undone by one press.
 */
function clampOffset(
  anchor: { left: number; top: number; w: number; h: number },
  dx: number,
  dy: number,
): { dx: number; dy: number } {
  const maxLeft = Math.max(DOCK_MARGIN, window.innerWidth - anchor.w - DOCK_MARGIN)
  const maxTop = Math.max(DOCK_MARGIN, window.innerHeight - anchor.h - DOCK_MARGIN)
  return {
    dx: clamp(dx, DOCK_MARGIN - anchor.left, maxLeft - anchor.left),
    dy: clamp(dy, DOCK_MARGIN - anchor.top, maxTop - anchor.top),
  }
}
