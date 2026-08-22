import { useSyncExternalStore } from 'react'

/**
 * Developer Mode: the switch that shows or hides the Developer tab.
 *
 * ## What it does, and what it deliberately does not
 *
 * It controls ONE thing: whether "Developer" appears in the nav. It is not a
 * permission and it never was. `profiles.is_admin` decides who may open the
 * console, and Postgres re-checks that on every single read and write (see
 * supabase/migrations/20260821090000_tdg_core_admin_console.sql). Turning this
 * on in a browser that is not signed in as a developer changes nothing at all:
 * there is no tab to show, and `#/dev` still renders the home page.
 *
 * ## Why per-device rather than on the account
 *
 * It is a preference about THIS browser's chrome, like the theme toggle beside
 * it. Storing it on the profile would sync a decision made on a laptop at 2am
 * onto the machine being screen-shared the next morning, which is the opposite
 * of what "hide the tab" is for. localStorage also answers instantly, so the
 * nav never renders the wrong shape while a round trip is in flight.
 *
 * ## Getting the tab back after turning it off
 *
 * The switch lives in the account menu, which a developer always has, so it can
 * always be turned back on. `#/dev` also keeps working while it is off. The
 * hidden tab is about tidiness and shoulder-surfing, not about locking yourself
 * out of your own tools.
 */
const KEY = 'tdg.dev-tab'

/** ON unless it has been deliberately switched off. A developer who has just
 *  been granted the flag should SEE the thing they were granted. */
function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) !== 'off'
  } catch {
    // Private mode, or storage disabled. The default is the safe answer.
    return true
  }
}

const listeners = new Set<() => void>()

function emit() {
  for (const fn of listeners) fn()
}

export function setDevMode(on: boolean): void {
  try {
    window.localStorage.setItem(KEY, on ? 'on' : 'off')
  } catch {
    /* nothing to persist to; the in-memory value below still flips */
  }
  cached = on
  emit()
}

/** `read()` hits localStorage, and useSyncExternalStore calls the snapshot on
 *  every render, so cache it and the switch is not a synchronous disk read per
 *  frame. Another tab's change arrives through the `storage` event below. */
let cached = read()

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY && e.key !== null) return
    cached = read()
    emit()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(fn)
    window.removeEventListener('storage', onStorage)
  }
}

export function useDevMode(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => cached,
    // Server snapshot: this site never renders on a server, but React asks.
    () => true,
  )
}
