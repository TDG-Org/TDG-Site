import { useSyncExternalStore } from 'react'
import scene from './scene.json'
import { emptyDoc, emptyThemeDoc, type Extra, type SceneDoc, type SectionId, type SlotOverride, type ThemeKey } from './types'

/**
 * The scene, as one module-level store.
 *
 * ## What this is now, and what it used to be
 *
 * It used to hold a *draft*: a JSON file in `public/`, fetched by the editor,
 * drawn only while a signed-in admin had the editor switched on, and turned
 * into the real page later by a person hand-writing CSS. That second stage is
 * why the owner had to ask, in as many words, for his saved changes to be
 * "applied to main" — and then, the next day, for **every** save to "really
 * apply to the actual site".
 *
 * So the draft is gone and this is the scene. `src/scene/scene.json` is
 * committed **source**, imported here, bundled into the app by Vite, and
 * applied for **everybody** — signed in or not, editor loaded or not. Pressing
 * Save in the Scene Editor writes that file (see
 * `scripts/scene-plugin.mjs`), and what the file says is what the site is.
 *
 * ## What that costs a visitor, exactly
 *
 * - **No fetch.** A JSON import is inlined into the bundle at build time, so
 *   there is no request, no waterfall, and no window in which the art paints
 *   in its stylesheet position and then jumps. The overrides are there in the
 *   first render, which a fetched draft could never be.
 * - **No editor.** Nothing here imports `scene/editor/`. The dock is still a
 *   lazy chunk behind an admin check and a per-device switch
 *   (`src/scene/sceneMode.ts`); it is the thing that WRITES the scene, not the
 *   thing that applies it.
 * - **No new object per render.** `useSlotOverride` hands back a reference out
 *   of the imported document — the same one every render — so
 *   `useSyncExternalStore` sees a stable snapshot and nothing re-renders. With
 *   an empty scene it hands back the same `undefined` it always did.
 *
 * ## Two documents, and why
 *
 * - `saved` is what is on disk: the imported file, replaced when a Save lands.
 * - `doc` is what the editor is holding, `saved` plus whatever has been
 *   dragged since.
 *
 * Reads take `doc` while the editor is editing and `saved` otherwise, which is
 * what makes the dock's **Edits** toggle a real comparison — off shows the
 * page as it is actually saved, not "the page with no overrides at all", which
 * is what the old Compare showed and has not been the same thing since the
 * first draft was baked into CSS.
 *
 * There is deliberately **no `localStorage`**. A per-browser copy of the scene
 * is how the pill came to read "12 edits" against a file that had been emptied
 * days earlier: the browser had the old document and the site had the new one,
 * and nothing on screen could tell you which you were looking at. One file,
 * one answer.
 */

/** What is on disk. Replaced by a successful Save, and by HMR when the file
 *  changes under a running dev server. */
let saved: SceneDoc = normalise(scene as unknown as SceneDoc)

/** What the editor is holding. The same document until something is dragged. */
let doc: SceneDoc = saved

/** Whether the editor's unsaved document is the one being drawn. */
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

/** The document the page is currently drawing. */
const active = (): SceneDoc => (editing ? doc : saved)

/* ── the empty answer ──────────────────────────────────────────────────────
   A frozen module constant rather than a fresh object, because
   `useSyncExternalStore` compares snapshots by identity and a new `{}` every
   render is an infinite loop rather than an optimisation. */
const NO_EXTRAS: readonly Extra[] = Object.freeze([])

export const getDoc = (): SceneDoc => doc

/** What is on disk, for the editor to compare against. */
export const getSaved = (): SceneDoc => saved

/** Replace the editor's document. Used by every edit, by undo and by Clear. */
export function setDoc(next: SceneDoc): void {
  doc = next
  emit()
}

/** Draw the editor's unsaved document, or the saved one. The dock's **Edits**
 *  toggle, so a placement can be checked against what is actually saved
 *  without saving, reloading or losing the edit. */
export function setEditing(on: boolean): void {
  editing = on
  emit()
}

function withTheme(d: SceneDoc, theme: ThemeKey, fn: (t: SceneDoc[ThemeKey]) => SceneDoc[ThemeKey]): SceneDoc {
  return { ...d, [theme]: fn(d[theme] ?? emptyThemeDoc()) }
}

/** Merge a patch into one slot of one theme. `null` clears the whole slot. */
export function patchSlot(theme: ThemeKey, slot: string, patch: Partial<SlotOverride> | null): void {
  setDoc(
    withTheme(doc, theme, (t) => {
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
  setDoc(
    withTheme(doc, theme, (t) => ({
      ...t,
      extras:
        patch === null
          ? t.extras.filter((e) => e.id !== id)
          : t.extras.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    })),
  )
}

export function addExtra(theme: ThemeKey, extra: Extra): void {
  setDoc(withTheme(doc, theme, (t) => ({ ...t, extras: [...t.extras, extra] })))
}

/* ── reads, for the art layer ──────────────────────────────────────────── */

/**
 * The override for one slot, or `undefined`.
 *
 * Called by every `ThemedArt` / `StillArt` on the page — about thirty of them
 * — so the snapshot has to be stable: this returns a reference out of the
 * current document, which does not change until something replaces the
 * document. With an empty scene every slot returns the same `undefined`.
 */
export function useSlotOverride(slot: string, theme: ThemeKey): SlotOverride | undefined {
  return useSyncExternalStore(
    subscribe,
    () => active()[theme]?.slots?.[slot],
    () => saved[theme]?.slots?.[slot],
  )
}

/** The added pieces anchored in one section, or a frozen empty array. */
export function useExtras(section: SectionId, theme: ThemeKey): readonly Extra[] {
  return useSyncExternalStore(
    subscribe,
    () => slice(active(), section, theme),
    () => slice(saved, section, theme),
  )
}

function slice(d: SceneDoc, section: SectionId, theme: ThemeKey): readonly Extra[] {
  const all = d[theme]?.extras
  if (!all || all.length === 0) return NO_EXTRAS
  /* Memoised per (section, theme) so a filter that returns the same rows
     returns the same ARRAY — otherwise every emit hands React a new reference
     and re-renders seven section hosts for one dragged pixel. */
  return sliceExtras(all, section)
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

/** The editor's document, for the editor's own panels. */
export function useDoc(): SceneDoc {
  return useSyncExternalStore(
    subscribe,
    () => doc,
    () => saved,
  )
}

/** Both halves always present, so no consumer has to check. */
function normalise(d: SceneDoc): SceneDoc {
  if (d?.version !== 1) return emptyDoc()
  return {
    version: 1,
    dark: { slots: d.dark?.slots ?? {}, extras: d.dark?.extras ?? [] },
    light: { slots: d.light?.slots ?? {}, extras: d.light?.extras ?? [] },
  }
}

/* ── saving ───────────────────────────────────────────────────────────────
   Called only from the editor chunk. It lives here rather than in the editor
   so that the store owns its own persistence and there is exactly one place
   that knows the file's name. */

export type SaveResult = { where: 'repo' | 'nowhere'; detail: string }

/**
 * Write the scene.
 *
 * In `vite dev` this POSTs to `/__scene`, which `scripts/scene-plugin.mjs`
 * answers by writing `src/scene/scene.json` in the working tree — so the edit
 * is a file that shows up in `git diff`, survives a restart, and is what the
 * next build ships. **That is the whole point: there is no second stage.**
 *
 * A built site has no such endpoint and cannot write to a repo it was compiled
 * out of, so there Save writes nothing and says so, and the editor's Download
 * button hands over the same JSON to commit by hand. Pretending otherwise —
 * which a `localStorage` fallback did — is what made a Save button that
 * appeared to work and changed nothing.
 */
export async function saveScene(next: SceneDoc): Promise<SaveResult> {
  if (import.meta.env.DEV) {
    try {
      const res = await fetch('/__scene', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(next, null, 2),
      })
      if (res.ok) {
        saved = next
        doc = next
        emit()
        return { where: 'repo', detail: 'src/scene/scene.json' }
      }
    } catch {
      /* the dev middleware is not there — fall through to the honest answer */
    }
  }
  return {
    where: 'nowhere',
    detail: import.meta.env.DEV
      ? 'the dev server did not answer /__scene'
      : 'a built site cannot write to the repo',
  }
}

/*
 * ── the file changing under a running dev server ──────────────────────────
 *
 * A Save writes `scene.json`, Vite notices, and without this the whole page
 * reloads: an editing session's selection, scroll position and undo history
 * gone every time the owner presses Save. Accepting the dependency here
 * swallows the reload and swaps the document in place instead, so a Save shows
 * up as the page redrawing from the file it just wrote.
 *
 * `doc` is only replaced when nothing is being edited. Otherwise the editor is
 * holding unsaved work — a hand-edit of the file mid-session must not throw it
 * away — and `saved` moving on its own is exactly what the **Edits** toggle
 * wants to compare against.
 */
if (import.meta.hot) {
  import.meta.hot.accept('./scene.json', (mod) => {
    if (!mod) return
    saved = normalise((mod as { default?: SceneDoc }).default as SceneDoc)
    if (!editing) doc = saved
    emit()
  })
}
