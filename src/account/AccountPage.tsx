import { useId, useMemo, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { USERNAME_RULE } from '../auth/wording'
import { useMyBadges } from '../badges/useBadges'
import { BackButton, FoldControls } from './../components/Folded'
import { useParallax } from '../hooks/useParallax'
import { useReveal } from '../hooks/useReveal'
import { userHash } from '../lib/route'
import { SectionsProvider, useSections } from '../lib/sections'
import { AccountFold, AccountSub } from './AccountFold'
import { useAppNames } from './appNames'
import { fmtCount, fmtDay, fmtRelative, prettyId, usernameFreeAt } from './format'
import { actionsFor, standingChip } from './standing'
import {
  useAccountStats,
  usePeopleSearch,
  useProfileEditor,
  usePrivacy,
  useSocial,
} from './useAccount'
import type { Person, SocialAction } from './api'
import type { Audience, PrivacyControl, PrivacyGroup } from './types'
import type { ProfileField, SocialPanel } from './useAccount'
import './Account.css'

/**
 * Your TDG account, on one page.
 *
 * ## Why it is a page and not a bigger menu
 *
 * The account menu in the nav answers *who am I signed in as* in a glance, and
 * that is all a menu hanging off a fixed bar can honestly do — it is capped at
 * 280px wide and at the room under the bar, and it closes the moment the
 * pointer leaves it. Six sections of form fields, counters, people and privacy
 * controls in there would be a panel nobody can read on a phone. So the menu
 * keeps the glance, gains the figures somebody actually wants at a glance, and
 * carries one button to here.
 *
 * ## Six sections, and every one of them folds
 *
 * The whole page is `.fold` rows from `AppPage.css`, driven by
 * `src/lib/sections.tsx` — the same machinery the app pages and the Developer
 * console use, so Expand All and Collapse All reach every section without
 * being told any of them exist, and a section added later joins for free.
 *
 * **It does not open fully collapsed, which is a deliberate departure** from
 * what `sections.tsx` describes as the default. An app page is ten sections of
 * prose you browse; two of these six ARE the answer somebody came for — what
 * this account is, and what it has added up to. Opening those two is not a
 * wall, and every other row is one line and a chevron.
 *
 * ## It wears the app page's clothes on purpose
 *
 * `.appview` and its shell, head, back control, fold rows and ghost buttons
 * come from `AppPage.css`, which `Folded.tsx` already imports — the same
 * decision `About.tsx` records, and for the same reason: this page is opened
 * from the same chrome as those, and a second set of lookalike page furniture
 * is the beginning of the two drifting apart. `Account.css` holds only what is
 * genuinely new here.
 *
 * ## Every state has a face, including the awkward ones
 *
 * Signed out, still checking, could-not-read, nothing-to-show and refused all
 * render something that says which one it is. The one that matters most is
 * **could not read**: a privacy panel drawn from a failed read would show a
 * row of default switches, which is the site telling somebody their profile is
 * public when it has no idea what it is. See `useAccount.ts`.
 */

/** A row of a definition list: one fact, its name, and its value. */
function Fact({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="acct__fact">
      <dt className="acct__fact-label">{label}</dt>
      <dd className="acct__fact-value">
        {value}
        {hint && <span className="acct__fact-hint">{hint}</span>}
      </dd>
    </div>
  )
}

/** One counter. The figure first, at reading size, then what it counts. */
function Tile({ n, label, hint }: { n: number; label: string; hint?: string }) {
  return (
    <div className="acct__tile">
      <span className="acct__tile-n">{fmtCount(n)}</span>
      <span className="acct__tile-label">{label}</span>
      {hint && <span className="acct__tile-hint">{hint}</span>}
    </div>
  )
}

/**
 * One editable field of the account.
 *
 * ## It commits on blur, and on Enter, and never on a keystroke
 *
 * A username is checked against a unique index and a fourteen-day cooldown;
 * sending one per letter would spend that cooldown on a half-typed name. Blur
 * is the moment somebody has finished, and Enter is the moment they say so —
 * `useAccount.ts` has the rest of the reasoning.
 *
 * Escape puts the stored value back, because a field that can only be
 * corrected by retyping what was there is a field you cannot back out of.
 *
 * ## Three things can be true of it, and each says so where it is
 *
 * Saving, saved, and refused. The refusal is the server's own sentence — a
 * taken username, a cooldown with its date in it, an address somebody else
 * uses — and it sits under the field rather than in a toast, because it is
 * about that field and the reader is looking at it.
 */
function EditField({
  field,
  label,
  hint,
  state,
  set,
  commit,
  reset,
  prefix,
  multiline,
  maxLength,
  type = 'text',
  autoComplete,
  placeholder,
}: {
  field: ProfileField
  label: string
  hint?: string
  state: { value: string; saving: boolean; saved: boolean; problem: string | null }
  set: (field: ProfileField, value: string) => void
  commit: (field: ProfileField) => void
  reset: (field: ProfileField) => void
  /** `@` for the username, drawn inside the box so the value is what is stored. */
  prefix?: string
  multiline?: boolean
  maxLength?: number
  type?: 'text' | 'email'
  autoComplete?: string
  placeholder?: string
}) {
  const id = useId()
  const Tag = multiline ? 'textarea' : 'input'

  return (
    <div className="acct__field" data-saving={state.saving || undefined}>
      <label className="acct__label" htmlFor={id}>
        {label}
        {state.saving && <span className="acct__field-flag">Saving…</span>}
        {state.saved && !state.saving && (
          <span className="acct__field-flag acct__field-flag--ok">Saved</span>
        )}
      </label>

      <div className="acct__input-wrap" data-prefixed={prefix ? '' : undefined}>
        {prefix && (
          <span className="acct__input-prefix" aria-hidden="true">
            {prefix}
          </span>
        )}
        <Tag
          id={id}
          className={multiline ? 'acct__input acct__input--area' : 'acct__input'}
          value={state.value}
          maxLength={maxLength}
          type={multiline ? undefined : type}
          rows={multiline ? 3 : undefined}
          autoComplete={autoComplete}
          autoCapitalize={field === 'username' ? 'off' : undefined}
          spellCheck={field === 'username' || type === 'email' ? false : undefined}
          placeholder={placeholder}
          aria-describedby={`${id}-hint`}
          aria-invalid={state.problem ? true : undefined}
          onChange={(e) => set(field, e.currentTarget.value)}
          onBlur={() => commit(field)}
          onKeyDown={(e) => {
            // Enter commits, except in the bio, where Enter is a paragraph.
            if (e.key === 'Enter' && !multiline) {
              e.preventDefault()
              e.currentTarget.blur()
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              reset(field)
            }
          }}
        />
      </div>

      <p className="acct__hint" id={`${id}-hint`}>
        {state.problem ? (
          <span className="acct__hint-bad">{state.problem}</span>
        ) : (
          hint
        )}
      </p>
    </div>
  )
}

/**
 * The three-way chooser one privacy control is set with.
 *
 * A real `radiogroup`, not three toggles: they are mutually exclusive and a
 * screen reader is entitled to be told so, and to be told how many there are.
 * That brings the roving tabindex with it — exactly one option is in the tab
 * order, and the arrows move between them — which is what the ARIA pattern
 * says and also what somebody who has used any other segmented control
 * expects.
 *
 * Arrow keys SELECT as they move, rather than moving a focus ring that then
 * needs a space bar. That is the standard behaviour for a radio group, and it
 * is safe here because every value is reversible and none is destructive.
 *
 * The options are `control.allowed` mapped through the audience list — never a
 * hardcoded three. An audience id this build has never seen still draws, with
 * a label made from its id (rule 17), because an option silently missing from
 * a privacy control is the worst kind of missing.
 */
function AudiencePicker({
  control,
  audiences,
  busy,
  labelledBy,
  describedBy,
  onPick,
}: {
  control: PrivacyControl
  audiences: Audience[]
  busy: boolean
  labelledBy: string
  describedBy: string
  onPick: (audience: string) => void
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  const options = control.allowed.map((id) => {
    const known = audiences.find((a) => a.id === id)
    return {
      id,
      label: known?.label ?? prettyId(id),
      // A contact control's middle value means friends OF friends, and the
      // audience carries both sentences so this file never has to know which
      // control is the odd one out.
      blurb: known ? (control.kind === 'contact' ? known.contactBlurb : known.blurb) : '',
    }
  })

  const move = (from: number, step: number) => {
    const next = (from + step + options.length) % options.length
    refs.current[next]?.focus()
    onPick(options[next].id)
  }

  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-busy={busy || undefined}
      className="acct__seg"
      data-busy={busy || undefined}
    >
      {options.map((option, i) => {
        const on = control.audience === option.id
        return (
          <button
            key={option.id}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={on}
            /* Roving: one stop for the whole group. Without this a reader
               tabbing down eight controls takes twenty-four stops to reach the
               bottom of the list. */
            tabIndex={on ? 0 : -1}
            className="acct__seg-btn"
            title={option.blurb || undefined}
            onClick={() => onPick(option.id)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault()
                move(i, 1)
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault()
                move(i, -1)
              }
            }}
          >
            {option.label}
            {option.blurb && <span className="sr-only"> — {option.blurb}</span>}
          </button>
        )
      })}
    </div>
  )
}

/** One control: what it is, what it means, and what it is set to. */
function PrivacyRow({
  control,
  audiences,
  busy,
  onPick,
}: {
  control: PrivacyControl
  audiences: Audience[]
  busy: boolean
  onPick: (audience: string) => void
}) {
  const id = useId()
  return (
    <div className="acct__row" data-busy={busy || undefined}>
      <div className="acct__row-text">
        <span id={`${id}-label`} className="acct__row-label">
          {control.label}
        </span>
        <span id={`${id}-blurb`} className="acct__row-blurb">
          {control.blurb}
          {/* A reader is entitled to know which of these they chose and which
              were chosen for them — otherwise "Everyone" reads as a decision
              somebody made, when for a new account it is simply the default. */}
          {control.isDefault && <span className="acct__row-default"> · Default</span>}
        </span>
      </div>
      <AudiencePicker
        control={control}
        audiences={audiences}
        busy={busy}
        labelledBy={`${id}-label`}
        describedBy={`${id}-blurb`}
        onPick={onPick}
      />
    </div>
  )
}

/**
 * The whole privacy list.
 *
 * Grouped by `tdg_privacy_groups()`, ordered by the server's own `sort` in
 * both directions, and **a group this build has never heard of still draws**,
 * under a heading made from its id, with its controls under it. A list that
 * quietly dropped the controls it could not file would be a privacy screen
 * that does not show you all of your privacy, which is the one thing it exists
 * not to do.
 */
function PrivacyList({
  controls,
  audiences,
  groups,
  saving,
  onPick,
  onAll,
}: {
  controls: PrivacyControl[]
  audiences: Audience[]
  groups: PrivacyGroup[]
  saving: ReadonlySet<string>
  onPick: (key: string, audience: string) => void
  onAll: (audience: string) => void
}) {
  const seen = new Set(groups.map((g) => g.id))
  const extra = [...new Set(controls.map((c) => c.group))]
    .filter((id) => !seen.has(id))
    .map((id) => ({ id, label: prettyId(id), blurb: '', sort: Number.MAX_SAFE_INTEGER }))

  const ordered = [...groups, ...extra].sort((a, b) => a.sort - b.sort)

  // Only the audiences every control can take. Offering "Set Everything To" a
  // value one control refuses would draw a button that cannot do what it says.
  const universal = audiences.filter((a) => controls.every((c) => c.allowed.includes(a.id)))

  return (
    <>
      {universal.length > 0 && (
        <div className="acct__setall">
          <p className="acct__setall-text">
            Set everything to
            <span className="sr-only"> one audience at once</span>
          </p>
          <div className="acct__setall-btns">
            {universal.map((audience) => (
              <button
                key={audience.id}
                type="button"
                className="appview__ghost"
                onClick={() => onAll(audience.id)}
              >
                {audience.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {ordered.map((group) => {
        const rows = controls.filter((c) => c.group === group.id).sort((a, b) => a.sort - b.sort)
        if (rows.length === 0) return null
        return (
          <AccountSub key={group.id} title={group.label} what={group.blurb || undefined}>
            <div className="acct__rows">
              {rows.map((control) => (
                <PrivacyRow
                  key={control.id}
                  control={control}
                  audiences={audiences}
                  busy={saving.has(control.id)}
                  onPick={(audience) => onPick(control.id, audience)}
                />
              ))}
            </div>
          </AccountSub>
        )
      })}
    </>
  )
}

/** A filled star for a friend you have starred, an outline for one you have
 *  not. One path each rather than one path with a `fill` toggled, because the
 *  outline needs its own stroke weight to read at 13px — and both carry
 *  `aria-hidden` AND `focusable="false"`, the pair `CrossGlyph.tsx` counts. */
function Star({ on }: { on: boolean }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill={on ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="m12 2.6 2.9 5.9 6.5.95-4.7 4.6 1.1 6.45L12 17.45 6.2 20.5l1.1-6.45-4.7-4.6 6.5-.95Z" />
    </svg>
  )
}

/**
 * One person, and what you can do about them.
 *
 * **The buttons come from where you already STAND with them**, not from a
 * fixed set: somebody who asked you gets Accept and Decline, somebody you
 * asked gets Withdraw, a friend gets Unfriend and Block, a blocked account
 * gets Unblock. Drawing all seven and letting the server refuse five would be
 * five buttons that look like actions and are guaranteed to be errors — a
 * mistake Bible Educator's profile page made and fixed, and the reason its
 * README spells the standings out one by one.
 *
 * The four lists know the standing from the list a person came out of, so they
 * pass `actions` directly. A search result has no list behind it and carries
 * its OWN standing from the server, which `actionsFor` in `standing.ts` turns
 * into the same buttons — one table, so a card cannot offer a different set
 * depending on where it was drawn.
 *
 * **Every card is a way into that person's page.** A card that could only be
 * acted on and never read is how a social system ends up with people you can
 * block and cannot look at. A person with no handle has no page — a profile's
 * address is `#/user/<handle>` and there is no other one — so their card keeps
 * its actions and drops the link rather than pointing at nothing.
 */
function PersonCard({
  person,
  actions,
  busy,
  onAct,
  onFavorite,
}: {
  person: Person
  actions: { action: SocialAction; label: string; tone?: 'primary' | 'quiet' }[]
  busy: boolean
  onAct: (action: SocialAction, userId: string) => void
  /** Given only for a friend, because only a friend can be starred — the rule
   *  `tdg_set_favorite` enforces, drawn rather than left to be refused. */
  onFavorite?: (userId: string, on: boolean) => void
}) {
  const name = person.displayName || person.username || 'A TDG account'
  const chip = person.standing ? standingChip(person.standing) : null
  return (
    <div className="acct__person" data-busy={busy || undefined}>
      <div className="acct__person-who">
        <span className="acct__person-top">
          {onFavorite && (
            <button
              type="button"
              className="acct__star"
              data-on={person.favorite || undefined}
              disabled={busy}
              aria-pressed={person.favorite}
              // Names the person, not the control: a screen reader moving
              // through twenty friends would otherwise hear "Favourite"
              // twenty times with nothing to tell them apart.
              aria-label={person.favorite ? `Unstar ${name}` : `Star ${name}`}
              onClick={() => onFavorite(person.userId, !person.favorite)}
            >
              <Star on={person.favorite} />
            </button>
          )}
          <span className="acct__person-name">{name}</span>
          {chip && (
            <span className="chip acct__person-chip" data-standing={person.standing}>
              {chip}
            </span>
          )}
        </span>
        {person.username && <span className="acct__person-handle">@{person.username}</span>}
        {person.bio && <span className="acct__person-bio">{person.bio}</span>}
      </div>
      <div className="acct__person-acts">
        {person.username && (
          <a className="appview__ghost acct__person-link" href={userHash(person.username)}>
            View Profile
          </a>
        )}
        {actions.map((a) => (
          <button
            key={a.action}
            type="button"
            className="appview__ghost"
            data-tone={a.tone}
            disabled={busy}
            onClick={() => onAct(a.action, person.userId)}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/** A list of people with one heading, or the sentence that says there are none. */
function PeopleList({
  people,
  empty,
  actions,
  busy,
  onAct,
  onFavorite,
}: {
  people: Person[]
  empty: string
  /** A fixed set for the four lists, or a function for a list whose members
   *  each carry their own standing — which is every search result. */
  actions:
    | { action: SocialAction; label: string; tone?: 'primary' | 'quiet' }[]
    | ((person: Person) => { action: SocialAction; label: string; tone?: 'primary' | 'quiet' }[])
  busy: ReadonlySet<string>
  onAct: (action: SocialAction, userId: string) => void
  onFavorite?: (userId: string, on: boolean) => void
}) {
  if (people.length === 0) return <p className="acct__note">{empty}</p>
  return (
    <div className="acct__people">
      {people.map((person) => (
        <PersonCard
          key={person.userId}
          person={person}
          actions={typeof actions === 'function' ? actions(person) : actions}
          busy={busy.has(person.userId)}
          onAct={onAct}
          onFavorite={onFavorite}
        />
      ))}
    </div>
  )
}

/**
 * How the friends list is ordered, and what to call each way.
 *
 * **Favourites first is the default, and it degrades to A–Z.** Somebody who
 * has never starred anybody sees an alphabetical list, which is exactly what
 * the server sends; somebody who has sees the people they picked at the top.
 * A default that is only right for one of those two would have to be the
 * other one, and then the stars would do nothing until a menu was found.
 *
 * Every sort ends in the same alphabetical tiebreak, so the list is stable:
 * two friends with equal standing on the chosen key never swap places between
 * renders, which is what makes a re-read after an action look like nothing
 * happened rather than like the list reshuffling itself.
 */
const FRIEND_SORTS = [
  { id: 'favorites', label: 'Favourites First' },
  { id: 'az', label: 'Name (A–Z)' },
  { id: 'za', label: 'Name (Z–A)' },
] as const

type FriendSort = (typeof FRIEND_SORTS)[number]['id']

const personName = (p: Person) => (p.displayName || p.username || '￿').toLowerCase()

function sortFriends(people: Person[], sort: FriendSort): Person[] {
  const byName = (a: Person, b: Person) => personName(a).localeCompare(personName(b))
  const copy = [...people]
  if (sort === 'za') return copy.sort((a, b) => byName(b, a))
  if (sort === 'az') return copy.sort(byName)
  return copy.sort((a, b) => Number(b.favorite) - Number(a.favorite) || byName(a, b))
}

/** Does what somebody typed appear in this person's name, handle or bio?
 *  Case-folded and accent-blind, so `rose` finds `Rosé` — the same courtesy
 *  the server's own search extends, kept here so the two boxes on this panel
 *  do not behave differently from each other. */
const fold = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

function matches(person: Person, query: string): boolean {
  const q = fold(query.trim())
  if (!q) return true
  return [person.displayName, person.username, person.bio].some(
    (field) => field && fold(field).includes(q),
  )
}

/**
 * Everybody on TDG, and where you stand with each of them.
 *
 * Its own component for one reason: it needs to know whether the section it
 * lives in is OPEN, and `useSections` is only readable from inside the
 * provider. A shut fold that had already searched would be a request made for
 * a panel nobody has looked at — and on a page that already makes six on
 * arrival, the seventh should at least be wanted.
 *
 * It replaced an "Add A Friend" box that took one exact handle and answered
 * only after the request had been sent. Everything that box did, this does:
 * an exact handle still resolves, including one belonging to an account that
 * keeps its page private, and including one belonging to an account that has
 * blocked you. What it adds is the answer BEFORE the press.
 */
function FindPeople({ social }: { social: SocialPanel }) {
  const { isOpen } = useSections()
  const finder = usePeopleSearch(isOpen('social'))

  return (
    <AccountSub
      title="Find People"
      what="Everybody on TDG, whether you know them or not. Leave the box empty to browse, or type a name or a handle. Every result opens their profile."
    >
      <div className="acct__ask">
        <label className="acct__label" htmlFor="acct-find">
          Search TDG
          {finder.busy && <span className="acct__field-flag">Searching…</span>}
        </label>
        <div className="acct__input-wrap">
          <input
            id="acct-find"
            className="acct__input"
            value={finder.query}
            type="search"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="a name, or their @handle"
            aria-describedby="acct-find-hint"
            onChange={(e) => finder.setQuery(e.currentTarget.value)}
          />
        </div>
        <p className="acct__hint" id="acct-find-hint">
          Asking is not the same as becoming friends: they have to accept.
        </p>
      </div>

      {finder.state.kind === 'checking' && <p className="acct__note">Looking…</p>}
      {finder.state.kind === 'error' && (
        <p className="acct__note acct__note--warn">
          We couldn't search just now, so this is not showing you a guess. Try
          again in a moment.
        </p>
      )}
      {finder.state.kind === 'ok' && (
        <PeopleList
          people={finder.state.people}
          empty={
            finder.query.trim()
              ? `Nobody on TDG matches “${finder.query.trim()}”. Handles are exact, so check the spelling — and an account that keeps to itself is only found by its full handle.`
              : 'There is nobody else on TDG yet.'
          }
          /* One table, in standing.ts, so a card cannot offer
             a different set of buttons here than it does on
             the profile that same card opens. */
          actions={(person) => actionsFor(person.standing ?? 'none')}
          busy={social.busy}
          /* No second re-read beside this one. Every result's standing comes
             from the SEARCH's answer rather than the graph, and this list used
             to ask for a fresh one right here — synchronously, next to a
             fire-and-forget action, so it read the world before the write had
             landed and got back what it already had. `useSocial` bumps the
             graph revision once the verb resolves and this hook re-reads on
             that, which also covers a press made in one of the lists below.
             See `graphRevision.ts`. */
          onAct={social.act}
        />
      )}
    </AccountSub>
  )
}

export default function AccountPage({
  onOpenAuth,
  onOpenFeedback,
}: {
  onOpenAuth: () => void
  onOpenFeedback: () => void
}) {
  const { status, user, profile, tier, isAdmin, signOut } = useAuth()
  const stats = useAccountStats()
  const badges = useMyBadges()
  const privacy = usePrivacy()
  const social = useSocial()
  const editor = useProfileEditor()
  const appName = useAppNames()

  const blob = useParallax<HTMLDivElement>(-0.12)
  const head = useReveal<HTMLDivElement>('wipe', 0)

  /* The friends list is filtered and sorted HERE, not by the server.
     `tdg_my_friends` answers alphabetically and hands over `favorite` and
     `sort_order` with each row, and this list is the handful of people
     somebody actually knows — a round trip per keystroke to reorder twenty
     names would be a request spent on arithmetic the browser already has the
     data for. The org-wide search is the opposite case and is a real read:
     it is over every account on the project, and this browser holds none of
     them. */
  const [friendQuery, setFriendQuery] = useState('')
  const [friendSort, setFriendSort] = useState<FriendSort>('favorites')

  const name = profile?.display_name || profile?.username || 'Your TDG Account'
  const packs =
    stats.kind === 'ok'
      ? Object.values(stats.stats.packs).reduce((sum, list) => sum + list.length, 0)
      : 0
  const streaks = stats.kind === 'ok' ? Object.entries(stats.stats.streaks) : []

  /*
   * One row per app the account has actually touched, from three separate
   * answers: `apps` is what has synced a badge row, `packs` is what
   * `tdg_store_apps()` found, and `streaks` is what has counted a day. An app
   * can be in any one of them without the others, so the union is the only
   * honest list — a page built off `apps` alone would leave out an app whose
   * only mark on this account is a pack somebody bought.
   *
   * Nothing here names an app. The ids are the server's and the NAMES come
   * from `useAppNames`, which reads the card catalogue through the content
   * overlay; an id with no card falls back to a face made from itself
   * (rule 17, and `appNames.ts` has the rest).
   */
  const apps = useMemo(() => {
    if (stats.kind !== 'ok') return []
    const s = stats.stats
    const ids = new Set([
      ...Object.keys(s.apps),
      ...Object.keys(s.packs),
      ...Object.keys(s.streaks),
    ])
    return [...ids]
      .map((id) => ({
        id,
        title: appName(id),
        since: s.apps[id]?.since ?? null,
        earned: Object.keys(s.apps[id]?.earned ?? {}).length,
        packs: s.packs[id] ?? [],
        streak: s.streaks[id] ?? null,
      }))
      // Something the account has actually done comes before something it
      // merely could: an app with a pack, a badge or a run outranks one that
      // only exists because the registry found its table.
      .filter((a) => a.since || a.earned || a.packs.length || a.streak)
      .sort((a, b) => a.title.localeCompare(b.title))
  }, [stats, appName])

  const graph = social.state.kind === 'ok' ? social.state.graph : null
  const friends = useMemo(
    () => sortFriends((graph?.friends ?? []).filter((p) => matches(p, friendQuery)), friendSort),
    [graph, friendQuery, friendSort],
  )
  const cooldown = usernameFreeAt(profile?.username_changed_at)

  return (
    <section id="top" className="section section--blend appview acct">
      <div className="texture appview__grid" aria-hidden="true" />
      <div ref={blob} className="blob appview__blob" aria-hidden="true" />

      <div className="shell appview__shell">
        {/* Home rather than a list: this page is opened from the nav's account
            menu, which is on every page. Somebody who arrived from a link that
            remembered where they were still gets that place back. */}
        <BackButton fallbackLabel="Home" fallbackHash="#top" />

        <div ref={head} className="appview__head">
          <div className="kicker">
            <span className="kicker__rule" />
            <span className="kicker__label">Your Account</span>
          </div>
          <h1 className="h2 appview__title">{name}</h1>

          {status === 'signedIn' && (
            <div className="acct__identity">
              {profile?.username && <span className="acct__handle">@{profile.username}</span>}
              {user?.email && <span className="acct__email">{user.email}</span>}
              <span className="chips acct__tags">
                {isAdmin && <span className="chip chip--hot">Developer</span>}
                <span className="chip">{prettyId(tier ?? 'free')} Plan</span>
              </span>
              {/* Your own page, as anybody else sees it. It sits with your
                  identity rather than under Privacy, because the question it
                  answers is "what do people see", and the honest way to answer
                  that is to show them the actual page rather than describe it.
                  Without a handle there is no page: a profile's address is
                  `#/user/<handle>` and there is no other one, so this says how
                  to get one instead of linking nowhere. */}
              {profile?.username ? (
                <a className="acct__self-link" href={userHash(profile.username)}>
                  View Your Public Profile
                </a>
              ) : (
                <span className="acct__self-link acct__self-link--off">
                  Pick a username to get a profile page
                </span>
              )}
            </div>
          )}
        </div>

        {/* ── signed out ────────────────────────────────────────────────────
            The route exists, so this says so. Rendering home instead — the way
            `#/dev` does — would be the right answer for a page nobody is meant
            to know about, and the wrong one for a page whose whole job is to
            be somewhere a reader can get to. */}
        {status === 'signedOut' && (
          <div className="card acct__card">
            <h2 className="acct__card-title">Sign In To See Your Account</h2>
            <p className="acct__card-blurb">
              One TDG account signs you in to every app we make, and this page is where it lives.
            </p>
            <button type="button" className="acct__primary" onClick={onOpenAuth}>
              Sign In Or Create An Account
            </button>
          </div>
        )}

        {status === 'loading' && (
          <div className="card acct__card">
            <p className="acct__note">Restoring your session…</p>
          </div>
        )}

        {status === 'signedIn' && (
          /* Two open, four shut. See the note at the top of this file for why
             this page departs from `sections.tsx`'s collapsed default. Read
             ONCE, on mount: it seeds the state, it does not drive it, so
             nothing here re-opens a section the reader has since shut. */
          <SectionsProvider initialOpen={['details', 'stats']}>
            <FoldControls />

            <div className="acct__folds">
              {/* ── your details ───────────────────────────────────────── */}
              <AccountFold
                id="details"
                title="Your Details"
                what="Your name, your handle, the few lines about you, and how you get back in. Each field saves the moment you leave it."
              >
                <div className="acct__fields">
                  <EditField
                    field="displayName"
                    label="Display Name"
                    hint="What people see first. Change it as often as you like."
                    state={editor.fields.displayName}
                    set={editor.set}
                    commit={editor.commit}
                    reset={editor.reset}
                    maxLength={60}
                    autoComplete="nickname"
                    placeholder="Not set"
                  />
                  <EditField
                    field="username"
                    label="Username"
                    hint={
                      cooldown
                        ? `${USERNAME_RULE} You can change yours again on ${fmtDay(cooldown.toISOString())}.`
                        : `${USERNAME_RULE} It can change once every 2 weeks.`
                    }
                    state={editor.fields.username}
                    set={editor.set}
                    commit={editor.commit}
                    reset={editor.reset}
                    prefix="@"
                    maxLength={20}
                    autoComplete="username"
                    placeholder="not set"
                  />
                  <EditField
                    field="bio"
                    label="Bio"
                    hint="A few lines about you, shown to whoever your privacy settings allow."
                    state={editor.fields.bio}
                    set={editor.set}
                    commit={editor.commit}
                    reset={editor.reset}
                    multiline
                    maxLength={300}
                    placeholder="Nothing yet"
                  />
                  <EditField
                    field="recoveryEmail"
                    label="Recovery Email"
                    hint="Optional. A second address you can sign in with. Reset links still only ever go to the address you signed up with."
                    state={editor.fields.recoveryEmail}
                    set={editor.set}
                    commit={editor.commit}
                    reset={editor.reset}
                    type="email"
                    maxLength={254}
                    autoComplete="email"
                    placeholder="Not set"
                  />
                </div>

                <AccountSub
                  title="What You Cannot Change Here"
                  what="Your sign-in address and your plan are changed elsewhere, and this is where they say so rather than looking like fields that stopped working."
                >
                  <dl className="acct__facts">
                    <Fact label="Email" value={user?.email || 'not set'} />
                    <Fact label="Plan" value={prettyId(tier ?? 'free')} />
                    <Fact label="Account Type" value={isAdmin ? 'TDG Developer' : 'TDG Account'} />
                    {stats.kind === 'ok' && (
                      <Fact
                        label="Member Since"
                        value={fmtDay(stats.stats.createdAt)}
                        hint={fmtRelative(stats.stats.createdAt)}
                      />
                    )}
                    {stats.kind === 'error' && (
                      <Fact label="Member Since" value="—" hint="we couldn't read that just now" />
                    )}
                  </dl>
                </AccountSub>
              </AccountFold>

              {/* ── your stats ─────────────────────────────────────────── */}
              <AccountFold
                id="stats"
                title="Your Stats"
                what="Everything this account has added up, across every TDG app."
              >
                {stats.kind === 'checking' && <p className="acct__note">Counting…</p>}
                {stats.kind === 'error' && (
                  <p className="acct__note acct__note--warn">
                    We couldn't read your stats just now. Nothing has changed — try again in a
                    moment.
                  </p>
                )}
                {stats.kind === 'ok' && (
                  <>
                    <div className="acct__tiles">
                      <Tile n={stats.stats.friends} label="Friends" />
                      <Tile n={stats.stats.requestsIn} label="Requests" hint="waiting on you" />
                      <Tile n={stats.stats.requestsOut} label="Asked" hint="sent by you" />
                      <Tile n={stats.stats.blocked} label="Blocked" />
                      <Tile n={stats.stats.badges} label="Badges" />
                      <Tile n={apps.length} label="Apps Used" />
                      <Tile n={packs} label="Packs Owned" />
                      <Tile n={stats.stats.feedbackSent} label="Reports Sent" />
                    </div>

                    <AccountSub
                      title="Streaks"
                      what="A run of days you kept, counted per app. Nothing here is a total: two apps are two habits."
                    >
                      {streaks.length === 0 ? (
                        <p className="acct__note">
                          No streak yet. One starts the first day you use a TDG app that counts them.
                        </p>
                      ) : (
                        <div className="acct__streaks">
                          {streaks.map(([app, streak]) => (
                            <div key={app} className="acct__streak">
                              {/* The app's own name, never the id the database
                                  stores. `Bea` is a column value, not a product
                                  anybody has opened. See appNames.ts. */}
                              <span className="acct__streak-app">{appName(app)}</span>
                              <span className="acct__streak-n">
                                {fmtCount(streak.current)}
                                <span className="acct__streak-unit">day streak</span>
                              </span>
                              <span className="acct__streak-more">
                                Best {fmtCount(streak.longest)} · {fmtCount(streak.days)} days in
                                all
                                {streak.lastActive
                                  ? ` · last counted ${fmtRelative(streak.lastActive)}`
                                  : ''}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </AccountSub>
                  </>
                )}
              </AccountFold>

              {/* ── app stats ──────────────────────────────────────────── */}
              <AccountFold
                id="apps"
                title="App Stats"
                what="Which TDG apps this account has opened, what it owns in each, and the badges it has earned."
                count={stats.kind === 'ok' ? `${fmtCount(apps.length)} apps` : undefined}
              >
                {stats.kind === 'checking' && <p className="acct__note">Looking…</p>}
                {stats.kind === 'error' && (
                  <p className="acct__note acct__note--warn">
                    We couldn't read your apps just now.
                  </p>
                )}
                {stats.kind === 'ok' && apps.length === 0 && (
                  <p className="acct__note">
                    Nothing yet. An app appears here the first time it writes something to your TDG
                    account.
                  </p>
                )}
                {stats.kind === 'ok' && apps.length > 0 && (
                  <div className="acct__apps">
                    {apps.map((app) => (
                      <div key={app.id} className="acct__app">
                        <span className="acct__app-name">{app.title}</span>
                        <dl className="acct__app-facts">
                          <div className="acct__app-fact">
                            <dt>Since</dt>
                            <dd>{app.since ? fmtDay(app.since) : 'not recorded'}</dd>
                          </div>
                          <div className="acct__app-fact">
                            <dt>Badges Earned</dt>
                            <dd>{fmtCount(app.earned)}</dd>
                          </div>
                          <div className="acct__app-fact">
                            <dt>Streak</dt>
                            <dd>
                              {app.streak ? `${fmtCount(app.streak.current)} days` : 'none counted'}
                            </dd>
                          </div>
                          <div className="acct__app-fact">
                            <dt>Packs Owned</dt>
                            <dd>
                              {app.packs.length === 0
                                ? 'none'
                                : app.packs.map((p) => prettyId(p)).join(', ')}
                            </dd>
                          </div>
                        </dl>
                      </div>
                    ))}
                  </div>
                )}

                <AccountSub
                  title="Badges"
                  what="Marks on the account itself, true in every TDG app at once."
                >
                  {badges.kind === 'checking' && (
                    <p className="acct__note">Checking your badges…</p>
                  )}
                  {badges.kind === 'error' && (
                    <p className="acct__note acct__note--warn">
                      We couldn't read your badges just now.
                    </p>
                  )}
                  {badges.kind === 'ok' && badges.badges.length === 0 && (
                    <p className="acct__note">No badges yet. We hand them out one at a time.</p>
                  )}
                  {badges.kind === 'ok' && badges.badges.length > 0 && (
                    <div className="chips acct__badges">
                      {badges.badges.map((badge) => (
                        <span key={badge.id} className="chip acct__badge" title={badge.blurb}>
                          {badge.label}
                          <span className="sr-only"> — {badge.blurb}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </AccountSub>
              </AccountFold>

              {/* ── friends & social ───────────────────────────────────── */}
              <AccountFold
                id="social"
                title="Friends & Social"
                what="The people you know across TDG, the requests waiting on you, and anyone you have blocked."
                count={
                  graph
                    ? graph.incoming.length > 0
                      ? `${fmtCount(graph.incoming.length)} waiting on you`
                      : `${fmtCount(graph.friends.length)} friends`
                    : undefined
                }
              >
                {social.state.kind === 'checking' && <p className="acct__note">Reading…</p>}
                {social.state.kind === 'error' && (
                  <p className="acct__note acct__note--warn">
                    We couldn't read your friends just now, so this is not showing you a guess.
                    Nothing has changed.
                  </p>
                )}

                {/* A refusal from any of the seven verbs, shown once, where the
                    presses are. "This account is not taking friend requests" is
                    a fact about them and worth reading. Outside the guard
                    below, because a press made on a SEARCH result has to be
                    able to say why it was refused even when the graph read is
                    the thing that failed. */}
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

                {/* Also outside it. Find People is a read of its own, over
                    accounts this browser holds none of, and it does not need
                    the graph to work — so a failed graph read costs you your
                    four lists and not the ability to look anybody up. */}
                <FindPeople social={social} />

                {graph && (
                  <>
                    <AccountSub
                      title="Waiting On You"
                      what="People who have asked to be your friend. Declining is quiet: they are not told."
                    >
                      <PeopleList
                        people={graph.incoming}
                        empty="Nobody is waiting on you."
                        actions={[
                          { action: 'accept', label: 'Accept', tone: 'primary' },
                          { action: 'decline', label: 'Decline' },
                          { action: 'block', label: 'Block', tone: 'quiet' },
                        ]}
                        busy={social.busy}
                        onAct={social.act}
                      />
                    </AccountSub>

                    <AccountSub
                      title="Friends"
                      what="Friendship is two-sided, so unfriending ends it for both of you and they are not told. Star the ones you want at the top."
                    >
                      {/* Filter and sort sit ABOVE the list and are drawn even
                          when there is nothing to filter — a control that
                          appears once a list is long enough is a control
                          nobody knows exists until the day it arrives. They go
                          quiet instead: with no friends there is nothing to
                          arrange and both are disabled, which says so without
                          moving anything. */}
                      <div className="acct__listbar">
                        <div className="acct__input-wrap acct__listbar-find">
                          <input
                            id="acct-friend-filter"
                            className="acct__input"
                            value={friendQuery}
                            type="search"
                            autoCapitalize="off"
                            spellCheck={false}
                            disabled={graph.friends.length === 0}
                            aria-label="Search your friends"
                            placeholder="Search your friends"
                            onChange={(e) => setFriendQuery(e.currentTarget.value)}
                          />
                        </div>
                        <div
                          className="acct__listbar-sort"
                          data-disabled={graph.friends.length === 0 || undefined}
                        >
                          <label className="sr-only" htmlFor="acct-friend-sort">
                            Sort your friends
                          </label>
                          <select
                            id="acct-friend-sort"
                            className="acct__select"
                            value={friendSort}
                            disabled={graph.friends.length === 0}
                            onChange={(e) => setFriendSort(e.currentTarget.value as FriendSort)}
                          >
                            {FRIEND_SORTS.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          {/* The native arrow is gone with `appearance: none`,
                              so the control has to draw its own — rule 5:
                              nothing here ships wearing the browser's default
                              look, and a select with no arrow does not read as
                              a select at all. */}
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
                      </div>

                      {/* The count is the FILTERED one against the total, so a
                          search that hides half the list says so rather than
                          looking like half the friends went missing. */}
                      {graph.friends.length > 0 && (
                        <p className="acct__hint acct__listbar-count">
                          {friendQuery.trim()
                            ? `${fmtCount(friends.length)} of ${fmtCount(graph.friends.length)} friends match.`
                            : `${fmtCount(graph.friends.length)} friend${graph.friends.length === 1 ? '' : 's'}.`}
                        </p>
                      )}

                      <PeopleList
                        people={friends}
                        empty={
                          graph.friends.length === 0
                            ? 'No friends yet. Find somebody above and ask.'
                            : `None of your friends match “${friendQuery.trim()}”.`
                        }
                        actions={[
                          { action: 'remove', label: 'Unfriend' },
                          { action: 'block', label: 'Block', tone: 'quiet' },
                        ]}
                        busy={social.busy}
                        onAct={social.act}
                        onFavorite={social.favorite}
                      />
                    </AccountSub>

                    <AccountSub
                      title="Sent By You"
                      what="Requests you have made that have not been answered yet."
                    >
                      <PeopleList
                        people={graph.outgoing}
                        empty="You have not asked anybody."
                        actions={[{ action: 'cancel', label: 'Withdraw' }]}
                        busy={social.busy}
                        onAct={social.act}
                      />
                    </AccountSub>

                    <AccountSub
                      title="Blocked"
                      what="A block ends any friendship and clears anything pending in both directions. Unblocking asks nothing, because it takes nothing away."
                    >
                      <PeopleList
                        people={graph.blocked}
                        empty="You have not blocked anybody."
                        actions={[{ action: 'unblock', label: 'Unblock' }]}
                        busy={social.busy}
                        onAct={social.act}
                      />
                    </AccountSub>
                  </>
                )}
              </AccountFold>

              {/* ── privacy ────────────────────────────────────────────── */}
              <AccountFold
                id="privacy"
                title="Privacy"
                what="Who can see each part of your account. Every one of these is yours to change, and every change is saved the moment you make it."
              >
                {privacy.state.kind === 'checking' && (
                  <p className="acct__note">Reading your settings…</p>
                )}
                {privacy.state.kind === 'error' && (
                  <p className="acct__note acct__note--warn">
                    We couldn't read your privacy settings just now, so this page will not guess at
                    them. Nothing has changed — try again in a moment.
                  </p>
                )}
                {privacy.state.kind === 'ok' && (
                  <>
                    {/* A refusal is shown where the press was made, in the
                        server's own words, and the control has already gone
                        back to what it was. A silent revert would read as the
                        site undoing a choice for reasons of its own. */}
                    {privacy.problem && (
                      <p className="acct__problem" role="alert">
                        {privacy.problem}
                        <button
                          type="button"
                          className="acct__problem-x"
                          aria-label="Dismiss"
                          onClick={privacy.dismissProblem}
                        >
                          ×
                        </button>
                      </p>
                    )}
                    <PrivacyList
                      controls={privacy.state.controls}
                      audiences={privacy.state.audiences}
                      groups={privacy.state.groups}
                      saving={privacy.saving}
                      onPick={privacy.setOne}
                      onAll={privacy.setAll}
                    />
                  </>
                )}
              </AccountFold>

              {/* ── the way out ────────────────────────────────────────── */}
              <AccountFold
                id="session"
                title="Session"
                what="How you reach us, and how you leave. Signing out here signs out this browser only — your other devices and the other TDG apps stay signed in."
              >
                <div className="acct__actions">
                  <button type="button" className="appview__ghost" onClick={onOpenFeedback}>
                    Send Feedback
                  </button>
                  <button type="button" className="appview__ghost" onClick={() => void signOut()}>
                    Sign Out
                  </button>
                </div>
              </AccountFold>
            </div>
          </SectionsProvider>
        )}
      </div>
    </section>
  )
}
