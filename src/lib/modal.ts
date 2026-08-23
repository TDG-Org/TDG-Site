import { useEffect, useRef, type MouseEvent, type RefObject } from 'react'

/**
 * The four things every dialog on this site owes the page behind it: the
 * scroll lock, Escape, the focus its opener wants back, and a scrim that can
 * tell a click from the tail of a drag.
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
 * listened for once, and it is handed to whichever dialog is actually on top.
 *
 * TOP MEANS PAINTED ON TOP, not opened last, and the two are not the same
 * thing. What does NOT work: handing Escape to the last dialog to open. At
 * boot, a password-recovery link opens the auth modal from an effect while the
 * reply panel is still waiting on `tdg_feedback_inbox()` — so the panel opens
 * SECOND and sits at z-index 290, under a modal at 300. Escape then closed the
 * panel nobody could see and left the one in front of the reader untouched.
 * Hence `layer`: each dialog names the stack it renders on, and Escape goes to
 * the highest, with the last opened winning a tie.
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

/**
 * Which layer a dialog paints on, so Escape can find the one in front.
 *
 * These MIRROR the `z-index` in each dialog's own stylesheet, named beside
 * every number because there is no way to derive one from the other: a value
 * here that disagrees with its stylesheet is a dialog that takes Escape while
 * something else is covering it, which is the exact bug this replaced. Change
 * one, change both.
 */
export const MODAL_LAYER = {
  /** `.dev__fbd-backdrop` — src/dev/DevConsole.css */
  devReport: 195,
  /** `.fb__backdrop` — src/feedback/Feedback.css */
  feedback: 290,
  /** `.authmodal__backdrop` — src/components/AuthModal.css */
  auth: 300,
} as const

type OpenDialog = { layer: number; close: () => void }

/** Every open dialog, oldest first. Escape goes to the topmost. */
const stack: OpenDialog[] = []
/** What `body.style.overflow` was before the FIRST dialog locked it. */
let restore = ''

/**
 * The one in front: highest layer, and among equals the one that opened last.
 *
 * `>=` rather than `>` is what settles a tie, and the only reachable tie is the
 * two feedback dialogs, both at 290. There the last to open is also the later
 * sibling in App.tsx — the reply panel can open over the send form, and the
 * send form cannot be opened under the panel because the panel's scrim covers
 * the nav that opens it — so open order and paint order agree.
 */
function topmost(): OpenDialog | undefined {
  let top: OpenDialog | undefined
  for (const d of stack) if (!top || d.layer >= top.layer) top = d
  return top
}

function onDocumentKey(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  topmost()?.close()
}

export function useModal(
  open: boolean,
  onClose: () => void,
  layer: number,
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

    if (stack.length === 0) {
      restore = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      document.addEventListener('keydown', onDocumentKey)
    }

    const mine: OpenDialog = { layer, close: () => close.current() }
    stack.push(mine)

    focusFirst?.current?.focus()

    return () => {
      const i = stack.lastIndexOf(mine)
      if (i !== -1) stack.splice(i, 1)
      if (stack.length === 0) {
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
  }, [open, layer, focusFirst])
}

/**
 * A scrim that closes on a press which both STARTED and ended on it.
 *
 * Spread onto the backdrop element. What does NOT work: a bare
 * `onClick={onClose}`, or `e.target === e.currentTarget` on its own. A drag
 * that begins inside the card and finishes a few pixels outside it fires its
 * `click` on the nearest common ancestor — the backdrop — so both of those
 * read the tail of a drag-select as "close". Two dialogs here hold text
 * somebody typed: the send form's report, and the console's reply draft. Both
 * were binning it on the way out of a textarea.
 *
 * Lives here rather than in each dialog because it was fixed once, in the send
 * form, and the two copies that were not fixed kept the bug — which is what
 * made it worth a shared function rather than a shared comment.
 */
export function useBackdropClose(onClose: () => void): {
  onMouseDown: (e: MouseEvent<HTMLElement>) => void
  onClick: (e: MouseEvent<HTMLElement>) => void
} {
  // Where a mouse press STARTED. A ref, not state: nothing renders from it,
  // and a mousedown that re-rendered the dialog under the cursor would be its
  // own problem.
  const pressed = useRef(false)
  return {
    onMouseDown: (e) => {
      pressed.current = e.target === e.currentTarget
    },
    onClick: (e) => {
      if (e.target === e.currentTarget && pressed.current) onClose()
    },
  }
}
