import { useMemo, useState } from 'react'
import { useSections } from '../lib/sections'
import { AccountSub } from './AccountFold'
import { fmtCount } from './format'
import { PeopleList, SearchPill } from './People'
import { usePeopleSearch, type SocialPanel } from './useAccount'
import type { Person } from './api'

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
 */

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
const FRIEND_SORTS = [
  { id: 'az', label: 'Name (A–Z)' },
  { id: 'za', label: 'Name (Z–A)' },
] as const

type FriendSort = (typeof FRIEND_SORTS)[number]['id']

const personName = (p: Person) => (p.displayName || p.username || '￿').toLowerCase()

function orderFriends(people: Person[], sort: FriendSort, query: string): Person[] {
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

/** Case-folded and accent-blind, so `rose` finds `Rosé`. The same courtesy the
 *  server's own search extends, kept here so the two boxes on this panel do not
 *  behave differently from each other. */
const fold = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

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

  const graph = social.state.kind === 'ok' ? social.state.graph : null
  const friends = useMemo(
    () => orderFriends(graph?.friends ?? [], sort, query),
    [graph, sort, query],
  )

  const waiting = graph?.incoming.length ?? 0
  const blocked = graph?.blocked.length ?? 0
  const onFriends = view === 'friends'
  const typed = finder.query.trim()

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
              ? 'Star the ones you want at the top. Unfriending ends it for both of you, and they are not told.'
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
                <SearchPill
                  id="acct-friend-filter"
                  value={query}
                  onChange={setQuery}
                  placeholder="Search your friends"
                  label="Search your friends"
                  disabled={graph.friends.length === 0}
                />
                <div className="acct__bar-sort" data-disabled={graph.friends.length === 0 || undefined}>
                  <label className="sr-only" htmlFor="acct-friend-sort">
                    Sort your friends
                  </label>
                  <select
                    id="acct-friend-sort"
                    className="acct__select"
                    value={sort}
                    disabled={graph.friends.length === 0}
                    onChange={(e) => setSort(e.currentTarget.value as FriendSort)}
                  >
                    {FRIEND_SORTS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {/* The native arrow is gone with `appearance: none`, so the
                      control draws its own — rule 5. */}
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
              {/* The count is the FILTERED one against the total, so a search
                  that hides half the list says so rather than looking like half
                  the friends went missing. */}
              {graph.friends.length > 0 && (
                <p className="acct__hint acct__bar-count">
                  {query.trim()
                    ? `${fmtCount(friends.length)} of ${fmtCount(graph.friends.length)} friends match.`
                    : `${fmtCount(graph.friends.length)} friend${graph.friends.length === 1 ? '' : 's'}.`}
                </p>
              )}
              <PeopleList
                people={friends}
                empty={
                  graph.friends.length === 0
                    ? 'No friends yet. Find somebody above and ask.'
                    : `None of your friends match “${query.trim()}”.`
                }
                standing="friend"
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
