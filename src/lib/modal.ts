import { useEffect, useRef, type MouseEvent, type RefObject } from 'react'

/**
 * The five things every dialog on this site owes the page behind it: the
 * scroll lock, Escape, Tab, the focus its opener wants back, and a scrim that
 * can tell a click from the tail of a drag.
 *
 * `useModal` is all five, and the four full-screen dialogs take all five.
 * `useEscape`, further down, is the ORDERING alone — for a dialog that covers
 * a card rather than the page and therefore owes it rather less. Read that
 * hook's own note for why the two had to come apart.
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
 * The stack is therefore about PAINT ORDER and nothing else, and that is what
 * lets a dialog join it without taking the rest of this file with it. The
 * Store's two in-card panels are members and hold no scroll lock: the lock is
 * counted over the members that ASKED for it, never over `stack.length`.
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
 * A member that names no dialog element is not trapped at all. That is the
 * Store's panels: `role="dialog"`, deliberately NOT `aria-modal`, sitting over
 * one card with the rest of the page still readable and still scrolling. ARIA
 * there promises nothing about the page, so the keyboard owes nothing back,
 * and a trap would strand it in a corner of one card.
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
  /**
   * `.store__plans` — src/components/Store.css.
   *
   * The odd one out, and honestly so: this is page content and not an overlay.
   * `.store__action` is a direct child of `.card`, which `base.css` gives a
   * `z-index`, so the panel's 2 is measured inside the CARD's own stacking
   * context — above its scrim at 1, and below every single thing the page
   * paints over the card, which is the nav at 60 and all three dialogs after
   * it. Small here is the right answer rather than a rounded-down one: a panel
   * anchored in a card cannot cover a full-screen dialog, so it must never take
   * that dialog's Escape.
   */
  storePlan: 2,
  /**
   * `.acct__peopleback` — src/account/Account.css.
   *
   * Under the console's report dialog and every dialog after it, and above the
   * nav at 60, which it has to cover: it is a full-page panel opened from a
   * section of the account page. It can never be on screen with `devReport` —
   * `#/account` and `#/dev` are two routes — so the order between those two is
   * a tidiness, not a rule being kept.
   */
  friends: 190,
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
  /**
   * The element Tab is not allowed to leave — the one carrying `role="dialog"`.
   * Null for a member that does not trap Tab, which is a member that never
   * claimed the page with `aria-modal`.
   */
  root: RefObject<HTMLElement | null> | null
  /** Whether this one is holding the page's scroll lock. */
  holdsLock: boolean
}

/** Every open dialog, oldest first. Escape and Tab go to the topmost. */
const stack: OpenDialog[] = []
/** How many members asked for the scroll lock. Deliberately NOT `stack.length`. */
let locks = 0
/** What `body.style.overflow` was before the FIRST locking dialog took it. */
let restore = ''

/**
 * The one in front: highest layer, and among equals the one that opened last.
 *
 * `>=` rather than `>` is what settles a tie, and one is reachable today.
 *
 * The two feedback dialogs are both at 290. There the last to open is also the
 * later sibling in App.tsx — the reply panel can open over the send form, and
 * the send form cannot be opened under the panel because the panel's scrim
 * covers the nav that opens it — so open order and paint order agree.
 *
 * Two Store panels would be the second, both at 2, and cannot happen yet: one
 * pack is sold more than one way and a card shows one panel. The panels are
 * per-CARD by deliberate choice though, so a second pack gaining plans is the
 * whole of what it takes — a panel's scrim covers its OWN card and leaves the
 * one beside it clickable. Neither would cover the other, paint order would
 * have nothing to say, and the last opened is the one the reader is working
 * in. Note what that tie is NOT: one press closing both, which is exactly what
 * a listener per panel was doing.
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

  // No root is a member that does not trap Tab — the Store's panels, which
  // never claimed the page. Nothing is prevented, so the key does exactly what
  // the browser would have done without this listener.
  const root = topmost()?.root?.current
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

/**
 * Join the stack.
 *
 * The keydown listener follows the STACK — one member is enough to want it.
 * The scroll lock follows the COUNT of members that asked for it, and the two
 * are separate on purpose: `useEscape` wants the ordering and not the lock, and
 * counting the lock off `stack.length` would have it taken by a panel that
 * covers a third of one card.
 */
function enter(mine: OpenDialog) {
  if (stack.length === 0) document.addEventListener('keydown', onDocumentKey)
  stack.push(mine)
  if (!mine.holdsLock) return
  if (locks === 0) {
    restore = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  locks += 1
}

/** Leave it, putting the page back only once the LAST locking dialog has gone. */
function leave(mine: OpenDialog) {
  const i = stack.lastIndexOf(mine)
  // Not in the stack is a member that already left. Returning rather than
  // decrementing anyway is what keeps a double cleanup from unlocking a page
  // that something else is still covering.
  if (i === -1) return
  stack.splice(i, 1)
  if (stack.length === 0) document.removeEventListener('keydown', onDocumentKey)
  if (!mine.holdsLock) return
  locks -= 1
  if (locks === 0) document.body.style.overflow = restore
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

    const mine: OpenDialog = {
      layer,
      close: () => close.current(),
      root: dialog,
      holdsLock: true,
    }
    enter(mine)

    focusFirst?.current?.focus()

    return () => {
      leave(mine)
      // What does NOT work: an opener that is still mounted but has since gone
      // `inert` — the account menu's buttons, once the menu shuts — accepts
      // this call and ignores it, so focus stays on `body`. That is why the
      // account menu hands focus back to its own trigger before opening a
      // dialog, which leaves a live element here to return to.
      if (opener?.isConnected) opener.focus()
    }
  }, [open, layer, dialog, focusFirst])
}

export type EscapeOptions = {
  open: boolean
  onClose: () => void
  /** One of `MODAL_LAYER`. */
  layer: number
}

/**
 * Escape for a dialog that does NOT own the page: the ordering, and nothing
 * else in this file.
 *
 * The Store's two plan panels are why this exists. They carry `role="dialog"`
 * and they close on Escape, but they are anchored inside a card that is a third
 * of the page, and everything around one stays lit, readable and reachable —
 * the nav above a panel opens the auth modal without the panel closing first.
 * `useModal` is wrong for them in three ways at once: it locks a page they are
 * not covering, it traps Tab inside something that never said `aria-modal`, and
 * it takes focus once on open, where a panel puts it on its first row with
 * `preventScroll` and AGAIN each time it swaps those rows for a confirm.
 *
 * What they do need is the stack, and only the stack. Kept outside it with a
 * `document` listener each, a panel open beneath the auth modal took the same
 * Escape as the modal in front of it and closed something the reader could not
 * see — the exact bug the stack was built to end, arriving from the one
 * direction the stack could not reach.
 *
 * So the two properties came apart rather than one being traded for the other:
 * `holdsLock` is what the lock is counted over, and `root: null` is what the
 * Tab trap skips. A member here is a claim about PAINT ORDER and no more.
 *
 * Drive `open`, or call it from a component that exists only while the dialog
 * does — the Store does the second. Either way the entry leaves the stack when
 * the effect tears down.
 */
export function useEscape({ open, onClose, layer }: EscapeOptions): void {
  // The same ref as `useModal`, for the same reason: `onClose` is an inline
  // arrow at every call site, and depending on it would splice and re-push this
  // entry on every render of the card. Push order is what settles a tie between
  // two panels, so churning it would decide the tie by render rather than by
  // which panel the reader opened last.
  const close = useRef(onClose)
  close.current = onClose

  useEffect(() => {
    if (!open) return
    const mine: OpenDialog = {
      layer,
      close: () => close.current(),
      root: null,
      holdsLock: false,
    }
    enter(mine)
    return () => leave(mine)
  }, [open, layer])
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
