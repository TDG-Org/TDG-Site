import { useSyncExternalStore } from 'react'

/**
 * The switch that opens the Scene Editor.
 *
 * Deliberately the same shape as `src/dev/devMode.ts` — one localStorage key,
 * one cached read, one `storage` listener — because it is answering the same
 * question about the same kind of thing: a per-DEVICE preference about this
 * browser's chrome, not a permission.
 *
 * The permission is `useAuth().isAdmin`, checked at the one place the editor
 * is mounted (`App.tsx`). Flipping this in a browser that is not signed in as
 * a developer does nothing at all: the chunk is never imported, so there is no
 * dock to show, and the art store stays empty so the page is the page.
 *
 * **OFF by default**, which is the opposite of the Developer tab and is the
 * point. The tab is a place you go; this takes the page over — a pick sheet
 * over the whole viewport and every drift frozen — and nobody should meet that
 * because they logged in.
 */
const KEY = 'tdg.scene-editor'

function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) === 'on'
  } catch {
    // Private mode, or storage disabled. Off is the safe answer.
    return false
  }
}

const listeners = new Set<() => void>()
let cached = read()

export function setSceneMode(on: boolean): void {
  try {
    window.localStorage.setItem(KEY, on ? 'on' : 'off')
  } catch {
    /* nothing to persist to; the in-memory value below still flips */
  }
  cached = on
  for (const fn of listeners) fn()
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY && e.key !== null) return
    cached = read()
    for (const l of listeners) l()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(fn)
    window.removeEventListener('storage', onStorage)
  }
}

export function useSceneMode(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => cached,
    () => false,
  )
}
