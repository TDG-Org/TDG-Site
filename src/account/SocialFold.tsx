import { useMemo, useState } from 'react'
import { useSections } from '../lib/sections'
import { AccountSub } from './AccountFold'
import { fmtCount } from './format'
import {
  FRIENDS_WHAT,
  FriendsBar,
  FriendsCount,
  FriendsPanel,
  orderFriends,
  useGridColumns,
  type FriendSort,
} from './Friends'
import { PeopleList, SearchPill } from './People'
import { usePeopleSearch, type SocialPanel } from './useAccount'

/**
 * Friends & Social — Bible Educator's Friends & Sharing, in this site's own
 * materials.
 *
 * ## What it is not any more
 *
 * It used to open on a list of **every account on the project**, because the
 * people search treated an empty box as a browse. The owner's report was one
 * sentence and it was right: *"I should not be seeing every single user with an
 * account in Friends & Social."* Bible Educator never had that — it has a box
 * you type a handle into and a list of the friends you already have — and a
 * roll-call of everybody who has signed up is a fact about other people that
 * nobody asked to publish. The floor is in Postgres now, not here: see
 * `20260829010000_a_people_search_is_not_a_directory.sql`.
 *
 * ## Three views behind one panel
 *
 * Friends, Friend Requests and Blocked, reached by two buttons that CARRY
 * THEIR OWN COUNTS — which is the whole point of putting them there, because
 * it means both are answerable from the friends list without going in. Bible
 * Educator's structure exactly, and for its reason: requests and blocks are
 * answered rarely, and three sections stacked down one panel made the two you
 * are not using into scenery.
 *
 * The count pill on Friend Requests is the accent one and the count on Blocked
 * is quiet. Accent means *this needs you*; a block needs nothing, and painting
 * its count the same colour would say the opposite of what a block is.
 *
 * ## The friends list is a row, not a wall
 *
 * Only the first row of friends is drawn here, with `See All Friends` under it
 * for the rest. Everything about how that is measured and what the panel is
 * lives in `Friends.tsx`, which the panel and this section share rather than
 * each writing their own.
 */

function CountPill({ n, tone }: { n: number; tone: 'hot' | 'quiet' }) {
  if (n === 0) return null
  return (
    <span className={`chip acct__count ${tone === 'hot' ? 'chip--hot' : ''}`}>{fmtCount(n)}</span>
  )
}

export function SocialFold({ social }: { social: SocialPanel }) {
  const { isOpen } = useSections()
  /*
   * The directory reads nothing until this section is open AND something has
   * been typed. `useSections` is only readable from inside the provider, which
   * is why this is its own component: a shut fold that had already searched
   * would be a request made for a panel nobody has looked at.
   */
  const finder = usePeopleSearch(isOpen('social'))
  const [view, setView] = useState<'friends' | 'requests' | 'blocked'>('friends')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<FriendSort>('az')
  const [showAll, setShowAll] = useState(false)
  /*
   * The grid element, in state rather than in a ref, because `useGridColumns`
   * has to re-observe the one that is actually mounted — see its own note. A
   * callback ref is what puts it here.
   */
  const [grid, setGrid] = useState<HTMLDivElement | null>(null)
  const columns = useGridColumns(grid)

  const graph = social.state.kind === 'ok' ? social.state.graph : null
  const friends = useMemo(
    () => orderFriends(graph?.friends ?? [], sort, query),
    [graph, sort, query],
  )

  const waiting = graph?.incoming.length ?? 0
  const blocked = graph?.blocked.length ?? 0
  const onFriends = view === 'friends'
  const typed = finder.query.trim()
  const filtering = query.trim().length > 0

  /*
   * The first row, or the whole list until the row has been measured. Zero
   * columns is "not measured yet" and never "no room for anybody": drawing
   * nothing for it would turn a failed measurement into an account that looks
   * like it has no friends. `useLayoutEffect` inside the hook means the
   * fallback is not a frame anybody sees.
   */
  const firstRow = columns > 0 ? friends.slice(0, columns) : friends
  /*
   * Is the section holding anybody back? Counted against the WHOLE list and
   * not the filtered one, so a search typed INSIDE the panel cannot pull the
   * button out from under the panel it opened. `useModal` hands focus back to
   * whatever opened a dialog and skips the restore when that element has since
   * left the page — driven on 2026-08-30: filtering to one match inside the
   * panel and pressing Escape left focus on `<body>`, because one match fits
   * one row, which unmounted the button mid-flight.
   *
   * A search that matches NOBODY does still take the button away, and that is
   * the honest answer rather than the same bug wearing a guard: there is no
   * "all" to see. The section says so in words where the grid was.
   */
  const rest = graph ? graph.friends.length - firstRow.length : 0

  return (
    <>
      {social.state.kind === 'checking' && <p className="acct__note">Reading…</p>}
      {social.state.kind === 'error' && (
        <p className="acct__note acct__note--warn">
          We couldn't read your friends just now, so this is not showing you a guess. Nothing has
          changed.
        </p>
      )}

      {/* A refusal from any of the seven verbs, shown once, where the presses
          are. "This account is not taking friend requests" is a fact about them
          and worth reading. Outside the guard below, because a press made on a
          SEARCH result has to be able to say why it was refused even when the
          graph read is the thing that failed. */}
      {social.problem && (
        <p className="acct__problem" role="alert">
          {social.problem}
          <button
            type="button"
            className="acct__problem-x"
            aria-label="Dismiss"
            onClick={social.dismissProblem}
          >
            ×
          </button>
        </p>
      )}

      {/* ── find one person ───────────────────────────────────────────────
          The box that replaces Bible Educator's "@username → Send Request".
          It does everything that box did — an exact handle still resolves,
          including for an account that keeps its page private — and it answers
          BEFORE the press rather than after, with the person's card in front
          of you. What it will not do is list everybody. */}
      <AccountSub
        title="Find People"
        what="Anybody on TDG, by part of their name or their handle. Nobody is listed until you type — this is a search, not a list of everyone who has an account."
      >
        <SearchPill
          id="acct-find"
          value={finder.query}
          onChange={finder.setQuery}
          placeholder="a name, or their @handle"
          label="Find people on TDG"
          describedBy="acct-find-hint"
        />
        <p className="acct__hint" id="acct-find-hint">
          {finder.busy
            ? 'Searching…'
            : 'Two letters is enough to start. Asking is not the same as becoming friends: they have to accept.'}
        </p>

        {finder.state.kind === 'error' && (
          <p className="acct__note acct__note--warn">
            We couldn't search just now, so this is not showing you a guess. Try again in a moment.
          </p>
        )}
        {finder.state.kind === 'checking' && <p className="acct__note">Looking…</p>}
        {finder.state.kind === 'ok' && (
          <PeopleList
            people={finder.state.people}
            empty={`Nobody on TDG matches “${typed}”. Handles are exact, so check the spelling — and an account that keeps to itself is only found by its full handle.`}
            /* One table, in standing.ts, so a card cannot offer a different set
               of buttons here than it does on the profile that same card
               opens. */
            standing={(person) => person.standing ?? 'none'}
            busy={social.busy}
            onAct={social.act}
          />
        )}
      </AccountSub>

      {graph && (
        <AccountSub
          title={onFriends ? 'Friends' : view === 'requests' ? 'Friend Requests' : 'Blocked'}
          what={
            onFriends
              ? FRIENDS_WHAT
              : view === 'requests'
                ? 'Answers you owe, and answers you are waiting on. Declining is quiet: they are not told.'
                : 'A block ends any friendship and clears anything pending in both directions. Unblocking asks nothing, because it takes nothing away.'
          }
        >
          {/* The bar: the friends filter and the sort on the left, the two
              other views on the right — each carrying its own count, so the
              friends list answers for all three without leaving it. */}
          <div className="acct__bar">
            {onFriends ? (
              <>
                <FriendsBar
                  idPrefix="acct-friend"
                  query={query}
                  setQuery={setQuery}
                  sort={sort}
                  setSort={setSort}
                  disabled={graph.friends.length === 0}
                />
                <button
                  type="button"
                  className="appview__ghost acct__view-btn"
                  onClick={() => setView('requests')}
                >
                  Friend Requests
                  <CountPill n={waiting} tone="hot" />
                </button>
                <button
                  type="button"
                  className="appview__ghost acct__view-btn"
                  onClick={() => setView('blocked')}
                >
                  Blocked
                  <CountPill n={blocked} tone="quiet" />
                </button>
              </>
            ) : (
              <button
                type="button"
                className="appview__ghost acct__view-btn"
                onClick={() => setView('friends')}
              >
                ← Back To Friends
              </button>
            )}
          </div>

          {onFriends && (
            <>
              <FriendsCount
                shown={friends.length}
                total={graph.friends.length}
                query={query}
              />
              <PeopleList
                people={firstRow}
                empty={
                  graph.friends.length === 0
                    ? 'No friends yet. Find somebody above and ask.'
                    : `None of your friends match “${query.trim()}”.`
                }
                standing="friend"
                busy={social.busy}
                onAct={social.act}
                onFavorite={social.favorite}
                gridRef={setGrid}
              />

              {/* Only when there is something behind it. A See All under a list
                  that is already all of it is a button that does nothing, and
                  the reader has to press it to find that out. */}
              {friends.length > 0 && rest > 0 && (
                <button
                  type="button"
                  className="appview__ghost acct__seeall"
                  aria-haspopup="dialog"
                  aria-expanded={showAll}
                  onClick={() => setShowAll(true)}
                >
                  {/* The number is the point of the press: it is what tells
                      somebody whether the rest is two people or forty. It is
                      dropped while a search is on, because the panel opens on
                      the MATCHES and "See All 1 Matches" would need a plural
                      rule to say something the count line directly above it
                      has already said exactly. */}
                  {filtering ? 'See All Matches' : `See All ${fmtCount(friends.length)} Friends`}
                </button>
              )}

              <FriendsPanel
                open={showAll}
                onClose={() => setShowAll(false)}
                friends={friends}
                total={graph.friends.length}
                query={query}
                setQuery={setQuery}
                sort={sort}
                setSort={setSort}
                busy={social.busy}
                onAct={social.act}
                onFavorite={social.favorite}
              />
            </>
          )}

          {view === 'requests' && (
            <div className="acct__views">
              <section className="acct__view">
                <h4 className="acct__view-title">Waiting On You</h4>
                <PeopleList
                  people={graph.incoming}
                  empty="Nobody is waiting on you."
                  standing="they_asked"
                  busy={social.busy}
                  onAct={social.act}
                />
              </section>
              <section className="acct__view">
                <h4 className="acct__view-title">Sent By You</h4>
                <PeopleList
                  people={graph.outgoing}
                  empty="You have not asked anybody. Find somebody above and ask."
                  standing="you_asked"
                  busy={social.busy}
                  onAct={social.act}
                />
              </section>
            </div>
          )}

          {view === 'blocked' && (
            <PeopleList
              people={graph.blocked}
              empty="You have not blocked anybody. Block from somebody's card here, or from their profile page."
              standing="blocked"
              busy={social.busy}
              onAct={social.act}
            />
          )}
        </AccountSub>
      )}
    </>
  )
}
