import { useEffect, useRef, type MouseEvent, type RefObject } from 'react'

/**
 * The five things every dialog on this site owes the page behind it: the
 * scroll lock, Escape, Tab, the focus its opener wants back, and a scrim that
 * can tell a click from the tail of a drag.
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
 * ## Tab stays inside
 *
 * All four dialogs say `aria-modal="true"`, which tells a screen reader the
 * rest of the page is not there. Tab did not agree: it walked straight out of
 * the card and off down the nav, the shelves and the footer, all of which are
 * still behind an opaque scrim. A promise made in ARIA and broken by the
 * keyboard is worse than not making it, because the reader who most depends on
 * it is the one who cannot see where focus went.
 *
 * So the same listener wraps Tab at both ends of the topmost dialog. What does
 * NOT work: collecting the focusable elements once when the dialog opens. Every
 * dialog here changes shape while it is open — the auth modal swaps its whole
 * form between Sign In and Create Account, the send form replaces the form with
 * a receipt, the console's report dialog grows a confirm step — so the list is
 * read fresh on every press. Also not `inert` on everything else: `Nav.tsx`
 * already puts `inert` on the closed account menu, and stacking it from up here
 * would fight a mechanism that is doing its own job correctly.
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
 * Which layer a dialog paints on, so Escape and Tab can find the one in front.
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

type OpenDialog = {
  layer: number
  close: () => void
  /** The element Tab is not allowed to leave — the one carrying `role="dialog"`. */
  root: RefObject<HTMLElement | null>
}

/** Every open dialog, oldest first. Escape and Tab go to the topmost. */
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

/**
 * Anything the platform would stop at, minus the things it would skip.
 *
 * The `tabIndex >= 0` filter is the half that is easy to get wrong: the send
 * form's kind picker is a roving tabindex, five `<button>`s of which four carry
 * `tabindex="-1"` at any moment. A selector alone matches all five, and the
 * trap would then hand Tab to options the arrow keys own. Reading the property
 * rather than the attribute gets the element's EFFECTIVE value, which is what
 * the browser itself would use.
 */
const FOCUSABLE =
  'a[href],button,input,select,textarea,[tabindex],audio[controls],video[controls],[contenteditable]'

function reachable(el: HTMLElement): boolean {
  if (el.tabIndex < 0) return false
  if (el.matches(':disabled')) return false
  // `inert` hides a whole subtree from focus, and the closed account menu is
  // one — its buttons are still in the DOM and still match the selector.
  if (el.closest('[inert]')) return false
  // No boxes means `display: none` or a collapsed ancestor. `visibility` is
  // checked separately because a hidden element still lays out.
  if (el.getClientRects().length === 0) return false
  return getComputedStyle(el).visibility !== 'hidden'
}

function focusablesIn(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(reachable)
}

function onDocumentKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    topmost()?.close()
    return
  }
  if (e.key !== 'Tab') return

  const root = topmost()?.root.current
  if (!root) return

  const items = focusablesIn(root)
  if (items.length === 0) {
    // A dialog with nothing to land on — the signed-out send form is close to
    // this. Tab still must not leave, so it does nothing at all.
    e.preventDefault()
    return
  }

  const first = items[0]
  const last = items[items.length - 1]
  const active = document.activeElement

  // Focus is not in the dialog: it opened without taking focus (the auth modal
  // passes no `focusFirst`), or a click on the scrim put it on `body`. Either
  // way the next Tab belongs inside, at whichever end the direction implies.
  if (!(active instanceof HTMLElement) || !root.contains(active)) {
    e.preventDefault()
    ;(e.shiftKey ? last : first).focus()
    return
  }

  if (!e.shiftKey && active === last) {
    e.preventDefault()
    first.focus()
  } else if (e.shiftKey && active === first) {
    e.preventDefault()
    last.focus()
  }
}

export type ModalOptions = {
  open: boolean
  onClose: () => void
  /** One of `MODAL_LAYER`. */
  layer: number
  /** The `role="dialog"` element. Tab is kept inside it. */
  dialog: RefObject<HTMLElement | null>
  /** Where focus lands on open. Omit to leave focus where it was. */
  focusFirst?: RefObject<HTMLElement | null>
}

export function useModal({ open, onClose, layer, dialog, focusFirst }: ModalOptions): void {
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

    const mine: OpenDialog = { layer, close: () => close.current(), root: dialog }
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
  }, [open, layer, dialog, focusFirst])
}

/**
 * A scrim that closes on a press which both STARTED and ended on it.
 *
 * Spread onto the backdrop element. What does NOT work: a bare
 * `onClick={onClose}`, or `e.target === e.currentTarget` on its own. A drag
 * that begins inside the card and finishes a few pixels outside it fires its
 * `click` on the nearest common ancestor — the backdrop — so both of those
 * read the tail of a drag-select as "close". Three dialogs here hold something
 * somebody typed: the send form's report, the console's reply draft, and the
 * auth modal's half-entered password. All three were binning it on the way out
 * of a field.
 *
 * Lives here rather than in each dialog because it was fixed once, in the send
 * form, and the three copies that were not fixed kept the bug — which is what
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
