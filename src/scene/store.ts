import { useSyncExternalStore } from 'react'
import { asset } from '../lib/asset'
import { emptyDoc, emptyThemeDoc, type Extra, type SceneDoc, type SectionId, type SlotOverride, type ThemeKey } from './types'

/**
 * The scene draft, as one module-level store.
 *
 * ## The rule this file exists to keep
 *
 * **An ordinary visitor must get today's page, byte for byte.** Every art
 * component now asks this store whether it has an override, and the answer for
 * everybody who is not editing has to be "no" in a way that costs nothing and
 * changes nothing:
 *
 * - `doc` starts as `null` and stays `null` until `loadDraft()` is called,
 *   which happens only inside the editor chunk, which is only imported for a
 *   signed-in admin who has switched the editor on.
 * - `useSlotOverride` returns `undefined` — one stable value, not a fresh
 *   object — so `useSyncExternalStore` sees the same snapshot every render and
 *   nothing re-renders.
 * - `subscribe` adds a callback to a Set and is the only listener any of this
 *   installs. No timers, no storage reads per render, no network.
 *
 * That is the same arrangement `src/dev/devMode.ts` uses for the Developer
 * tab, and for the same reason: a developer-only feature that everybody's
 * browser has to evaluate is a feature everybody pays for.
 *
 * ## Where a draft lives
 *
 * `public/scene/draft.json`, fetched by the editor. In `vite dev` the Save
 * button POSTs back to `/__scene`, which `vite.config.ts` answers by writing
 * that same file — so a draft survives a reload, a restart and a `git diff`
 * without anybody exporting anything. In a built site there is no such
 * endpoint, so Save falls back to `localStorage` plus a downloaded file, and
 * says which it did.
 *
 * A draft is never the shipped default. Turning one into the default means
 * writing it into `src/components/*.css` by hand, which is a person's job and
 * is described in `src/scene/README.md`.
 */

const LS_KEY = 'tdg.scene-draft'

let doc: SceneDoc | null = null
let editing = false

const listeners = new Set<() => void>()
const emit = () => {
  for (const fn of listeners) fn()
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/* ── the empty answers ─────────────────────────────────────────────────────
   Frozen module constants rather than fresh objects, because
   `useSyncExternalStore` compares snapshots by identity and a new `{}` every
   render is an infinite loop rather than an optimisation. */
const NO_OVERRIDE: SlotOverride | undefined = undefined
const NO_EXTRAS: readonly Extra[] = Object.freeze([])

export const getDoc = (): SceneDoc | null => doc
export const isEditing = (): boolean => editing

/** Replace the whole draft. Used by load, undo and Revert. */
export function setDoc(next: SceneDoc | null): void {
  doc = next
  emit()
}

/** Turn the overrides on or off without discarding them — the editor's own
 *  "Compare" control, so a placement can be checked against the shipped one
 *  without saving, reloading or losing the edit. */
export function setEditing(on: boolean): void {
  editing = on
  emit()
}

/** The live doc, or an empty one, ready to be mutated into a new object. */
function draft(): SceneDoc {
  return doc ?? emptyDoc()
}

function withTheme(d: SceneDoc, theme: ThemeKey, fn: (t: SceneDoc[ThemeKey]) => SceneDoc[ThemeKey]): SceneDoc {
  return { ...d, [theme]: fn(d[theme] ?? emptyThemeDoc()) }
}

/** Merge a patch into one slot of one theme. `null` clears the whole slot. */
export function patchSlot(theme: ThemeKey, slot: string, patch: Partial<SlotOverride> | null): void {
  const d = draft()
  setDoc(
    withTheme(d, theme, (t) => {
      const slots = { ...t.slots }
      if (patch === null) delete slots[slot]
      else slots[slot] = { ...slots[slot], ...patch }
      return { ...t, slots }
    }),
  )
}

/** Merge a patch into one added piece. `null` removes it outright — an extra
 *  has no shipped default to fall back to, so deleting it IS the undo. */
export function patchExtra(theme: ThemeKey, id: string, patch: Partial<Extra> | null): void {
  const d = draft()
  setDoc(
    withTheme(d, theme, (t) => ({
      ...t,
      extras:
        patch === null
          ? t.extras.filter((e) => e.id !== id)
          : t.extras.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    })),
  )
}

export function addExtra(theme: ThemeKey, extra: Extra): void {
  const d = draft()
  setDoc(withTheme(d, theme, (t) => ({ ...t, extras: [...t.extras, extra] })))
}

/* ── reads, for the art layer ──────────────────────────────────────────── */

/**
 * The override for one slot, or `undefined`.
 *
 * Called by every `ThemedArt` / `StillArt` on the page — about thirty of them
 * — so the fast path matters: when no draft is loaded this returns the same
 * `undefined` for every slot on every render and React does nothing.
 */
export function useSlotOverride(slot: string, theme: ThemeKey): SlotOverride | undefined {
  return useSyncExternalStore(
    subscribe,
    () => (editing && doc ? doc[theme]?.slots?.[slot] : NO_OVERRIDE),
    () => NO_OVERRIDE,
  )
}

/** The added pieces anchored in one section, or a frozen empty array. */
export function useExtras(section: SectionId, theme: ThemeKey): readonly Extra[] {
  return useSyncExternalStore(
    subscribe,
    () => {
      if (!editing || !doc) return NO_EXTRAS
      const all = doc[theme]?.extras
      if (!all || all.length === 0) return NO_EXTRAS
      /* Memoised per (section, theme) so a filter that returns the same rows
         returns the same ARRAY — otherwise every emit hands React a new
         reference and re-renders seven section hosts for one dragged pixel. */
      return sliceExtras(all, section)
    },
    () => NO_EXTRAS,
  )
}

let sliceSource: readonly Extra[] | null = null
const sliceCache = new Map<SectionId, readonly Extra[]>()

function sliceExtras(all: readonly Extra[], section: SectionId): readonly Extra[] {
  if (all !== sliceSource) {
    sliceSource = all
    sliceCache.clear()
  }
  const hit = sliceCache.get(section)
  if (hit) return hit
  const rows = all.filter((e) => e.section === section)
  const value = rows.length ? Object.freeze(rows) : NO_EXTRAS
  sliceCache.set(section, value)
  return value
}

/** Whether the editor is currently applying its draft, for the chrome that
 *  wants to know (the outline layer, the section hosts). */
export function useEditing(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => editing,
    () => false,
  )
}

/** The whole draft, for the editor's own panels. */
export function useDoc(): SceneDoc | null {
  return useSyncExternalStore(
    subscribe,
    () => doc,
    () => null,
  )
}

/* ── load and save ────────────────────────────────────────────────────────
   Both are called only from the editor chunk. They live here rather than in
   the editor so that the store owns its own persistence and there is exactly
   one place that knows the file's name. */

/** Local first (an unsaved edit outlives a reload), then the committed file. */
export async function loadDraft(): Promise<SceneDoc> {
  try {
    const raw = window.localStorage.getItem(LS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as SceneDoc
      if (parsed?.version === 1) return normalise(parsed)
    }
  } catch {
    /* private mode, or a draft written by an older shape — fall through */
  }
  try {
    const res = await fetch(asset('scene/draft.json'), { cache: 'no-store' })
    if (res.ok) {
      const parsed = (await res.json()) as SceneDoc
      if (parsed?.version === 1) return normalise(parsed)
    }
  } catch {
    /* no draft has ever been saved; an empty one is the right answer */
  }
  return emptyDoc()
}

/** Both halves always present, so no consumer has to check. */
function normalise(d: SceneDoc): SceneDoc {
  return {
    version: 1,
    dark: { slots: d.dark?.slots ?? {}, extras: d.dark?.extras ?? [] },
    light: { slots: d.light?.slots ?? {}, extras: d.light?.extras ?? [] },
  }
}

export type SaveResult = { where: 'repo' | 'local'; detail: string }

/**
 * Save the draft.
 *
 * In `vite dev` this writes `public/scene/draft.json` in the working tree, so
 * the edit is a file you can see in `git status` and I can read when it is
 * time to make it the default. Anywhere else there is no endpoint to write it,
 * so the draft goes to `localStorage` and the caller is told — the editor then
 * offers the same JSON as a download rather than pretending it landed.
 */
export async function saveDraft(next: SceneDoc): Promise<SaveResult> {
  const body = JSON.stringify(next, null, 2)
  try {
    window.localStorage.setItem(LS_KEY, body)
  } catch {
    /* nothing to persist to locally; the POST below may still land */
  }
  if (import.meta.env.DEV) {
    try {
      const res = await fetch('/__scene', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      })
      if (res.ok) return { where: 'repo', detail: 'public/scene/draft.json' }
    } catch {
      /* the dev middleware is not there — fall through to the local answer */
    }
  }
  return { where: 'local', detail: 'this browser only' }
}

/** Forget the local copy, so the next load takes the committed file. */
export function clearLocal(): void {
  try {
    window.localStorage.removeItem(LS_KEY)
  } catch {
    /* nothing stored */
  }
}
