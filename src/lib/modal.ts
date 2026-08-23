import { useEffect, useRef, type RefObject } from 'react'

/**
 * The three things every dialog on this site owes the page behind it: the
 * scroll lock, Escape, and the focus its opener wants back.
 *
 * ## Why this is one shared thing and not four copies
 *
 * Each dialog used to save `body.style.overflow`, set `hidden`, and put its own
 * saved value back on close. That is correct for exactly one dialog at a time.
 * Two of them — the reply panel opening at boot over an already-open Send
 * Feedback form — and the second one saves `hidden` as the value to restore.
 * One Escape closed both in the same commit, the cleanups ran in tree order,
 * and the page was left with `overflow: hidden` and nothing on top of it: no
 * scrolling until a reload. So the lock is counted here instead, and only the
 * LAST dialog to leave puts the page back.
 *
 * ## Escape belongs to the topmost dialog only
 *
 * Each open dialog pushed its own `keydown` listener on `document`, so one key
 * press reached all of them. A stack fixes it at the source: the key is
 * listened for once, and it is handed to whichever dialog opened last.
 *
 * Listeners on `document` that are NOT dialogs — the account menu's own Escape
 * — are deliberately left alone. They close a menu, not a layer, and nothing
 * here should reach across and cancel them.
 *
 * ## Focus
 *
 * Whatever had focus when the dialog opened gets it back when the dialog
 * closes, per AGENTS.md rule 14 — unless it has since left the page or been
 * made unfocusable, in which case the restore is skipped rather than guessed
 * at. Pass `focusFirst` to say where focus should land on open; the close
 * button is the safe answer for a dialog whose primary action is destructive
 * or one-way.
 */

/** How many dialogs are open. The page is unlocked when this reaches zero. */
let depth = 0
/** What `body.style.overflow` was before the FIRST dialog locked it. */
let restore = ''
/** Every open dialog's close, oldest first. Escape goes to the last. */
const closers: (() => void)[] = []

function onDocumentKey(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  closers[closers.length - 1]?.()
}

export function useModal(
  open: boolean,
  onClose: () => void,
  focusFirst?: RefObject<HTMLElement | null>,
): void {
  // `onClose` is almost always an inline arrow, so it is a new function on
  // every render of the parent. Keeping it in a ref is what lets the effect
  // below depend on `open` alone — re-running it per render would re-take the
  // focus and re-capture the opener sixty times a second.
  const close = useRef(onClose)
  close.current = onClose

  useEffect(() => {
    if (!open) return

    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null

    if (depth === 0) {
      restore = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      document.addEventListener('keydown', onDocumentKey)
    }
    depth += 1

    const mine = () => close.current()
    closers.push(mine)

    focusFirst?.current?.focus()

    return () => {
      const i = closers.lastIndexOf(mine)
      if (i !== -1) closers.splice(i, 1)
      depth -= 1
      if (depth === 0) {
        document.body.style.overflow = restore
        document.removeEventListener('keydown', onDocumentKey)
      }
      // What does NOT work: an opener that is still mounted but has since gone
      // `inert` — the account menu's buttons, once the menu shuts — accepts
      // this call and ignores it, so focus stays on `body`. That is why the
      // account menu hands focus back to its own trigger before opening a
      // dialog, which leaves a live element here to return to.
      if (opener?.isConnected) opener.focus()
    }
  }, [open, focusFirst])
}
