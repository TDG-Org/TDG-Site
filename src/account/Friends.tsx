import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MODAL_LAYER, useBackdropClose, useModal } from '../lib/modal'
import { fmtCount } from './format'
import { PeopleList, SearchPill } from './People'
import type { Person, SocialAction } from './api'

/**
 * Everything about drawing the friends list, in one place, because it is drawn
 * in two.
 *
 * ## Why there are two of it
 *
 * The Friends subsection used to print every friend into the section, which
 * is fine at three and is a wall at forty: the section below it — Privacy —
 * moved a screen further down for every ten people somebody knows, and the
 * page stopped being scannable at exactly the point the account got
 * interesting. So the section shows **the first row and no more**, and `See
 * All Friends` opens the whole list as a panel.
 *
 * **The first row is measured, not assumed.** `.acct__grid` is
 * `repeat(auto-fill, minmax(min(100%, 230px), 1fr))`, so how many fit is a
 * question about the width it is being read at, and the answer is different on
 * a phone, in the shell at 1002px and on a 4K monitor. `useGridColumns` asks
 * the grid itself — see its own note.
 *
 * ## One list, drawn twice, never written twice
 *
 * The panel is not a second friends list with its own search box; it is the
 * same `PeopleList`, the same `FriendsBar` and the same count line, over the
 * same `query` and `sort` state as the section. Type in the section, press See
 * All, and the panel opens on what you were already looking at. That is also
 * why the two are here rather than inlined at both call sites: two lookalike
 * lists are two chances for one of them to sort differently, or to disagree
 * about what "3 of 12 match" counts.
 *
 * What the panel deliberately does NOT carry is the Friend Requests and
 * Blocked buttons. Those are not part of the friends list — they swap the
 * section for a different view of the graph, and a button inside a panel that
 * silently rearranged the page behind it would be a trapdoor.
 */

/**
 * The sentence under the Friends heading, said once.
 *
 * It is the section's `what` AND the panel's subtitle. Two copies of a line
 * this specific is how a rule gets softened in one place and not the other.
 */
export const FRIENDS_WHAT =
  'Star the ones you want at the top. Unfriending ends it for both of you, and they are not told.'

/** How the friends grid is ordered.
 *
 *  **Favourites float to the top of every one of them**, which is Bible
 *  Educator's rule rather than a mode of its own: a star you press should show
 *  in whatever order you are reading, not only in the one sort that honours
 *  it. `Array.prototype.sort` is stable, so the name sort survives inside the
 *  starred and unstarred groups.
 *
 *  There is deliberately no **Recently Added**. Bible Educator has one because
 *  its friend list arrives in the order friendships were made; `tdg_my_friends`
 *  answers alphabetically and keeps no join date, so the same option here could
 *  only be a guess wearing a real label. */
export const FRIEND_SORTS = [
  { id: 'az', label: 'Name (A–Z)' },
  { id: 'za', label: 'Name (Z–A)' },
] as const

export type FriendSort = (typeof FRIEND_SORTS)[number]['id']

/** Case-folded and accent-blind, so `rose` finds `Rosé`. The same courtesy the
 *  server's own search extends, kept here so the two boxes on this panel do not
 *  behave differently from each other. */
const fold = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

const personName = (p: Person) => (p.displayName || p.username || '￿').toLowerCase()

export function orderFriends(people: Person[], sort: FriendSort, query: string): Person[] {
  const q = fold(query.trim())
  const list = q
    ? people.filter((p) =>
        [p.displayName, p.username, p.bio].some((field) => field && fold(field).includes(q)),
      )
    : [...people]
  const byName = (a: Person, b: Person) => personName(a).localeCompare(personName(b))
  list.sort(sort === 'za' ? (a, b) => byName(b, a) : byName)
  return list.sort((a, b) => Number(b.favorite) - Number(a.favorite))
}

/**
 * How many cards the grid is drawing per row, asked of the grid.
 *
 * **The stylesheet's numbers are not re-typed here.** `getComputedStyle`
 * returns the USED value of `grid-template-columns` — `243px 243px 243px
 * 243px`, one entry per track the browser actually made — so counting them is
 * the same answer the layout gave, and it cannot drift when `--acct-card-min`
 * or the gap changes. Recomputing `floor((w + gap) / (min + gap))` in here
 * would be a second copy of the grid, in a language that cannot see it.
 *
 * **`auto-fill` is what makes this askable.** It keeps the empty tracks in the
 * used value, so a grid holding one card still reports the four that fit —
 * which is exactly the question, because the point is to cut the list down to
 * a row before the row exists. `auto-fit` would collapse them and answer 1
 * every time.
 *
 * `useLayoutEffect`, not `useEffect`: the first read happens after the DOM is
 * committed and BEFORE the browser paints, so the caller's fallback — draw
 * everything until this answers — is never a frame anybody sees. A
 * `ResizeObserver` keeps it true through a window drag, a theme change that
 * moves nothing, and the fold opening.
 *
 * Zero means *not measured*, which is a real state and not a count: there is no
 * grid at all while the list is empty, and none while the section has never
 * been opened. The caller draws the whole list for it rather than an empty
 * section, because failing to measure must never look like having no friends.
 *
 * It takes the ELEMENT and not a ref object, which is the half that was wrong
 * first. A `RefObject` never changes identity, so an effect keyed on one runs
 * once and keeps observing whatever was mounted then — and this grid unmounts
 * every time a filter empties it and mounts again on the next keystroke. Held
 * in state via a callback ref, the effect re-runs with the live element.
 */
export function useGridColumns(el: HTMLElement | null): number {
  const [cols, setCols] = useState(0)

  useLayoutEffect(() => {
    if (!el) {
      setCols(0)
      return
    }
    const read = () => {
      const tracks = getComputedStyle(el).gridTemplateColumns
      const n = !tracks || tracks === 'none' ? 0 : tracks.split(/\s+/).filter(Boolean).length
      // Same answer, same state: an observer that fires on the height change
      // this component's own slice causes must not start a second render.
      setCols((was) => (was === n ? was : n))
    }
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [el])

  return cols
}

/**
 * The search box and the sort, which are one mirrored pair (AGENTS.md rule 6):
 * both take their height from `.acct__bar`'s `align-items: stretch` rather
 * than from two sets of paddings that happen to agree.
 *
 * `idPrefix` exists because the section and the panel can be mounted at the
 * same time, and two `<label for>` targets sharing an id is a label that picks
 * whichever the parser saw first.
 */
export function FriendsBar({
  idPrefix,
  query,
  setQuery,
  sort,
  setSort,
  disabled,
}: {
  idPrefix: string
  query: string
  setQuery: (value: string) => void
  sort: FriendSort
  setSort: (sort: FriendSort) => void
  disabled: boolean
}) {
  return (
    <>
      <SearchPill
        id={`${idPrefix}-filter`}
        value={query}
        onChange={setQuery}
        placeholder="Search your friends"
        label="Search your friends"
        disabled={disabled}
      />
      <div className="acct__bar-sort" data-disabled={disabled || undefined}>
        <label className="sr-only" htmlFor={`${idPrefix}-sort`}>
          Sort your friends
        </label>
        <select
          id={`${idPrefix}-sort`}
          className="acct__select"
          value={sort}
          disabled={disabled}
          onChange={(e) => setSort(e.currentTarget.value as FriendSort)}
        >
          {FRIEND_SORTS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        {/* The native arrow is gone with `appearance: none`, so the control
            draws its own — rule 5. */}
        <span className="acct__select-chevron" aria-hidden="true">
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            focusable="false"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </div>
    </>
  )
}

/**
 * The count over the list.
 *
 * The filtered figure against the total, so a search that hides half the list
 * says so rather than looking like half the friends went missing. Shared
 * because the section and the panel are two views of one list, and a count
 * that read differently in each would be the clearest possible way of saying
 * they are not.
 */
export function FriendsCount({
  shown,
  total,
  query,
}: {
  shown: number
  total: number
  query: string
}) {
  if (total === 0) return null
  return (
    <p className="acct__hint acct__bar-count">
      {query.trim()
        ? `${fmtCount(shown)} of ${fmtCount(total)} friends match.`
        : `${fmtCount(total)} friend${total === 1 ? '' : 's'}.`}
    </p>
  )
}

/**
 * Every friend, over the page.
 *
 * A full dialog rather than the Store's in-card panel, because this is not a
 * choice about the card it opened from — it is the same list at its real
 * length, and it needs the width of the page to stay a grid rather than
 * becoming a column. So it takes all five of `useModal`'s promises: the scroll
 * lock, Escape, Tab kept inside, the focus its opener wants back, and a scrim
 * that can tell a click from the tail of a drag.
 *
 * Focus lands on the CLOSE button and not on the search box. The box is one
 * Tab away and the difference matters on a phone, where focusing an input
 * throws the keyboard over the list somebody just asked to see.
 *
 * The bar and the list scroll SEPARATELY: the head, the search and the count
 * stay put and the grid scrolls under them, because a search box that scrolls
 * off the top of a long list is a search box you have to go back for.
 *
 * ## Why it is portalled, which is the one thing here that had to be driven
 *
 * The other four dialogs on this site are mounted in `App.tsx`, so their
 * `z-index` is measured in the page's root stacking context and the nav goes
 * under them. This one is opened from inside a section of the account page,
 * and `.shell` is `position: relative; z-index: 1` — a stacking context. Built
 * in place, the scrim covered the viewport exactly (measured: 0, 0, 1920, 945)
 * and the fixed nav at `z-index: 60` still painted straight over the top of
 * it, lit and clickable, because 190 inside a context of 1 loses to 60 outside
 * it. That is not a cosmetic fault: a modal you can click the nav through is a
 * modal that lets you navigate away from a page whose scroll it has locked.
 *
 * `createPortal` puts it on `document.body`, which is where the other four
 * effectively are, and none of the rest of this file has to know. `useModal`
 * is unaffected — it keys Tab and Escape off the dialog ELEMENT, not off where
 * that element sits in the tree.
 */
export function FriendsPanel({
  open,
  onClose,
  friends,
  total,
  query,
  setQuery,
  sort,
  setSort,
  busy,
  onAct,
  onFavorite,
}: {
  open: boolean
  onClose: () => void
  /** Already ordered and already filtered — the same array the section drew. */
  friends: Person[]
  /** Every friend, filter or no filter, so the count can say "8 of 12". */
  total: number
  query: string
  setQuery: (value: string) => void
  sort: FriendSort
  setSort: (sort: FriendSort) => void
  busy: ReadonlySet<string>
  onAct: (action: SocialAction, userId: string) => void
  onFavorite: (userId: string, on: boolean) => void
}) {
  const card = useRef<HTMLDivElement>(null)
  const close = useRef<HTMLButtonElement>(null)
  const backdrop = useBackdropClose(onClose)

  useModal({
    open,
    onClose,
    layer: MODAL_LAYER.friends,
    dialog: card,
    focusFirst: close,
  })

  if (!open) return null

  return createPortal(
    <div className="acct__peopleback" {...backdrop}>
      <div
        ref={card}
        className="acct__people"
        role="dialog"
        aria-modal="true"
        aria-labelledby="acct-people-title"
      >
        <header className="acct__people-head">
          <div className="acct__people-eyebrow">Account</div>
          <button
            ref={close}
            type="button"
            className="acct__people-x"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <h2 className="acct__people-title" id="acct-people-title">
          Your Friends
        </h2>
        <p className="acct__people-sub">{FRIENDS_WHAT}</p>

        <div className="acct__bar">
          <FriendsBar
            idPrefix="acct-all"
            query={query}
            setQuery={setQuery}
            sort={sort}
            setSort={setSort}
            disabled={total === 0}
          />
        </div>
        <FriendsCount shown={friends.length} total={total} query={query} />

        <div className="acct__people-body">
          <PeopleList
            people={friends}
            empty={`None of your friends match “${query.trim()}”.`}
            standing="friend"
            busy={busy}
            onAct={onAct}
            onFavorite={onFavorite}
          />
        </div>
      </div>
    </div>,
    document.body,
  )
}
