import { useEffect, useRef, type ReactNode } from 'react'
import { MODAL_LAYER, useEscape } from '../lib/modal'
import './Store.css'

/**
 * The panel every plan chooser on this site is drawn in, and its rows.
 *
 * Lifted out of `Store.tsx` (2.13.0) the day TDG Cloud gained a shelf,
 * because rule 11 of AGENTS.md — a thing sold more than one way looks the
 * SAME wherever it appears — was being kept mechanically by both of that
 * file's choosers being one component, and a third shop drawing its own copy
 * would have been the drift the rule exists to prevent. The pack cards, the
 * Cloud shelf and the Account page's Cloud manage panel all render THIS
 * component; none of them owns a lookalike.
 *
 * `Store.css` is imported here rather than only in `Store.tsx` so the panel
 * carries its own clothes to pages the Store chunk never loads on — the
 * Account page's Cloud fold is one.
 *
 * Everything below this line is the original reasoning, unchanged.
 *
 * There are two kinds of chooser — choosing a plan before buying, and
 * changing or stopping one afterwards — and rule 11 is that they look the
 * same. That promise is kept mechanically here rather than by two files
 * agreeing: both choosers are this component, so the scrim, the head, the
 * dialog role, Escape, the focus and the animation cannot drift apart.
 *
 * Drawn OVER the card and never pushed into it, for the reason `Store.css`
 * sets out at length: the packs sit in a grid row, a grid row stretches its
 * siblings to the tallest of them, and an expansion in the flow would grow
 * BOTH cards and leave a hole under the other one's button.
 *
 * `step` re-runs the focus. The subscription panel replaces its own rows with
 * a confirm question in place, and focus that stayed on a button which no
 * longer exists is a keyboard reader stranded on the page behind the panel.
 */
export function PlanPanel({
  label,
  title,
  step,
  onClose,
  children,
}: {
  /** Names the pack, per rule 14: a dialog says what it is about. */
  label: string
  /** The 10px mono head. Title Case. */
  title: string
  /** Changes when the panel's contents are replaced, so focus follows. */
  step: string
  onClose: () => void
  children: ReactNode
}) {
  const panel = useRef<HTMLDivElement>(null)

  // Put the keyboard where the choice is. The first row rather than the close
  // button: this panel's actions are all reversible or confirmed, and landing
  // on Close would make the keyboard route to the thing the panel exists for
  // the longest one on the card.
  useEffect(() => {
    panel.current
      ?.querySelector<HTMLButtonElement>('.store__plan, .store__ask-row button')
      ?.focus({ preventScroll: true })
  }, [step])

  // Escape backs out of it the way it backs out of every other thing that
  // opens on this site — through the SAME stack, so the press goes to whatever
  // is painted in front and to nothing else. Still deliberately not `useModal`:
  // that locks the page's scroll for a dialog covering all of it, and this one
  // is anchored inside a card that is a third of the page and leaves the rest
  // scrolling. `useEscape` is that ordering without the lock; a listener of its
  // own is what had a panel closing underneath the auth modal opened over it.
  useEscape({ open: true, onClose, layer: MODAL_LAYER.storePlan })

  return (
    <>
      {/* A press anywhere else closes it. A button rather than a bare div so it
          is a real click target with real semantics, and hidden from a screen
          reader because Escape is its keyboard equivalent and a second "close"
          in the tab order is noise. */}
      <button
        type="button"
        className="store__plans-scrim"
        tabIndex={-1}
        aria-hidden="true"
        onClick={onClose}
      />
      <div ref={panel} className="store__plans" role="dialog" aria-label={label}>
        <div className="store__plans-head">
          <p className="store__plans-title">{title}</p>
          <button type="button" className="store__plans-close" onClick={onClose}>
            <span className="sr-only">Close this panel</span>
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </>
  )
}

/**
 * One row of a chooser: a name, a line saying what it does, and the money.
 *
 * The money column is reserved in EVERY row, empty where there is nothing to
 * say, for the reason the saving badge is: a column present on one row and
 * absent from another makes those rows different heights, which is the same
 * unevenness the chooser was built to remove, one level down.
 */
export function PlanRow({
  label,
  note,
  money,
  tone,
  onClick,
}: {
  label: string
  note: string
  money?: ReactNode
  /** `leave` draws the row as the way out. Nothing else is ever tinted. */
  tone?: 'leave'
  onClick: () => void
}) {
  return (
    <li>
      <button type="button" className="store__plan" data-tone={tone} onClick={onClick}>
        <span className="store__plan-text">
          <span className="store__plan-label">{label}</span>
          <span className="store__plan-note">{note}</span>
        </span>
        <span className="store__plan-money">{money}</span>
      </button>
    </li>
  )
}

/**
 * The one line under a plan's name, in the words the money is actually in.
 *
 * Written off the plan's KIND rather than its id-by-id, so a fourth plan on
 * some future pack still gets a sentence instead of a blank. Nothing here
 * names an amount: the row beside it already carries the only copy of that.
 */
export function planNote(planId: string): string {
  if (planId === 'monthly') return 'Billed every month. Cancel any time.'
  if (planId === 'annual') return 'Billed once a year. Cancel any time.'
  return 'Paid once. Yours for good, no renewal.'
}
