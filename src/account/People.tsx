import { useState, type ReactNode } from 'react'
import { userHash } from '../lib/route'
import { actionsFor, standingChip, type StandingAction } from './standing'
import type { Person, SocialAction, Standing } from './api'

/**
 * A person, drawn as a card, and the grid they sit in.
 *
 * ## Why a card and not a row
 *
 * This is Bible Educator's Friends & Sharing, in this site's own materials. A
 * friend there is a card in an auto-filling grid — monogram, name, handle, a
 * star, and the actions under them — and this panel was a stack of full-width
 * rows instead, which is a different thing that happens to hold the same
 * words. The owner asked for the app's shape, not an approximation of it: *"That
 * app's friends list are also in cards for each friend/user added. Make it
 * look like that."*
 *
 * The one honest translation is the primary action. Bible Educator's card
 * leads with **Share With**, because sharing Scripture is what that app's
 * friends are FOR, and it hangs Public Profile underneath on its own row. This
 * site has nothing to share, so the profile IS the point of a card here and it
 * takes the lead. Copying a Share button we cannot honour would have been
 * copying the picture rather than the reasoning.
 *
 * ## Every card is the same card
 *
 * Friends, search results, incoming requests, requests you sent and people you
 * have blocked are one component with different actions, exactly as they are
 * over there. Five lookalike cards would be five chances for one of them to
 * drift, and the drift always shows up in the same place: a person whose card
 * offers a different set of buttons depending on which list found them.
 */

/** How wide a card may get before the grid gives it a neighbour. Bible
 *  Educator's own figure, kept because the content is the same shape: a
 *  monogram beside two lines of name, over a button. */
export const CARD_MIN = '230px'

/**
 * Two letters standing for a person.
 *
 * There is no avatar on this project — nowhere to upload one and nothing that
 * stores one — so this is the whole picture, and it is deliberately a
 * gradient tile rather than a grey circle with a stranger's outline in it. The
 * initial comes from the display name first and the handle second, which is
 * the order every other surface here falls through, so the tile and the name
 * beside it can never be built from different things.
 */
function Monogram({ name }: { name: string }) {
  const source = name.replace(/^@/, '')
  const words = source.split(/[\s._-]+/).filter(Boolean)
  const initials =
    words.length >= 2
      ? `${words[0]![0]!}${words[1]![0]!}`
      : source.slice(0, 2)
  return (
    <span className="acct__mono" aria-hidden="true">
      {initials.toUpperCase() || '?'}
    </span>
  )
}

function StarGlyph({ on }: { on: boolean }) {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill={on ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="m12 2.6 2.9 5.9 6.5.95-4.7 4.6 1.1 6.45L12 17.45 6.2 20.5l1.1-6.45-4.7-4.6 6.5-.95Z" />
    </svg>
  )
}

/** The three-dot toggle that reveals what a card does not lead with. Bible
 *  Educator's `friend-more-btn`, and for its reason: Unfriend and Block are
 *  rare and destructive, and a card that leads with them reads as a list of
 *  ways to get rid of people. */
function MoreGlyph() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="5" cy="12" r="1.9" />
      <circle cx="12" cy="12" r="1.9" />
      <circle cx="19" cy="12" r="1.9" />
    </svg>
  )
}

/** Which actions are grave enough to ask about first, and the sentence each
 *  one is asked with. Written here, once, so the question a card asks and the
 *  question any other surface asks about the same verb cannot differ — the
 *  reason Bible Educator exports its two confirms rather than writing them at
 *  each button. */
const CONFIRM: Partial<Record<SocialAction, (name: string) => string>> = {
  remove: (name) =>
    `Unfriend ${name}? Friendship is two-sided, so it ends for both of you — and they are not told.`,
  block: (name) =>
    `Block ${name}? It ends any friendship, on both sides, and clears anything pending either way. They are not told.`,
}

export function PeopleGrid({ children }: { children: ReactNode }) {
  return <div className="acct__grid">{children}</div>
}

export function PersonCard({
  person,
  standing,
  busy,
  onAct,
  onFavorite,
}: {
  person: Person
  /** Where you stand with them. A search result carries its own; the four
   *  lists know it from the list a person came out of. */
  standing: Standing
  busy: boolean
  onAct: (action: SocialAction, userId: string) => void
  /** Given only for a friend, because only a friend can be starred — the rule
   *  `tdg_set_favorite` enforces, drawn rather than left to be refused. */
  onFavorite?: (userId: string, on: boolean) => void
}) {
  const [more, setMore] = useState(false)
  /** The action waiting on a yes. Null the rest of the time, which is almost
   *  always. */
  const [asking, setAsking] = useState<StandingAction | null>(null)

  const name = person.displayName || person.username || 'A TDG account'
  const chip = standingChip(standing)
  const all = actionsFor(standing)
  /*
   * What the card LEADS with, and what it keeps behind the toggle.
   *
   * The affirmative action is the lead — Accept, Add Friend, Unblock — and
   * anything that ends something goes under More. A card whose front row
   * offers Unfriend and Block is a card about getting rid of somebody, which
   * is not what a friends list is.
   */
  const lead = all.filter((a) => a.tone === 'primary' || a.action === 'cancel' || a.action === 'decline')
  const tucked = all.filter((a) => !lead.includes(a))

  const press = (action: StandingAction) => {
    if (CONFIRM[action.action]) {
      setAsking(action)
      return
    }
    onAct(action.action, person.userId)
  }

  return (
    <div className="acct__pcard" data-busy={busy || undefined} data-fav={person.favorite || undefined}>
      <div className="acct__pcard-head">
        <Monogram name={name} />
        <span className="acct__pcard-id">
          <span className="acct__pcard-name">{name}</span>
          {person.username && <span className="acct__pcard-handle">@{person.username}</span>}
        </span>
        {onFavorite ? (
          <button
            type="button"
            className="acct__star"
            data-on={person.favorite || undefined}
            disabled={busy}
            aria-pressed={person.favorite}
            // Names the person, not the control: a screen reader moving through
            // twenty friends would otherwise hear "Favourite" twenty times with
            // nothing to tell them apart.
            aria-label={person.favorite ? `Unstar ${name}` : `Star ${name}`}
            onClick={() => onFavorite(person.userId, !person.favorite)}
          >
            <StarGlyph on={person.favorite} />
          </button>
        ) : chip ? (
          <span className="chip acct__pcard-chip" data-standing={standing}>
            {chip}
          </span>
        ) : null}
      </div>

      {person.bio && <p className="acct__pcard-bio">{person.bio}</p>}

      {/* The ask, in place, replacing the row it was started from — never a
          second dialog over the card. AGENTS.md rule 11 settled that for the
          Store's money presses, and an unfriend is the same shape of question.
          The two buttons take their padding from ONE variable on the row
          (rule 6): `flex: 1 1 0` with border-box splits only what is left after
          each item's own padding, which is how a mirrored pair ends up 241px
          against 249px. */}
      {asking ? (
        <div className="acct__ask-inline" role="group" aria-label={`Confirm ${asking.label}`}>
          <p className="acct__ask-q">{CONFIRM[asking.action]!(name)}</p>
          <div className="acct__ask-pair">
            <button
              type="button"
              className="appview__ghost acct__ask-yes"
              disabled={busy}
              onClick={() => {
                onAct(asking.action, person.userId)
                setAsking(null)
                setMore(false)
              }}
            >
              {asking.label}
            </button>
            <button
              type="button"
              className="appview__ghost acct__ask-no"
              onClick={() => setAsking(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="acct__pcard-foot">
            {/* Every card is a way into that person's page. A card that could
                only be acted on and never read is how a social system ends up
                with people you can block and cannot look at. No handle, no
                page — a profile's address is `#/user/<handle>` and there is no
                other one — so the link is dropped rather than pointed at
                nothing. */}
            {person.username ? (
              <a className="appview__ghost acct__pcard-open" href={userHash(person.username)}>
                View Profile
              </a>
            ) : (
              <span className="acct__pcard-open acct__pcard-open--none">No profile page yet</span>
            )}
            {lead.map((a) => (
              <button
                key={a.action}
                type="button"
                className="appview__ghost"
                data-tone={a.tone}
                disabled={busy}
                onClick={() => press(a)}
              >
                {a.label}
              </button>
            ))}
            {tucked.length > 0 && (
              <button
                type="button"
                className="acct__more"
                aria-expanded={more}
                aria-label={`More actions for ${name}`}
                disabled={busy}
                onClick={() => setMore((open) => !open)}
              >
                <MoreGlyph />
              </button>
            )}
          </div>

          {more && tucked.length > 0 && (
            <div className="acct__pcard-more">
              {tucked.map((a) => (
                <button
                  key={a.action}
                  type="button"
                  className="appview__ghost"
                  data-tone={a.tone}
                  disabled={busy}
                  onClick={() => press(a)}
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

/** A grid of people, or the sentence that says there are none. */
export function PeopleList({
  people,
  empty,
  standing,
  busy,
  onAct,
  onFavorite,
}: {
  people: Person[]
  empty: ReactNode
  /** One standing for a whole list, or a function for a list whose members
   *  each carry their own — which is every search result. */
  standing: Standing | ((person: Person) => Standing)
  busy: ReadonlySet<string>
  onAct: (action: SocialAction, userId: string) => void
  onFavorite?: (userId: string, on: boolean) => void
}) {
  if (people.length === 0) return <p className="acct__note">{empty}</p>
  return (
    <PeopleGrid>
      {people.map((person) => (
        <PersonCard
          key={person.userId}
          person={person}
          standing={typeof standing === 'function' ? standing(person) : standing}
          busy={busy.has(person.userId)}
          onAct={onAct}
          onFavorite={onFavorite}
        />
      ))}
    </PeopleGrid>
  )
}

/**
 * A search box that looks like one.
 *
 * A composed pill with the glyph inside it, not a bare `input[type=search]`
 * wearing a placeholder — Bible Educator's `.searchwrap`, and the reason is
 * AGENTS.md rule 5: nothing here ships in the browser's own clothes, and a
 * search field with no affordance is a text box somebody has to be told about.
 */
export function SearchPill({
  id,
  value,
  onChange,
  placeholder,
  label,
  disabled,
  describedBy,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  label: string
  disabled?: boolean
  describedBy?: string
}) {
  return (
    <div className="acct__seek" data-disabled={disabled || undefined}>
      <svg
        className="acct__seek-glyph"
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.6-3.6" />
      </svg>
      <input
        id={id}
        className="acct__seek-input"
        type="search"
        value={value}
        disabled={disabled}
        autoCapitalize="off"
        spellCheck={false}
        placeholder={placeholder}
        aria-label={label}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.currentTarget.value)}
      />
    </div>
  )
}
