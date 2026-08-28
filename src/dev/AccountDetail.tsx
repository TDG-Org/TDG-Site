import { useEffect, useMemo, useState } from 'react'
import type { DevAccount, DevAuditRow, DevCatalog, DevEvent } from './api'
import * as api from './api'
// The badge verbs live with the rest of the badge surface rather than in
// `./api`, because the site's footer and every other TDG app call the same
// module. This console is one of its callers. See src/badges/README.md.
import { adminSetBadge } from '../badges/api'
import type { AdminBadge } from '../badges/types'
import {
  MAK_APP_ID,
  grantNote,
  orphanRevocations,
  revocationsOf,
  storeApps,
  type DevStoreApp,
  type DevStorePack,
} from './apps'
import { GRANT_SHAPES, grantArgsFor, holdingOf, holdingsFor, type HoldingId } from './grantShapes'
import {
  Button,
  Combo,
  CopyButton,
  Fact,
  Field,
  HoldingTile,
  OwnTile,
  Panel,
  SaveBar,
  Select,
  Switch,
  Tag,
  TextArea,
  TextInput,
  TypeToConfirm,
  useSaveNotice,
} from './controls'
import {
  DURATIONS,
  fmtDate,
  fmtRelative,
  fmtUsd,
  nameOf,
  prettyId,
  standingOf,
  stillInForce,
  untilFromHours,
} from './format'
import { Highlight, hay, matchesTerms, useSearch } from './search'

/**
 * The accounts whose Developer switch does NOT stop to ask.
 *
 * Granting or removing Developer opens a confirm in place, because it is the
 * one switch on this page that hands somebody the whole console — every
 * account, every purchase, every subscription in TDG Core — and it is a single
 * click away from the switch above it. These two are the developer test
 * accounts we flip on purpose while working on this page, and a confirm on the
 * thing you are deliberately toggling twenty times is a confirm you learn to
 * click through without reading, which is worse than not having one.
 *
 * **It is a convenience, not a permission.** Nothing here decides anything: the
 * server refuses a non-developer either way, and the two OWNER accounts are
 * protected by a trigger on `public.profiles` that this list has no bearing on
 * — see `useProtectedAccounts` below and
 * supabase/migrations/20260822015840_protected_developer_accounts.sql.
 */
const NO_CONFIRM_ACCOUNTS: ReadonlySet<string> = new Set([
  '95d7b353-6a23-4c8e-82e4-e029e7a4a183',
  'd0ff8af3-6fe2-4cb6-8de1-c537357e7e64',
])

/** What DevConsole hands every panel: run one write, then re-read the account. */
export type Run = (key: string, okMessage: string, fn: () => Promise<unknown>) => void

type Props = {
  account: DevAccount
  catalog: DevCatalog
  /** The signed-in developer. Several actions refuse to run on yourself. */
  meId: string
  run: Run
  busy: string | null
  events: DevEvent[]
  audit: DevAuditRow[]
  historyState: 'loading' | 'ready' | 'error'
  /** Every catalogue row for this account, held or not. Read by DevConsole so
   *  it re-reads with everything else when Refresh is pressed. */
  badges: AdminBadge[]
  badgesState: 'loading' | 'ready' | 'error'
  /** What the server said when it refused, kept whole. Null when it did not. */
  badgesError: string | null
}

/**
 * The accounts the database will not let anybody demote or delete.
 *
 * Read once and held for the page. A panel asks so it can render a locked
 * switch rather than a live one the server is going to refuse; the refusing
 * itself happens in Postgres either way. An empty answer, from a read that
 * failed, therefore costs nothing worse than a switch that looks available
 * until you press it, which is what the page did before this existed.
 */
function useProtectedAccounts(): ReadonlySet<string> {
  const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set())
  useEffect(() => {
    let live = true
    api.getProtectedAccounts().then(
      (list) => live && setIds(new Set(list)),
      () => {},
    )
    return () => {
      live = false
    }
  }, [])
  return ids
}

export function AccountDetail(props: Props) {
  const { account, catalog, meId } = props
  const isSelf = account.user_id === meId
  const standing = standingOf(account)
  const isProtected = useProtectedAccounts().has(account.user_id)

  // Every app with a pack Store, merged from what the server found and what
  // the site sells. Nothing below names an app: add a product and a panel
  // appears here on its own. See `apps.ts`.
  const stores = useMemo(() => storeApps(catalog, account), [catalog, account])

  return (
    <div className="dev__detail">
      <header className="dev__detail-head">
        <div className="dev__detail-who">
          <h2 className="dev__detail-name">{nameOf(account)}</h2>
          <div className="dev__detail-sub">
            {account.username ? (
              <span className="dev__handle">@{account.username}</span>
            ) : (
              <span className="dev__handle dev__handle--none">no username</span>
            )}
            <span className="dev__detail-email">{account.email ?? 'no email'}</span>
            {/* The id, in full, in the header rather than only inside a panel.
                It is what every other tool on this project asks for — a SQL
                query, a Stripe customer, a log line, a message to whoever is
                looking at the same account — and having to open At A Glance to
                copy it made the one thing you always need the one thing you
                had to go and find. */}
            <span className="dev__detail-id">
              <span className="dev__sr-only">User id: </span>
              <code className="dev__code">{account.user_id}</code>
              <CopyButton
                value={account.user_id}
                label={`Copy the user id for ${nameOf(account)}`}
              />
            </span>
          </div>
        </div>
        <div className="dev__detail-tags">
          {account.is_admin && <Tag tone="hot">DEVELOPER</Tag>}
          {isProtected && <Tag tone="ok">PROTECTED</Tag>}
          {isSelf && <Tag tone="hot">YOU</Tag>}
          <Tag tone={standing.tone}>{standing.label.toUpperCase()}</Tag>
        </div>
      </header>

      <p className="dev__standing" data-tone={standing.tone}>
        <strong>{standing.label}:</strong> {standing.meaning}
      </p>

      {/* ── the order, and why it is this one ─────────────────────────────
          Who they are, then what we have done to the account, then what they
          hold. The apps used to be seven panels stacked in the middle of that
          run — Makullveny plus one Store each — which pushed Standing & Access,
          the panel you reach for when somebody reports abuse, below a screen of
          pack switches. Now they are one fold: shut, the run of panels is short
          enough to read as an index; open, every app is inside it with its own
          fold, exactly as it was. */}
      <IdentityPanel {...props} isSelf={isSelf} isProtected={isProtected} />
      <StandingPanel {...props} isSelf={isSelf} isProtected={isProtected} />
      {/* Under the panels that own the two facts a DERIVED badge follows —
          Developer is `profiles.is_admin`, which now lives in the Permissions
          fold inside Identity above, and Subscriber is a paid `core_tier`,
          which is the panel directly below. So "change the fact and the badge
          follows" still points at something the reader can see from here. */}
      <BadgesPanel {...props} />
      <CorePanel {...props} />
      <AppsPanel {...props} stores={stores} />
      <HistoryPanel {...props} />
    </div>
  )
}

/* ── who this is ───────────────────────────────────────────────────────── */

/* ── identity ──────────────────────────────────────────────────────────── */

/**
 * Who this account is: the facts about it, the fields we can change, and — in a
 * fold of its own — the one permission TDG has.
 *
 * ## Why At A Glance is not a panel any more
 *
 * It was eight read-only rows about the same account this panel edits, sitting
 * immediately above it, and opening one to read a join date before editing a
 * username meant two sections open to look at one person. They are one panel
 * now: the facts first, then the fields that change them.
 *
 * ## Why Developer is a fold inside it rather than a switch in it
 *
 * It belongs to identity — it is what this account IS across every TDG app —
 * but it is also the single most dangerous control on the page, and a switch
 * sitting in the same run as Display Name is a switch somebody hits on the way
 * past. Shut, it says which of the three standings the account has and nothing
 * else. Open, it asks before it moves. See `NO_CONFIRM_ACCOUNTS` for the two
 * accounts that skip the asking and why.
 */
function IdentityPanel({
  account: a,
  run,
  busy,
  isSelf,
  isProtected,
}: Props & { isSelf: boolean; isProtected: boolean }) {
  const [displayName, setDisplayName] = useState(a.display_name ?? '')
  const [username, setUsername] = useState(a.username ?? '')
  const [bio, setBio] = useState(a.bio ?? '')
  const [publicProfile, setPublicProfile] = useState(a.public_profile)
  const [publicFriendList, setPublicFriendList] = useState(a.public_friend_list)

  // Re-seed whenever a different account is selected, or the same one comes
  // back changed. Without this, clicking a second account would show the first
  // one's half-typed edits sitting in a form labelled with the new name.
  useEffect(() => {
    setDisplayName(a.display_name ?? '')
    setUsername(a.username ?? '')
    setBio(a.bio ?? '')
    setPublicProfile(a.public_profile)
    setPublicFriendList(a.public_friend_list)
  }, [a.user_id, a.display_name, a.username, a.bio, a.public_profile, a.public_friend_list])

  const dirty =
    displayName !== (a.display_name ?? '') ||
    username !== (a.username ?? '') ||
    bio !== (a.bio ?? '') ||
    publicProfile !== a.public_profile ||
    publicFriendList !== a.public_friend_list

  const save = () =>
    run('identity', 'Profile saved.', () =>
      // Only what actually changed goes over the wire. `undefined` tells the
      // function to leave a field alone, and '' tells it to clear one.
      api.setProfile(a.user_id, {
        displayName: displayName !== (a.display_name ?? '') ? displayName : undefined,
        username: username !== (a.username ?? '') ? username : undefined,
        bio: bio !== (a.bio ?? '') ? bio : undefined,
        publicProfile: publicProfile !== a.public_profile ? publicProfile : undefined,
        publicFriendList: publicFriendList !== a.public_friend_list ? publicFriendList : undefined,
      }),
    )

  return (
    <Panel
      title="Identity"
      what="Who this account is: the facts it was created with, the name and handle it shows under everywhere in TDG, and its Developer permission. Leave a field blank to clear it."
      writes="public.profiles + auth.users"
      terms={[
        a.user_id,
        a.email,
        a.recovery_email,
        a.display_name,
        a.username,
        a.bio,
        a.is_admin ? 'developer admin' : 'standard',
        'name handle privacy permission role',
      ]}
      right={
        dirty ? <Tag tone="warn">UNSAVED</Tag> : <span className="dev__panel-quiet">Saved</span>
      }
    >
      <div className="dev__facts">
        <Fact label="User id" value={a.user_id} copy={a.user_id} mono />
        <Fact
          label="Email"
          value={
            <>
              {a.email ?? 'none'}{' '}
              {a.email_confirmed_at ? (
                <Tag tone="ok">CONFIRMED</Tag>
              ) : (
                <Tag tone="warn">UNCONFIRMED</Tag>
              )}
            </>
          }
          copy={a.email ?? undefined}
        />
        <Fact label="Recovery email" value={a.recovery_email ?? 'none'} />
        <Fact label="Joined" value={`${fmtDate(a.created_at)} · ${fmtRelative(a.created_at)}`} />
        <Fact
          label="Last signed in"
          value={
            a.last_sign_in_at
              ? `${fmtDate(a.last_sign_in_at)} · ${fmtRelative(a.last_sign_in_at)}`
              : 'never'
          }
        />
        <Fact label="Profile last changed" value={fmtRelative(a.updated_at)} />
        <Fact label="Bible Educator friends" value={String(a.friend_count)} />
        <Fact
          label="Bible Educator streak"
          value={`${a.streak_current} now · ${a.streak_longest} best · ${a.streak_total} days total`}
        />
      </div>

      <hr className="dev__rule" />

      <div className="dev__grid2">
        <Field label="Display Name" htmlFor="dev-dn" hint="What people see. Any characters, up to 60.">
          <TextInput id="dev-dn" value={displayName} onChange={setDisplayName} maxLength={60} />
        </Field>
        <Field
          label="Username"
          htmlFor="dev-un"
          hint="3–20 letters, numbers and underscores. Changing it here also starts their own 2-week rename cooldown."
        >
          <TextInput id="dev-un" value={username} onChange={setUsername} maxLength={20} />
        </Field>
      </div>

      <Field label="Bio" htmlFor="dev-bio" hint="Text only, shown on their public profile in Bible Educator.">
        <TextArea id="dev-bio" value={bio} onChange={setBio} maxLength={400} rows={3} />
      </Field>

      <Switch
        checked={publicProfile}
        onChange={setPublicProfile}
        label="Public Profile"
        hint="Off means only they and a developer can see the profile. This is the account owner's own privacy setting, so change it for them only when they have asked."
      />
      <Switch
        checked={publicFriendList}
        onChange={setPublicFriendList}
        label="Public Friend List"
        hint="Whether their friends appear on that public profile."
      />

      <div className="dev__row dev__row--end">
        <Button variant="primary" disabled={!dirty} busy={busy === 'identity'} onClick={save}>
          Save Identity
        </Button>
      </div>

      <PermissionsPanel a={a} run={run} busy={busy} isSelf={isSelf} isProtected={isProtected} />
    </Panel>
  )
}

/* ── permissions ───────────────────────────────────────────────────────── */

/**
 * The one permission TDG has, in a fold of its own inside Identity.
 *
 * ## Why it asks
 *
 * Developer grants full read and write over every account, purchase and
 * subscription in TDG Core, and until this it was a single click with no step
 * in between — in the same run of switches as Public Friend List. Rule 11 of
 * AGENTS.md already says the Store's two money presses ask first, in the panel,
 * in place rather than in a second dialog over the first; this is the same
 * press with more behind it, so it asks the same way.
 *
 * It asks in BOTH directions on purpose. Granting is the one that hands the
 * console to somebody; revoking is the one that takes a working account away
 * from one of us mid-session. Neither is a thing to do by brushing past it.
 *
 * ## Why two accounts skip it
 *
 * `NO_CONFIRM_ACCOUNTS` — the two developer test accounts we flip on purpose
 * while working on this page. A confirm on the switch you are deliberately
 * toggling twenty times is one you learn to click through without reading,
 * which is worse than not having it at all. It is a convenience and never a
 * permission: the server refuses a non-developer either way, and the two OWNER
 * accounts are held by a trigger this list cannot reach.
 */
function PermissionsPanel({
  a,
  run,
  busy,
  isSelf,
  isProtected,
}: {
  a: DevAccount
  run: Run
  busy: string | null
  isSelf: boolean
  isProtected: boolean
}) {
  /** The value somebody asked for and has not confirmed yet. */
  const [pending, setPending] = useState<boolean | null>(null)
  const locked = isSelf || isProtected
  const skipsConfirm = NO_CONFIRM_ACCOUNTS.has(a.user_id)

  // A different account arriving under an open confirm would put the question
  // about one person over the answer for another.
  useEffect(() => setPending(null), [a.user_id, a.is_admin])

  const apply = (next: boolean) =>
    run('developer', next ? 'Developer granted.' : 'Developer revoked.', () =>
      api.setDeveloper(a.user_id, next),
    )

  return (
    <Panel
      id="permissions"
      title="Permissions"
      what="Developer is the only permission TDG has. It unlocks this console and Bible Educator's moderation tools, for every TDG app at once."
      writes="public.profiles.is_admin"
      terms={[a.is_admin ? 'developer admin' : 'standard', 'permission role']}
      tone={a.is_admin ? 'danger' : 'plain'}
      right={
        isProtected ? (
          <Tag tone="ok">PROTECTED</Tag>
        ) : a.is_admin ? (
          <Tag tone="hot">DEVELOPER</Tag>
        ) : (
          <Tag>STANDARD</Tag>
        )
      }
    >
      <Switch
        tone="danger"
        // The switch keeps showing what is TRUE while a confirm is open. A
        // switch that moves on the ask and moves back on Cancel is a switch
        // that has already told you it did something.
        checked={a.is_admin}
        disabled={locked || pending !== null}
        busy={busy === 'developer'}
        onChange={(next) => (skipsConfirm ? apply(next) : setPending(next))}
        label="Developer"
        hint={
          isProtected
            ? 'This is one of the two TDG owner accounts. Its Developer permission is fixed in the database and cannot be removed from here, or from anywhere else the apps can reach. Changing that list takes a migration.'
            : isSelf
              ? "You can't change your own. That rule is what stops the last developer locking everyone out, so ask the other one to do it."
              : skipsConfirm
                ? 'Grants full read and write over every account, purchase and subscription in TDG Core. This is one of the two developer test accounts, so it takes effect on the press with no confirm — see NO_CONFIRM_ACCOUNTS in this file.'
                : 'Grants full read and write over every account, purchase and subscription in TDG Core. Give it to nobody who is not one of us. It will ask before it moves.'
        }
      />

      {pending !== null && (
        <div className="dev__confirm">
          <p className="dev__confirm-copy">
            {pending ? (
              <>
                Make <strong>{nameOf(a)}</strong> a TDG developer? They get this console and
                everything in it: every account, every purchase, every subscription across Bible
                Educator, Makullveny, TDG Veditor and DevFleet, and Bible Educator&apos;s
                moderation tools.
              </>
            ) : (
              <>
                Take Developer away from <strong>{nameOf(a)}</strong>? They lose this console and
                every moderation tool immediately, in every TDG app, including any they are in the
                middle of using.
              </>
            )}
          </p>
          <div className="dev__row">
            <Button
              variant={pending ? 'danger' : 'primary'}
              busy={busy === 'developer'}
              onClick={() => {
                apply(pending)
                setPending(null)
              }}
            >
              {pending ? 'Grant Developer' : 'Remove Developer'}
            </Button>
            <Button onClick={() => setPending(null)}>Cancel</Button>
          </div>
        </div>
      )}
    </Panel>
  )
}

/* ── TDG-wide subscription ─────────────────────────────────────────────── */

function CorePanel({ account: a, catalog, run, busy }: Props) {
  const [tier, setTier] = useState(a.core_tier)
  const [status, setStatus] = useState(a.core_status)

  useEffect(() => {
    setTier(a.core_tier)
    setStatus(a.core_status)
  }, [a.user_id, a.core_tier, a.core_status])

  // Same rule as Makullveny's: `free / past_due` is a status describing a
  // subscription that is not there, and every account rests at active.
  const statusToWrite = tier === 'free' ? 'active' : status
  const dirty = tier !== a.core_tier || statusToWrite !== a.core_status

  return (
    <Panel
      title="TDG Core Subscription"
      what="The one tier every TDG app can gate on. Setting it here is a free grant: no Stripe, no charge, and it takes effect the next time the app reads it."
      writes="public.subscriptions"
      terms={[a.core_tier, a.core_status, a.core_stripe_customer_id, 'tier plan free grant']}
      right={
        <Tag tone={a.core_tier === 'free' ? 'plain' : 'ok'}>{a.core_tier.toUpperCase()}</Tag>
      }
    >
      {a.core_row_count > 1 && (
        <p className="dev__warn">
          This account has {a.core_row_count} rows in <code className="dev__code">subscriptions</code>,
          and apps read that table expecting one. Saving below rewrites every one of them to the same
          values, which fixes it.
        </p>
      )}

      <div className="dev__grid2">
        <Field
          label="Tier"
          hint="Bible Educator ranks these free → plus → pro → lifetime, and treats anything it does not recognise as at least the top paid tier."
        >
          {/* Keyed by account: Combo holds its own "showing the free-text box"
              state, and without this, picking Other… on one person would leave
              the box open on whoever you clicked next. */}
          <Combo key={a.user_id} value={tier} onChange={setTier} options={catalog.core_tiers} />
        </Field>
        <Field
          label="Standing"
          hint={
            tier === 'free'
              ? 'Only asked when there is a paid tier to be standing in. On free this is written as active, which is where every account rests.'
              : "Only 'active' actually unlocks anything today; the rest are for matching Stripe."
          }
        >
          <Select
            value={statusToWrite}
            onChange={setStatus}
            disabled={tier === 'free'}
            options={catalog.statuses.map((s) => ({ value: s, label: s }))}
          />
        </Field>
      </div>

      <div className="dev__facts dev__facts--tight">
        <Fact label="Stripe customer" value={a.core_stripe_customer_id ?? 'none (never paid)'} mono />
        <Fact label="Last changed" value={fmtRelative(a.core_renewed_at, 'never')} />
      </div>

      <div className="dev__row dev__row--end">
        <Button
          variant="primary"
          disabled={!dirty}
          busy={busy === 'core'}
          onClick={() =>
            run('core', `Core subscription set to ${tier} / ${statusToWrite}.`, () =>
              api.setCoreSubscription(a.user_id, tier, statusToWrite),
            )
          }
        >
          Save Subscription
        </Button>
      </div>
    </Panel>
  )
}

/* ── badges ────────────────────────────────────────────────────────────── */

/**
 * The badge switchboard: hand a friend Bug Hunter, or take it back.
 *
 * ## Why this is a full switchboard and not a list
 *
 * `tdg_admin_badges` returns EVERY catalogue row with `held` set, not only the
 * ones the account already has, so the panel draws the whole set. A console
 * that can only show what somebody holds cannot be used to give them anything,
 * which is the entire reason this page exists.
 *
 * ## Nothing here writes a badge id down
 *
 * Not one, anywhere in this folder. The names, the copy and which of them are
 * computed all arrive from `tdg_badge_catalog()`, so a seventh badge added by
 * a migration tomorrow renders here the same day with no edit — AGENTS.md rule
 * 17, and `src/badges/README.md` explains why the catalogue is in SQL. The
 * consequence worth stating out loud is that this component cannot recognise
 * anything: it renders what it is handed, and where the server sent an id with
 * no words attached it makes a name out of the id and says so, rather than
 * dropping a row it could not read.
 *
 * ## Derived badges are drawn as STATE, not as a control
 *
 * Two of today's six are computed — one follows `profiles.is_admin`, one
 * follows the account's tier — and the server refuses to set either by hand,
 * with `23514` and a sentence saying which fact it follows. A switch that can
 * only ever fail is worse than no switch: that is this project's own position,
 * written into `tdg_admin_uid`'s comment and kept by `storeAnswers.ts`, which
 * draws no Manage Plan button where there is no Stripe subscription behind it
 * and says out loud why it is missing. So the derived rows get a HELD / NOT
 * HELD tag and a paragraph saying where the fact behind them is changed.
 *
 * The client is not deciding anything by doing that. `adminSetBadge` on a
 * derived badge still refuses in Postgres, whoever calls it and however; this
 * is only the difference between a page that offers a dead control and one
 * that explains itself.
 *
 * ## Where the history is
 *
 * There isn't one here, on purpose. Every grant, revoke and reason-edit writes
 * to the shared audit log through `tdg_admin_log`, so it lands in **This
 * Account's History** below and in the whole-project **Audit Log** tab, tagged
 * `badge-grant`, `badge-revoke` and `badge-note`. A second private trail on
 * this panel would be a fourth place the same fact is written down, and the
 * first one to disagree with the other three.
 *
 * ## Why no confirmation
 *
 * A badge is trivially reversible: the switch that granted it revokes it, the
 * write is idempotent in both directions, and the ledger keeps both halves. It
 * is the pack tiles' shape, not Delete Forever's. `TypeToConfirm` is for the
 * thing that cannot be undone.
 */

/** The catalogue's own name, or the id made readable when it sent none. */
function badgeName(b: AdminBadge): string {
  return (b.label ?? '').trim() || prettyId(b.id)
}

function badgeBlurb(b: AdminBadge): string {
  return (b.blurb ?? '').trim()
}

/** A catalogue row this site has no words for — see the panel's comment. */
function badgeUnnamed(b: AdminBadge): boolean {
  return !(b.label ?? '').trim() || !badgeBlurb(b)
}

const NO_COPY = 'The catalogue lists this badge but sent no description with it.'

function BadgesPanel({ account: a, badges, badgesState, badgesError, run, busy }: Props) {
  const [note, setNote] = useState('')

  // A reason typed about one person must not follow you to the next one.
  useEffect(() => setNote(''), [a.user_id])

  const typed = note.trim()
  const ready = badgesState === 'ready'
  const held = badges.filter((b) => b.held)
  const grantable = badges.filter((b) => !b.derived)
  const awarded = grantable.filter((b) => b.held)
  const derived = badges.filter((b) => b.derived)
  const unnamed = badges.filter(badgeUnnamed)

  const setBadge = (b: AdminBadge, on: boolean) =>
    run(`badge:${b.id}`, `${badgeName(b)} ${on ? 'granted' : 'revoked'}.`, async () => {
      await adminSetBadge(a.user_id, b.id, on, on ? typed : undefined)
      // Cleared only on the way back from a grant that actually landed. A
      // reason left sitting in the box would attach itself, silently and
      // wrongly, to whichever badge you switched on next.
      if (on) setNote('')
    })

  /*
   * Re-sending a badge that is already on, with a different reason, is how the
   * server edits a note: it updates the note alone and leaves `granted_at` and
   * `granted_by` where they were, and logs it as `badge-note`. Worth reaching,
   * because the alternative a developer would otherwise find is revoking and
   * re-granting — which moves the day the badge was awarded and writes two
   * rows into the ledger to fix a typo.
   *
   * Offered only when there is something to write, so it can never be a button
   * that empties a reason somebody wrote: the box starts empty on every
   * account, and an empty box means "no change", not "clear it".
   */
  const saveNote = (b: AdminBadge) =>
    run(`badge-note:${b.id}`, `Reason saved on ${badgeName(b)}.`, async () => {
      await adminSetBadge(a.user_id, b.id, true, typed)
      setNote('')
    })

  return (
    <Panel
      title="Badges"
      what="One global mark on the account, true in every TDG app at once — not per app and not per device. The list is the server's, so a badge added there shows up here with nothing changed on this page."
      writes="public.tdg_account_badges"
      terms={[
        ...badges.map((b) => `${b.id} ${badgeName(b)} ${badgeBlurb(b)} ${b.note ?? ''}`),
        'badge badges award grant revoke mark',
      ]}
      right={
        badgesState === 'loading' ? (
          <Tag>READING</Tag>
        ) : badgesState === 'error' ? (
          <Tag tone="bad">UNREADABLE</Tag>
        ) : held.length ? (
          <Tag tone="ok">{held.length} HELD</Tag>
        ) : (
          // Not "0 HELD". An account with no badges is a normal account, and a
          // zero in a summary tag reads as a number that went wrong.
          <Tag>NONE</Tag>
        )
      }
    >
      <div className="dev__badges">
        {badgesState === 'loading' && (
          <>
            <p className="dev__panel-quiet">Reading this account's badges…</p>
            {/* One placeholder per row the last answer had. The catalogue is
                the same for every account, so from the second account onward
                this count is exactly right and the panel does not reflow when
                the real rows land — the trick the Overview tiles use. On the
                very first read there is nothing to guess from, which is what
                the min-height on .dev__badges is for. */}
            {badges.length > 0 && (
              <div className="dev__badge-list" aria-hidden="true">
                {badges.map((b) => (
                  <div key={b.id} className="dev__badge-skeleton" />
                ))}
              </div>
            )}
          </>
        )}

        {badgesState === 'error' && (
          <p className="dev__warn">
            {/* The server's own sentence, whole. It is written to be read, and
                a message of ours over the top of it would be this page
                guessing at something it was already told. */}
            <strong>{badgesError ?? "Couldn't read this account's badges."}</strong> Nothing has
            changed on the account, and nothing below has been switched. Press{' '}
            <strong>Refresh</strong> to ask again.
          </p>
        )}

        {ready && badges.length === 0 && (
          <p className="dev__warn">
            The catalogue came back with no badges in it at all, so there is nothing to award. That
            is <code className="dev__code">tdg_badge_catalog()</code> in tdg-core answering with an
            empty list — <strong>not</strong> this account holding none of them. Adding a badge is a
            migration; see <code className="dev__code">src/badges/README.md</code>.
          </p>
        )}

        {ready && badges.length > 0 && (
          <>
            <Field
              label="Reason (Optional)"
              htmlFor="dev-badge-note"
              hint={
                <>
                  Why this person got it — <em>found the DevFleet pane crash</em>. It goes on
                  whichever badge you switch on next, and it is <strong>not private</strong>: the
                  account it is about reads its own badges, notes included. The Reason box in
                  Standing &amp; Access is the one only a developer ever sees. Up to 200 characters.
                </>
              }
            >
              <TextInput
                id="dev-badge-note"
                value={note}
                onChange={setNote}
                maxLength={200}
                placeholder="e.g. found the DevFleet pane crash"
              />
            </Field>

            {grantable.length === 0 ? (
              <p className="dev__panel-quiet">
                Every badge in the catalogue is computed today, so there is nothing here to switch
                on by hand.
              </p>
            ) : (
              <div className="dev__badge-list">
                {grantable.map((b) => {
                  const current = (b.note ?? '').trim()
                  const canSaveNote = b.held && typed !== '' && typed !== current
                  return (
                    <div className="dev__badge" key={b.id}>
                      <Switch
                        checked={b.held}
                        busy={busy === `badge:${b.id}`}
                        onChange={(next) => setBadge(b, next)}
                        label={badgeName(b)}
                        hint={
                          <>
                            {badgeBlurb(b) || NO_COPY}
                            {b.held && (
                              <>
                                {' '}
                                <span className="dev__badge-since">
                                  Awarded {fmtDate(b.grantedAt)} · {fmtRelative(b.grantedAt)}
                                  {current ? ` · “${current}”` : ' · no reason written'}
                                </span>
                              </>
                            )}
                          </>
                        }
                      />
                      {canSaveNote && (
                        <div className="dev__badge-note">
                          <Button
                            busy={busy === `badge-note:${b.id}`}
                            onClick={() => saveNote(b)}
                            title="Writes the reason above onto a badge this account already has, without moving the day it was awarded."
                          >
                            Save Note
                          </Button>
                          <span className="dev__badge-note-copy">
                            {current ? (
                              <>
                                Replaces “{current}” on {badgeName(b)}. The date it was awarded and
                                who awarded it stay as they are.
                              </>
                            ) : (
                              <>
                                {badgeName(b)} was granted without a reason. This writes the one
                                above onto it.
                              </>
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {grantable.length > 0 && awarded.length === 0 && (
              <p className="dev__panel-quiet">
                None of these has been awarded to this account yet. Switching one on is the whole
                grant: it takes effect in every TDG app the next time that app reads.
              </p>
            )}

            {derived.length > 0 && (
              <>
                <hr className="dev__rule" />
                <h4 className="dev__sub">Computed, Not Granted</h4>
                <p className="dev__hint">
                  These follow something TDG Core already knows about the account, so there is no
                  switch to press: change the fact and the badge follows on the next read. Asking
                  for one by hand is refused, and{' '}
                  <strong>the refusal names the fact it follows</strong> — which is where that
                  sentence belongs, because nothing on this page keeps a list of which badge is tied
                  to what. Today the two facts are the Developer permission and the TDG Core tier,
                  both set in panels directly above this one.
                </p>
                <div className="dev__badge-list">
                  {derived.map((b) => (
                    <div className="dev__badge-fixed" key={b.id} data-held={b.held || undefined}>
                      <span className="dev__badge-fixed-text">
                        <span className="dev__badge-fixed-name">{badgeName(b)}</span>
                        <span className="dev__hint dev__badge-fixed-what">
                          {badgeBlurb(b) || NO_COPY}
                        </span>
                      </span>
                      <Tag tone={b.held ? 'ok' : 'plain'}>{b.held ? 'HELD' : 'NOT HELD'}</Tag>
                    </div>
                  ))}
                </div>
              </>
            )}

            {unnamed.length > 0 && (
              <p className="dev__warn">
                {unnamed.length === 1 ? 'One badge above came' : `${unnamed.length} badges above came`}{' '}
                back from the catalogue without a name, or without a line of copy:{' '}
                {unnamed.map((b) => b.id).join(', ')}.{' '}
                {unnamed.length === 1 ? 'It is drawn from its id' : 'They are drawn from their ids'}{' '}
                rather than left out, because a badge this site cannot name is still a badge it can
                award — and a list that quietly drops what it cannot read is a list you cannot trust
                about anything else on it either. Fill the label and the blurb in{' '}
                <code className="dev__code">tdg_badge_catalog()</code> and every TDG surface starts
                saying the same words at once, with nothing changed here.
              </p>
            )}
          </>
        )}
      </div>
    </Panel>
  )
}

/* ── every app, in one fold ────────────────────────────────────────────── */

/**
 * What this account holds in each TDG app, behind one heading.
 *
 * ## Why it is a fold and not seven panels
 *
 * It used to be seven: Makullveny, then one Store panel per app the console
 * discovered, and the list grows by one every time a product ships. They sat in
 * the middle of the account, so Standing & Access — the panel you reach for
 * when somebody reports abuse — was a screen and a half of pack switches below
 * the fold. Shut, this is one row. Open, every app is inside it with its own
 * fold, exactly as it was, and Expand All still reaches all of them because
 * `sections.tsx` holds one open set for the whole page rather than a flag per
 * panel.
 *
 * ## The search still finds what is inside it
 *
 * A `Panel` that does not match the query removes itself, and a parent removing
 * itself would take matching children with it — so this one counts its
 * children's own haystacks and reports that as `matchCount`. A search for a
 * pack id opens this fold and prints how many apps inside it matched, which is
 * also the answer to "is it worth opening".
 *
 * ## What a shut fold says
 *
 * How many of the apps this account has anything in. Never a bare zero while an
 * answer is still missing: an app whose holdings did not come back makes the
 * tag say so instead, for the same reason `StorePanel` refuses to draw an
 * unreported holding as "Not owned".
 */
function AppsPanel({ stores, ...props }: Props & { stores: DevStoreApp[] }) {
  const a = props.account
  const search = useSearch()

  const makHay = hay(
    'makullveny',
    a.mak_tier,
    a.mak_status,
    a.mak_themes,
    a.mak_stripe_customer_id,
    a.mak_candle_purchased_at ? 'candle bundle' : '',
    a.mak_support_badge_at ? 'supporter badge' : '',
    'theme market plan',
  )
  const storeHays = stores.map((app) =>
    hay(
      app.id,
      app.title,
      ...app.packs.map((pk) => `${pk.id} ${pk.name}`),
      'pack store grant revoke',
    ),
  )

  const matchCount = search.active
    ? [makHay, ...storeHays].filter((h) => search.matches(h)).length
    : undefined

  const holdsMak =
    a.mak_tier !== 'free' || a.mak_candle_purchased_at != null || a.mak_themes.length > 0
  const held = stores.filter((app) => app.ownedCount > 0).length + (holdsMak ? 1 : 0)
  const total = stores.length + 1
  const anyUnknown = stores.some((app) => app.serverState !== 'absent' && !app.holdingsKnown)
  const blocks = revocationsOf(a)
  // Blocks that landed on no panel inside this fold. Normally none — every
  // revoked app grows one — and drawn anyway, because the day there IS one is
  // the day a block exists that nothing on this page can lift.
  const orphans = orphanRevocations(a, stores)

  return (
    <Panel
      id="apps"
      title="Apps"
      what="What this account holds in each TDG app: Makullveny's plan, bundle and themes, and every pack Store. Each app opens on its own inside."
      matchCount={matchCount}
      terms={[blocks.length ? 'revoked revocation blocked' : '']}
      right={
        <span className="dev__tags">
          {/* A block is the thing you would most want to know from a shut fold,
              so it is said before the count rather than found inside. */}
          {blocks.length > 0 && (
            <Tag tone="bad">
              {blocks.length} REVOKED
            </Tag>
          )}
          {anyUnknown ? (
            // A shut fold must not summarise a missing answer as a number.
            <Tag tone="warn">NO ANSWER</Tag>
          ) : (
            <Tag tone={held ? 'ok' : 'plain'}>
              {held} OF {total} APPS
            </Tag>
          )}
        </span>
      }
    >
      <MakullvenyPanel {...props} />
      {stores.map((app) => (
        <StorePanel key={app.id} {...props} app={app} />
      ))}
      {orphans.length > 0 && (
        <p className="dev__warn">
          {orphans.length === 1 ? 'One product is' : `${orphans.length} products are`} revoked for
          this account under {orphans.length === 1 ? 'an id' : 'ids'} nothing above draws a panel
          for: {orphans.map((r) => `${r.app}:${r.pack}`).join(', ')}. The block is real and stands;
          there is simply no control here to lift it, which means it has to be lifted with{' '}
          <code className="dev__code">tdg_admin_set_revocation</code> directly. This is drawn rather
          than skipped because a block nobody can see is a block nobody can lift.
        </p>
      )}
    </Panel>
  )
}

/**
 * The sentence the Tell Them box starts with, from what is staged.
 *
 * One function for both ownership panels, because a message about somebody's
 * account has to read the same whichever panel it came from — and because the
 * two drifted the moment they were written separately: one turned `Plan →
 * Hearth` into words and the other lowercased it and left the arrow in, which
 * is a developer's shorthand sent to a customer.
 *
 * Title Case survives on purpose. The left of each line is a product or a
 * control by name — `Candle Bundle`, `Pro Export Pack` — and rule 7 keeps a
 * proper noun in its own form wherever it lands. It is only ever a STARTING
 * point: the box is editable, and the developer's own words are the reason the
 * tick box exists at all.
 */
function noticeFrom(product: string, changes: readonly string[], reason: string): string {
  if (changes.length === 0) return ''
  const said = changes.map((line) => line.replace(' → ', ' is now ')).join('; ')
  const why = reason.trim()
  return `We changed what your account has in ${product}: ${said}.${why ? ` ${why}` : ''}`
}

/* ── Makullveny ────────────────────────────────────────────────────────── */

/**
 * Makullveny stores two different facts and one of them is a MIRROR of the
 * other. This panel is the shape that came out of taking that seriously.
 *
 * ## The trap this replaced
 *
 * `mak_subscriptions` carries `tier` (free · candle · lantern · hearth) and
 * `candle_purchased_at`. The panel offered a dropdown for the first and a
 * switch for the second, with no relationship between them — so `candle`
 * appeared in a list of subscription rungs, looking exactly like the thing that
 * grants the bundle.
 *
 * It grants nothing. Makullveny's own `src/entitlements.js` unlocks every piece
 * of Candle content — the five marketplace themes, the Journal, the Scroll, the
 * raised capacity limits — on `candlePurchased || tier >= hearth`, and never on
 * `tier === 'candle'`. Its comment says why: Candle is a one-time purchase, and
 * ranking it inside TIER_ORDER would hand it to every Lantern subscriber
 * because lantern(2) > candle(1).
 *
 * There is a live row on this project with `tier = 'candle'` and no flag: an
 * account somebody believes they gave the bundle to, which has never had it.
 * That row is what this panel was rebuilt from.
 *
 * ## The shape now
 *
 * Two axes, one control each, and neither can produce that row.
 *
 * **Candle Bundle** is one switch over `tdg_admin_set_mak_candle`, which writes
 * the flag AND the tier mirror in one statement, the way the app's own Stripe
 * webhook writes them.
 *
 * **Plan** offers only the rungs that are actually rent — Free, Lantern, Hearth
 * — because `candle` is not a rung, it is how the ladder reports the bundle.
 * Saving a plan of Free with the bundle on writes `candle`, which is
 * `higherTier()` from the webhook, spelled out.
 *
 * **Standing** is only asked when there is a plan to have a standing, because
 * `free / past_due` is a sentence about nothing.
 *
 * ## What was still a lie, and is the reason for the block at the top
 *
 * All of the above was true and the panel still could not be read. Set the plan
 * to Hearth, press Save, and the Candle Bundle switch stayed off — correctly,
 * because the flag genuinely had not moved — while the account now had every
 * single thing the bundle grants, because Hearth clears the same gate. Two
 * controls, both honest about their own column, and between them a false
 * answer to the only question a developer is actually asking: *does this person
 * have Candle content?*
 *
 * So the panel now answers that question itself, first, out loud, computed with
 * Makullveny's own rule and nothing else — and the two controls stay exactly
 * what they were. **The theme tiles already did this** (`Unlocked by Hearth`
 * has been on them since the rebuild); what was missing was the same sentence
 * about the bundle those themes come in.
 *
 * ## Lantern is the one that surprises people, so it says so
 *
 * Read as a price list the tiers look cumulative, and the natural reading of
 * "Lantern, then Hearth" is that each contains what came before. Makullveny
 * does not do that: only **Hearth** clears the Candle gate. Lantern is a
 * subscription with its own features and it carries none of the bundle.
 *
 * That is a product decision, it is written down in `entitlements.js` beside
 * the rule, and this console is not the place to quietly disagree with it — a
 * page that said Lantern included the bundle would be lying about what the app
 * will actually do when that person opens it. So it is NAMED instead: a Lantern
 * account without the bundle gets a line saying it does not have Candle content
 * and that one press gives it to them. If the ladder is meant to be cumulative,
 * the change is one line of `entitlements.js` in the Makullveny repo, and this
 * panel starts agreeing with it the same day.
 *
 * ## One Save, because it was two writes that caused the report
 *
 * The bundle used to write the instant its switch moved, while the plan waited
 * for Save. Pressing one and then Save reads as one action and was two, in an
 * order nobody chose. Now both stage, `SaveBar` lists what is waiting in words,
 * and one press writes them — bundle first, because
 * `tdg_admin_set_mak_candle` moves the tier mirror and the subscription write
 * has to land on top of that rather than under it.
 */
function MakullvenyPanel({ account: a, catalog, run, busy }: Props) {
  const savedCandle = a.mak_candle_purchased_at != null

  /** The stored tier read as a PLAN: `candle` is the bundle's mirror, so the
   *  subscription behind it is Free. */
  const planOf = (tier: string) => (tier === 'lantern' || tier === 'hearth' ? tier : 'free')

  const [plan, setPlan] = useState(planOf(a.mak_tier))
  const [status, setStatus] = useState(a.mak_status)
  const [bundle, setBundle] = useState(savedCandle)
  const [reason, setReason] = useState('')

  const block = revocationsOf(a).find((r) => r.app === MAK_APP_ID) ?? null
  const [revoke, setRevoke] = useState(block != null)

  useEffect(() => {
    setPlan(planOf(a.mak_tier))
    setStatus(a.mak_status)
    setBundle(savedCandle)
    setRevoke(block != null)
    setReason('')
  }, [a.user_id, a.mak_tier, a.mak_status, savedCandle, block])

  /** What actually goes in the column: the plan, or the bundle's mirror under
   *  it. This is `higherTier(existing, 'candle')` from mak-stripe-webhook. */
  const tierToWrite = plan !== 'free' ? plan : bundle ? 'candle' : 'free'
  // No plan means no standing to be in, and the resting row every account
  // starts at is `active`. Writing anything else would be a status describing a
  // subscription that is not there.
  const statusToWrite = plan === 'free' ? 'active' : status

  const bundleMoved = bundle !== savedCandle
  const revokeMoved = revoke !== (block != null)

  /**
   * What Makullveny will actually unlock, computed with the app's own rule and
   * not with a second opinion about it.
   *
   * `src/entitlements.js`: `candlePurchased || hasMinimumTier(tier, 'hearth')`.
   * The mirror in the tier column is deliberately not consulted — that is the
   * whole point of the rule — so an account sitting on `tier = 'candle'` with
   * no flag reads as locked here, which is exactly what the app does to it.
   */
  const unlockedNow = savedCandle || a.mak_tier === 'hearth'
  const unlockedAfter = bundle || plan === 'hearth'
  const unlockedBy = bundle ? 'the Candle bundle' : plan === 'hearth' ? 'Hearth' : null

  /** The row the old two-control panel could produce: the ladder says Candle,
   *  the flag says no, and the app grants nothing. */
  const brokenMirror = a.mak_tier === 'candle' && !savedCandle

  const PLANS = [
    { value: 'free', label: 'No subscription' },
    ...catalog.mak_tiers
      .filter((t) => t === 'lantern' || t === 'hearth')
      .map((t) => ({ value: t, label: prettyId(t) })),
  ]

  const changes: string[] = [
    ...(bundleMoved ? [bundle ? 'Candle Bundle → owned' : 'Candle Bundle → not owned'] : []),
    ...(tierToWrite !== a.mak_tier ? [`Plan → ${prettyId(tierToWrite)}`] : []),
    ...(statusToWrite !== a.mak_status ? [`Standing → ${statusToWrite}`] : []),
    ...(revokeMoved ? [revoke ? 'Makullveny → revoked' : 'Makullveny → no longer revoked'] : []),
  ]

  const notice = useSaveNotice(
    noticeFrom('Makullveny', changes, reason),
    `${a.user_id}:mak:${a.mak_tier}:${a.mak_status}:${savedCandle}:${block != null}`,
  )

  const save = () =>
    run('mak', `Makullveny saved: ${changes.length} change${changes.length === 1 ? '' : 's'}.`, async () => {
      // Bundle first. `tdg_admin_set_mak_candle` writes the flag AND the tier
      // mirror, so a subscription write has to land on top of it — the other
      // order would put the mirror back over the plan that was just chosen.
      if (bundleMoved) await api.setMakCandle(a.user_id, bundle)
      // What the row says after that press, so a second write is only asked for
      // when the ladder still has somewhere to go. Without this, granting the
      // bundle on a free account wrote `candle` twice and put two lines in
      // Makullveny's ledger for one decision.
      const tierAfterCandle = !bundleMoved
        ? a.mak_tier
        : bundle
          ? a.mak_tier === 'lantern' || a.mak_tier === 'hearth'
            ? a.mak_tier
            : 'candle'
          : a.mak_tier === 'candle'
            ? 'free'
            : a.mak_tier
      const statusAfterCandle =
        bundleMoved && bundle && a.mak_tier !== 'lantern' && a.mak_tier !== 'hearth'
          ? 'active'
          : a.mak_status
      if (tierToWrite !== tierAfterCandle || statusToWrite !== statusAfterCandle) {
        await api.setMakSubscription(a.user_id, tierToWrite, statusToWrite)
      }
      if (revokeMoved) {
        await api.setRevocation(a.user_id, MAK_APP_ID, '*', revoke, reason.trim() || null)
      }
      if (notice.tell && notice.body.trim()) {
        await api.notify(a.user_id, MAK_APP_ID, 'Your Makullveny Account Changed', notice.body.trim())
      }
    })

  return (
    <Panel
      title="Makullveny"
      what="Two separate things: a subscription the account rents, and the Candle bundle it owns outright. The app reads them on different axes, so they are two controls and neither implies the other."
      writes="public.mak_subscriptions"
      terms={[
        a.mak_tier,
        a.mak_status,
        a.mak_themes,
        a.mak_stripe_customer_id,
        savedCandle ? 'candle bundle' : '',
        a.mak_support_badge_at ? 'supporter badge' : '',
        block ? 'revoked revocation blocked' : '',
        'theme market',
      ]}
      right={
        <span className="dev__tags">
          {block && <Tag tone="bad">REVOKED</Tag>}
          <Tag tone={a.mak_tier === 'free' ? 'plain' : 'ok'}>{a.mak_tier.toUpperCase()}</Tag>
        </span>
      }
    >
      {/* The answer to the question the two controls below cannot give between
          them, first, before anything can be misread. See the header. */}
      <p className="dev__verdict" data-tone={unlockedNow ? 'ok' : 'plain'}>
        <strong>Candle content{unlockedNow ? ' is unlocked' : ' is locked'}</strong> — the five
        marketplace themes, the Journal, the Scroll and the raised capacity limits.{' '}
        {unlockedNow
          ? `Makullveny unlocks all of it on ${savedCandle ? 'the Candle bundle below' : 'Hearth'}, because its own rule is candlePurchased || tier >= hearth.`
          : 'Makullveny gates all of it on candlePurchased || tier >= hearth, and this account clears neither.'}
      </p>

      {block && (
        <p className="dev__warn">
          <strong>Makullveny is revoked for this account.</strong>{' '}
          {block.reason ? `Reason given: ${block.reason} ` : 'No reason was recorded. '}
          Set on {fmtDate(block.at)}. Makullveny keeps no{' '}
          <code className="dev__code">makullveny_entitlements</code> table, so this block took
          nothing away by itself — the tier and the themes below are still on the row. It is the
          standing answer that the account may not have the app, it shows on this site&apos;s Store,
          and Makullveny itself refuses once it reads{' '}
          <code className="dev__code">tdg_my_revocations()</code>.
        </p>
      )}

      {brokenMirror && (
        <p className="dev__warn">
          This account&apos;s plan says <code className="dev__code">candle</code> but the Candle
          bundle is off, so Makullveny grants it nothing — no themes, no Journal, no Scroll, no
          raised limits. The app gates all of those on{' '}
          <code className="dev__code">candle_purchased_at</code>, never on the tier. Turning{' '}
          <strong>Candle Bundle</strong> on below fixes the row; the panel can no longer create it.
        </p>
      )}

      <Switch
        checked={bundle}
        onChange={setBundle}
        label="Candle Bundle"
        hint={
          <>
            Bought once and kept: every marketplace theme, the Journal, the Scroll and the raised
            capacity limits. Saving writes both the purchase and the tier that mirrors it, the same
            pair a real Candle checkout writes. It deliberately leaves the Supporter Badge alone — a
            real purchase sets that too, and a hand grant quietly moving a second switch is what
            this panel was rebuilt to stop.
            {plan === 'hearth' && (
              <>
                {' '}
                <strong>Hearth already unlocks all of it</strong>, bundle or no bundle, so switching
                this off will not take a single theme away from this account.
              </>
            )}
          </>
        }
      />

      {plan === 'lantern' && !bundle && (
        <p className="dev__warn">
          <strong>Lantern does not include the Candle bundle.</strong> Makullveny unlocks Candle
          content on <code className="dev__code">candlePurchased || tier &gt;= hearth</code> and
          nothing else, so a Lantern subscriber without the switch above has no marketplace themes,
          no Journal, no Scroll and the ordinary capacity limits. Its own comment says why: ranking
          a one-time purchase inside <code className="dev__code">TIER_ORDER</code> would hand it to
          every Lantern subscriber because <code className="dev__code">lantern(2) &gt; candle(1)</code>.
          If Lantern is meant to carry it, that is a change in the Makullveny repo — this page will
          not say it does while the app says it does not. Meanwhile, one press above gives it to
          them.
        </p>
      )}

      <hr className="dev__rule" />

      <div className="dev__grid2">
        <Field
          label="Plan"
          hint="What the account RENTS, cheapest first: No subscription → Lantern → Hearth. Candle is not on this list and is not missing from it — it is bought once, not rented, so it is the switch above. Only Hearth carries what the bundle carries; Lantern does not."
        >
          <Select value={plan} onChange={setPlan} options={PLANS} />
        </Field>
        <Field
          label="Standing"
          hint={
            plan === 'free'
              ? 'Only asked when there is a plan to be standing in. With no subscription this is written as active, which is where every account rests.'
              : "Mirrors Stripe's own subscription statuses. Only active actually unlocks the plan."
          }
        >
          <Select
            value={statusToWrite}
            onChange={setStatus}
            disabled={plan === 'free'}
            options={catalog.statuses.map((st) => ({ value: st, label: st }))}
          />
        </Field>
      </div>

      {plan === 'free' && bundle && (
        <p className="dev__panel-quiet">
          With no subscription and the bundle owned, the tier column is written as{' '}
          <code className="dev__code">candle</code>. That is the mirror, not a plan: it is what the
          app&apos;s own webhook writes, and what its ladder reports the bundle as.
        </p>
      )}

      {changes.length > 0 && unlockedAfter !== unlockedNow && (
        <p className="dev__verdict" data-tone={unlockedAfter ? 'ok' : 'warn'}>
          After saving, Candle content will be{' '}
          <strong>{unlockedAfter ? 'unlocked' : 'locked'}</strong>
          {unlockedAfter && unlockedBy ? ` by ${unlockedBy}` : ''}.
        </p>
      )}

      <Switch
        checked={revoke}
        onChange={setRevoke}
        tone="danger"
        label="Revoke Makullveny"
        hint="The standing answer that this account may not have Makullveny and may not buy it. It is not the same as setting the plan to No subscription: that offers to sell it again, and this does not. The reason below is shown to them."
      />

      {(revoke || reason) && (
        <Field
          label="Reason"
          hint="Sentence case, written for the person it is about — they see it on their own Store card and in the app. Left blank, the block still stands and simply says nothing about why."
        >
          <TextInput
            value={reason}
            onChange={setReason}
            maxLength={200}
            placeholder="Refunded after a chargeback."
          />
        </Field>
      )}

      <SaveBar
        changes={changes}
        onSave={save}
        busy={busy === 'mak'}
        notice={notice}
        noticeTo="Makullveny"
        nothingLabel="Nothing to save. The plan, the standing and the bundle all match the account."
      />

      <hr className="dev__rule" />

      <Switch
        checked={a.mak_support_badge_at != null}
        busy={busy === 'badge'}
        onChange={(next) =>
          run('badge', next ? 'Support badge granted.' : 'Support badge removed.', () =>
            api.setMakFlag(a.user_id, 'support_badge', next),
          )
        }
        label="Supporter Badge"
        hint="The permanent 'supported Mak' marker. Normally set once by a real payment and never cleared, even on a cancel. One fact, one press: it does not wait for Save."
      />

      <Field
        label="Individual Themes"
        hint="Themes bought one at a time from the Market page. This switch is that purchase and nothing else: a theme can also be unlocked by the Candle bundle or by Hearth, and where it is, the tile says which — the same four answers the app's own themeEntitlement gives. One fact each, so they write on the press rather than waiting for Save."
      >
        <div className="dev__tiles">
          {catalog.mak_themes.map((theme) => (
            <OwnTile
              key={theme}
              name={prettyId(theme)}
              owned={a.mak_themes.includes(theme)}
              busy={busy === `theme:${theme}`}
              // Only when the tile would otherwise be misread. A theme bought
              // outright says "Owned" already; one the account has by another
              // door needs to say which door, or switching it off looks like it
              // will take the theme away, and it will not.
              //
              // Read off the SAVED row, never the staged one: it is a statement
              // about what is true now, and a tile that said "Unlocked by
              // Hearth" because somebody had picked Hearth and not yet saved
              // would be the same kind of lie this panel was rebuilt to remove.
              note={
                a.mak_themes.includes(theme)
                  ? undefined
                  : savedCandle
                    ? 'Unlocked by Candle'
                    : a.mak_tier === 'hearth'
                      ? 'Unlocked by Hearth'
                      : undefined
              }
              onChange={(next) =>
                run(
                  `theme:${theme}`,
                  `${prettyId(theme)} ${next ? 'granted' : 'revoked'}.`,
                  () => api.setMakTheme(a.user_id, theme, next),
                )
              }
            />
          ))}
        </div>
      </Field>

      <div className="dev__facts dev__facts--tight">
        <Fact label="Stripe customer" value={a.mak_stripe_customer_id ?? 'none (never paid)'} mono />
        <Fact label="Candle bought" value={fmtDate(a.mak_candle_purchased_at)} />
        <Fact label="Period ends" value={fmtDate(a.mak_period_end)} />
        <Fact label="Cancels at period end" value={a.mak_cancel_at_period_end ? 'yes' : 'no'} />
      </div>
    </Panel>
  )
}

/* ── one pack Store, for whichever app this is ─────────────────────────── */

/**
 * The Store panel, drawn for every app the console found rather than for two
 * apps named here.
 *
 * `apps.ts` does the merging and the reasoning; this renders the answer. What
 * it adds is that **every way the two sources can disagree has a face**. An app
 * the server knows and the shop does not says why it has no prices. An app the
 * shop sells and the server cannot record is an alarm with its switches turned
 * off, because offering a grant the database has nowhere to write is the one
 * thing a console must never do. A pack sitting on an account that neither list
 * mentions is a real tile you can switch off, not a sentence about a problem.
 *
 * A panel that renders nothing for an unrecognised app would be the old bug in
 * a new costume: silence reading as "there is nothing here".
 *
 * ## And a fourth thing, which is the one that bit
 *
 * **Not being told is its own state, and it is drawn as one.** This panel
 * shipped able to say only "listed" or "no table", so a catalog that had not
 * arrived — a read that failed, a payload whose shape this build does not
 * recognise — made every app render as a red alarm claiming its table does not
 * exist, with the switches turned off. A page that had been told nothing was
 * therefore stating something false, in the most alarming way it had, while
 * disabling the controls that would have disproved it.
 *
 * The same trap one level down: a `store` object with no entry for this app is
 * an answer that never came, not an account that owns nothing. Drawing it as
 * "Not owned" tells somebody they do not have what they paid for, which is the
 * exact mistake `store/useOwnedPacks.ts` refuses to make on the shop side, and
 * this page has no more right to make it than the shop does.
 *
 * So: `absent` is an alarm, `unknown` says it does not know and keeps its
 * switches live — the server is the authority and refuses in a sentence written
 * for a human — and holdings nobody reported are never rendered as tiles.
 *
 * ## Revoked is a fifth answer, and it is not "not owned"
 *
 * `Not Owned` and `Revoked` look identical from the account's side and are
 * opposite decisions: the first ends with the shop offering to sell the pack,
 * the second is the standing answer that this account may not have it and may
 * not buy it. So it is a value of the same picker rather than a switch beside
 * it — see `grantShapes.ts` — and lifting it offers `Restore What Was Taken`,
 * because the block carries the exact grant it removed and the server can put
 * that back rather than making somebody guess at it.
 *
 * ## Why this panel stages and the rest of the page does not
 *
 * Every other switch here writes on the press, because it changes one fact and
 * the result is visible. Ownership is not one fact: a person is set up with a
 * plan, a standing and two or three packs, and written one press at a time
 * those land as separate events, in an order nobody chose, each with its own
 * ledger row and its own moment where the account was in a state that was never
 * meant to exist. So the pickers stage, `SaveBar` says what is waiting in
 * words, and one press writes the lot — with the tick box that tells the person
 * what we did, on the same press, because a message about a change is part of
 * making it and not an afterthought.
 */
function StorePanel({ account: a, run, busy, app }: Props & { app: DevStoreApp }) {
  const entry = a.store?.[app.id]
  const customer = entry?.stripe_customer_id ?? null
  // A pack is only STRAY if there was something for it to be missing from. An
  // app that publishes no pack list and is not in the shop has no list to fall
  // off, so its packs are simply its packs — see `hasList` in apps.ts.
  const strays =
    app.hasList || app.inShop ? app.packs.filter((p) => !p.onServer && !p.inShop) : []

  const absent = app.serverState === 'absent'
  const unknown = app.serverState === 'unknown'
  // Holdings are only "missing" when there was an answer to expect. An app the
  // server says does not exist has no holdings to report, and saying so twice
  // buries the one line that matters.
  const holdingsMissing = !absent && !app.holdingsKnown
  /** Packs the shop rents rather than sells outright, held or not. It is what
   *  decides whether the note about hand-made subscriptions is worth printing. */
  const rentable = app.packs.filter((pack) => pack.supportsSubscriptionStates)

  /** What each pack is RIGHT NOW, before anything was staged over it. */
  const current = useMemo(() => {
    const out: Record<string, HoldingId | null> = {}
    for (const pack of app.packs) {
      out[pack.id] = holdingOf(
        pack.owned,
        pack.grant,
        pack.supportsSubscriptionStates,
        pack.revoked != null,
      )
    }
    return out
  }, [app.packs])

  const [draft, setDraft] = useState<Record<string, HoldingId | null>>(current)
  const [revokeApp, setRevokeApp] = useState(app.revoked != null)
  const [reason, setReason] = useState('')

  /*
   * The staged edits belong to ONE account's view of ONE app, and both of those
   * change under the panel: clicking the next person, and a re-read landing
   * after somebody else's write. Keyed on what the server last said rather than
   * on the account id alone, so a refresh that changes nothing leaves a
   * half-made decision alone and one that changes something does not leave a
   * stale draft sitting on top of it.
   */
  const serverKey = `${a.user_id}:${app.id}:${JSON.stringify(current)}:${app.revoked?.at ?? ''}`
  useEffect(() => {
    setDraft(current)
    setRevokeApp(app.revoked != null)
    setReason('')
    // `current` is derived from the same read `serverKey` fingerprints, so the
    // key alone is the honest dependency — listing `current` too would reset
    // the draft on every render that rebuilt an identical object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverKey])

  const labelOf = (pack: DevStorePack, id: HoldingId | null) =>
    holdingsFor(pack.supportsSubscriptionStates, pack.revoked != null).find((h) => h.id === id)
      ?.label ?? 'Unrecognised shape'

  const appRevokeMoved = revokeApp !== (app.revoked != null)
  // While the whole app is blocked every picker is disabled and every draft
  // value equals its current one, so this is empty on its own rather than by a
  // special case — which is what keeps a lift-and-then-edit save from needing
  // one order of operations in the UI and a different one in `save`.
  const packMoves = app.packs.filter((pack) => draft[pack.id] !== current[pack.id])

  const changes: string[] = [
    ...(appRevokeMoved
      ? [revokeApp ? `${app.title} → revoked, all of it` : `${app.title} → no longer revoked`]
      : []),
    ...packMoves.map((pack) => `${pack.name} → ${labelOf(pack, draft[pack.id])}`),
  ]

  const notice = useSaveNotice(noticeFrom(app.title, changes, reason), serverKey)

  const wantsReason =
    revokeApp !== (app.revoked != null) && revokeApp
      ? true
      : packMoves.some((pack) => draft[pack.id] === 'revoked')

  /**
   * One press, in the order the writes actually have to happen.
   *
   * Lifting the app-level block comes FIRST, because the server refuses a
   * pack-level revocation while the whole app is blocked — and putting one on
   * comes LAST, because it captures everything the packs are holding at the
   * moment it lands.
   *
   * `tdg_admin_set_pack_grant` writes the grant whether or not the account
   * already held the pack — a BEFORE trigger derives `owned_packs` from it
   * through `<app>_packs_in_force()` — so Not Owned straight to Subscribed is
   * one call, not a grant followed by a correction.
   */
  const save = () =>
    run(
      `store:${app.id}`,
      `${app.title}: ${changes.length} change${changes.length === 1 ? '' : 's'} saved.`,
      async () => {
        const why = reason.trim() || null

        if (appRevokeMoved && !revokeApp) {
          await api.setRevocation(a.user_id, app.id, '*', false)
        }

        for (const pack of packMoves) {
          const next = draft[pack.id]
          const wasRevoked = pack.revoked != null && app.revoked == null

          if (next === 'revoked') {
            await api.setRevocation(a.user_id, app.id, pack.id, true, why)
            continue
          }
          if (wasRevoked) {
            // Puts back exactly what the block took, dates and `since` included.
            await api.setRevocation(a.user_id, app.id, pack.id, false)
            // `Restore What Was Taken` IS that call and nothing more, so there
            // is nothing left to write. Any other choice is a decision on top
            // of the recovery, and gets written on top of it.
            if (next === 'restore') continue
          }
          if (next === 'none') {
            await api.setPack(a.user_id, app.id, pack.id, false)
            continue
          }
          // An app whose table has no `grants` column can only hold a pack
          // outright, and its picker only ever offered those two states.
          if (!app.hasGrants) {
            await api.setPack(a.user_id, app.id, pack.id, true)
            continue
          }
          const shape = GRANT_SHAPES.find((sh) => sh.id === next)
          if (!shape) continue
          await api.setPackGrant(a.user_id, app.id, pack.id, grantArgsFor(shape))
        }

        if (appRevokeMoved && revokeApp) {
          await api.setRevocation(a.user_id, app.id, '*', true, why)
        }

        if (notice.tell && notice.body.trim()) {
          await api.notify(
            a.user_id,
            app.id,
            `Your ${app.title} Account Changed`,
            notice.body.trim(),
          )
        }
      },
    )

  const what = absent
    ? `The site sells ${app.title}'s packs, but TDG Core has no table to record them in, so nothing here can be granted and a real payment would land nowhere.`
    : unknown
      ? `The console could not read TDG Core's list of apps, so it cannot say whether ${app.title} is registered or what this account holds. The switches still work: the server decides, and it says so in words if it disagrees.`
      : holdingsMissing
        ? `The server did not report what this account holds in ${app.title}, so this panel is not showing ownership rather than showing it as empty.`
        : !app.inShop
          ? `Store packs for ${app.title}. The console found this app by its entitlements table; the site's shop does not sell it yet, so these packs have names made from their ids and no prices.`
          : app.hasGrants
            ? 'Store packs. Choose how each one is held, or put it out of reach entirely, and press Save. A grant and a revoke both land in the same ledger a real Stripe payment does.'
            : 'One-time Store packs. Choose whether each is held, or put it out of reach entirely, and press Save. A grant and a revoke both land in the same ledger a real Stripe payment does.'

  return (
    <Panel
      // Keyed on the app id, not on the title `Panel` would otherwise default
      // to. The title comes from the shop and can be rewritten there; the id
      // is what the database calls this app. A section whose id moves with its
      // heading loses which-sections-are-open across the rename, and this page
      // carries that set between accounts and through a reload.
      id={`store:${app.id}`}
      title={`${app.title} Store`}
      what={what}
      writes={app.entitlementsTable ? `public.${app.entitlementsTable}` : undefined}
      // Danger is for something that IS wrong. Not knowing is not an emergency,
      // and painting it as one is how a reader learns to ignore the colour.
      tone={absent ? 'danger' : 'plain'}
      terms={[
        app.id,
        app.title,
        ...app.packs.map((p) => `${p.id} ${p.name}`),
        customer,
        app.revoked || app.revokedCount ? 'revoked revocation blocked' : '',
        'pack store grant revoke',
      ]}
      right={
        <span className="dev__tags">
          {app.revoked ? (
            <Tag tone="bad">REVOKED</Tag>
          ) : (
            app.revokedCount > 0 && <Tag tone="bad">{app.revokedCount} REVOKED</Tag>
          )}
          {absent ? (
            <Tag tone="bad">NO TABLE</Tag>
          ) : unknown || holdingsMissing ? (
            // A shut panel must not summarise an unknown as a number. "0 OWNED"
            // is the sentence this whole change exists to stop the page saying.
            <Tag tone="warn">NO ANSWER</Tag>
          ) : (
            <Tag tone={app.ownedCount ? 'ok' : 'plain'}>{app.ownedCount} OWNED</Tag>
          )}
        </span>
      }
    >
      {absent && (
        <p className="dev__warn">
          <code className="dev__code">
            public.{app.entitlementsTable ?? `${app.id}_entitlements`}
          </code>{' '}
          does not exist on tdg-core, so this app is not registered and no switch below would take.
          Create that table — <code className="dev__code">user_id uuid</code>,{' '}
          <code className="dev__code">owned_packs text[]</code>,{' '}
          <code className="dev__code">stripe_customer_id text</code> — and this panel starts
          working, with no other change anywhere.
        </p>
      )}

      {unknown && (
        <p className="dev__warn">
          The app list did not come back, so the console cannot say whether this app is registered.
          It is <strong>not</strong> saying the table is missing, and it is not saying this account
          owns nothing: it does not know either. Press <strong>Refresh</strong> to ask again. If it
          keeps happening after a reload, this page is older than the database it is talking to.
        </p>
      )}

      {holdingsMissing && !unknown && (
        <p className="dev__warn">
          The account came back without an entry for <code className="dev__code">{app.id}</code>, so
          what it holds here is unknown. Ownership is left blank rather than drawn as empty, because
          "Not owned" would be this page telling somebody they do not have what they paid for. Press{' '}
          <strong>Refresh</strong>; if it persists, this page is older than the database.
        </p>
      )}

      {app.revoked && (
        <p className="dev__warn">
          <strong>The whole of {app.title} is revoked for this account.</strong>{' '}
          {app.revoked.reason ? `Reason given: ${app.revoked.reason} ` : 'No reason was recorded. '}
          Set on {fmtDate(app.revoked.at)}.{' '}
          {app.revoked.held
            ? 'Everything the account held here came off the row and is kept on the block, so lifting it puts back exactly what was taken.'
            : 'It held nothing here at the time, so nothing came off the row.'}{' '}
          Its packs cannot be granted or blocked individually while this stands — lift it below
          first.
        </p>
      )}

      {/* Tiles ARE the ownership claim, so they are only drawn when there is an
          answer to draw. The absent case keeps them, dead, so the panel can
          still say WHAT the shop sells while its alarm explains why none of it
          can be granted. */}
      {!app.holdingsKnown && !absent ? null : app.packs.length === 0 ? (
        <p className="dev__panel-quiet">
          No packs yet. This app's list comes from{' '}
          <code className="dev__code">public.{app.id}_known_packs()</code>, and it has none, so the
          console will accept any well-formed pack id the moment there is one to grant.
        </p>
      ) : (
        <div className="dev__holds">
          {app.packs.map((pack) => {
            const revoked = pack.revoked != null
            // What THIS pack can be. A one-time pack is offered the two states
            // it has; a rented one is offered the six the Store can draw. Not
            // Owned is the first entry of the same list rather than a separate
            // switch, so there is never a press that exists only to unlock the
            // control you actually wanted — and Revoked is the last, because it
            // is the one answer that is about permission rather than ownership.
            const states = holdingsFor(pack.supportsSubscriptionStates, revoked)
            const value = draft[pack.id] ?? current[pack.id]
            const chosen = states.find((h) => h.id === value)
            const staged = value !== current[pack.id]
            return (
              <HoldingTile
                key={pack.id}
                name={pack.name}
                disabled={absent || app.revoked != null}
                staged={staged}
                // Short, and only when it says something. A note repeating what
                // every tile would say is a note nobody reads, which is how the
                // one saying `ends 23 Sep` gets missed. The state's own label
                // says a pack is rented; `grantNote` adds the date it cannot.
                note={
                  revoked
                    ? `blocked ${fmtRelative(pack.revoked!.at)}`
                    : (grantNote(pack.grant) ??
                      (!pack.inShop && app.inShop ? 'not sold' : (pack.price ?? undefined)))
                }
                value={value ?? ''}
                options={[
                  ...(current[pack.id] === null
                    ? [{ value: '', label: 'Unrecognised shape' }]
                    : []),
                  ...states.map((h) => ({ value: h.id, label: h.label })),
                ]}
                what={
                  revoked && pack.revoked?.reason && value === 'revoked'
                    ? `${chosen?.what ?? ''} Reason given: ${pack.revoked.reason}`
                    : (chosen?.what ??
                      'Held in a shape this site has no reading for, so no state matches it. Choosing one replaces it.')
                }
                onChange={(next) =>
                  setDraft((d) => ({ ...d, [pack.id]: next as HoldingId }))
                }
              />
            )
          })}
        </div>
      )}

      {/* Drawn even when the table is missing. A revocation is a decision about
          PERMISSION, and the server records and lifts one whether or not there
          is an entitlements table to take anything from — so hiding this with
          the rest of the panel would leave a block visible above it with no
          control that could lift it. The pack pickers stay dead either way,
          which is what keeps `absent` from being able to stage anything else. */}
      <Switch
        checked={revokeApp}
        onChange={setRevokeApp}
        tone="danger"
        label={`Revoke The Whole Of ${app.title}`}
        hint={
          absent
            ? 'The standing answer that this account may not have this app or buy any of it. With no entitlements table there is nothing on a row to take, so this records the decision and says so — it does not pretend to have removed anything.'
            : 'Every pack at once, and the standing answer that this account may not buy any of them. What comes off the row is kept on the block, so lifting it puts back exactly what was taken — dates, and the day they first got each pack.'
        }
      />

      {(wantsReason || reason) && (
        <Field
          label="Reason"
          hint="Sentence case, written for the person it is about — they see it on their own Store card and in the app. It goes on everything this save revokes. Left blank, the block still stands and simply says nothing about why."
        >
          <TextInput
            value={reason}
            onChange={setReason}
            maxLength={200}
            placeholder="Refunded after a chargeback."
          />
        </Field>
      )}

      <SaveBar
        changes={changes}
        onSave={save}
        busy={busy === `store:${app.id}`}
        notice={notice}
        noticeTo={app.title}
        nothingLabel={`Nothing to save. Every pack above matches what this account holds in ${app.title}.`}
      />

      {app.hasGrants && app.holdingsKnown && !absent && rentable.length > 0 && (
        <p className="dev__panel-quiet">
          A subscription state chosen above carries no Stripe subscription id, because the server
          refuses to invent one — that id is the only handle the Store's Cancel button has, and a made-up one
          would aim it into a live Stripe account at something that was never there. So a hand-made
          subscription shows every state on the card and its actions refuse, and the card says so.
          Ended drops the pack out of <code className="dev__code">owned_packs</code> the moment it is
          written, which is <code className="dev__code">{app.id}_packs_in_force()</code> doing its
          job, not the grant failing.
        </p>
      )}

      {app.onServer && app.holdingsKnown && !app.hasList && app.packs.length > 0 && (
        <p className="dev__panel-quiet">
          {app.id} publishes no <code className="dev__code">{app.id}_known_packs()</code> list, so
          the tiles above are what this account happens to hold rather than a catalogue. Granting
          accepts any well-formed pack id until that function exists.
        </p>
      )}

      {strays.length > 0 && (
        <p className="dev__warn">
          {strays.length === 1 ? 'One pack above is' : `${strays.length} packs above are`} on this
          account but in neither {app.id}'s own list nor the site's shop:{' '}
          {strays.map((p) => p.id).join(', ')}. A retired pack id, or a grant made by hand. Switch
          it off above if it should not be there — revoking is never held to the known list, so it
          will take.
        </p>
      )}

      {app.onServer && !app.eventsTable && (
        <p className="dev__panel-quiet">
          This app keeps no <code className="dev__code">{app.id}_purchase_events</code> ledger, so
          grants made here work but do not appear under Purchases.
        </p>
      )}

      <div className="dev__facts dev__facts--tight">
        <Fact label="Stripe customer" value={customer ?? 'none (never paid)'} mono />
      </div>
    </Panel>
  )
}

/* ── standing ──────────────────────────────────────────────────────────── */

function StandingPanel({
  account: a,
  run,
  busy,
  isSelf,
  isProtected,
}: Props & { isSelf: boolean; isProtected: boolean }) {
  const [banHours, setBanHours] = useState<string>('168')
  const [hideHours, setHideHours] = useState<string>('168')
  const [reason, setReason] = useState('')

  const banned = a.status === 'banned' && stillInForce(a.ban_until)
  const authLocked = a.auth_banned_until != null && stillInForce(a.auth_banned_until)
  const hidden = a.hidden_by_admin && stillInForce(a.hidden_until)
  const hoursOf = (v: string) => (v === 'null' ? null : Number(v))
  // The same one-word verdict the page header shows, so a shut panel still
  // answers "is anything limiting this account?".
  const standing = standingOf(a)

  if (isSelf) {
    return (
      <Panel
        title="Standing & Access"
        what="Suspending, hiding and deleting. None of it can be aimed at your own account. The server refuses, so there are no buttons here to mislead you."
        writes="public.bea_profile_state + auth.users"
        terms={['suspend ban hide delete restore sign out everywhere']}
        tone="danger"
        right={<Tag>THIS IS YOU</Tag>}
      >
        <p className="dev__panel-quiet">
          This is you. Pick another account to use these tools.
        </p>
      </Panel>
    )
  }

  return (
    <Panel
      title="Standing & Access"
      what="Everything that limits an account. Suspending locks sign-in for every TDG app at once; hiding only affects how they appear inside Bible Educator."
      writes="public.bea_profile_state + auth.users"
      terms={[standing.label, 'suspend ban hide delete restore sign out everywhere']}
      tone="danger"
      right={<Tag tone={standing.tone}>{standing.label.toUpperCase()}</Tag>}
    >
      <Field
        label="Reason (Optional)"
        hint="Written into the audit log beside the action. Nobody but a developer ever sees it."
      >
        <TextInput
          value={reason}
          onChange={setReason}
          maxLength={200}
          placeholder="e.g. spam reports from three accounts"
        />
      </Field>

      <div className="dev__action">
        <div className="dev__action-text">
          <h4 className="dev__action-title">Suspend</h4>
          <p className="dev__hint">
            Blocks sign-in across every TDG app and signs out every device now.
            {banned && (
              <>
                {' '}
                <strong>Currently suspended {a.ban_until ? `until ${fmtDate(a.ban_until)}` : 'indefinitely'}.</strong>
              </>
            )}
          </p>
        </div>
        <div className="dev__action-controls">
          {banned || authLocked ? (
            <Button
              busy={busy === 'unban'}
              onClick={() => run('unban', 'Suspension lifted.', () => api.moderate(a.user_id, 'unban', null, reason || null))}
            >
              Unsuspend
            </Button>
          ) : (
            <>
              <Select
                value={banHours}
                onChange={setBanHours}
                options={DURATIONS.map((d) => ({ value: String(d.hours), label: d.label }))}
              />
              <Button
                variant="danger"
                busy={busy === 'ban'}
                onClick={() =>
                  run('ban', 'Account suspended.', () =>
                    api.moderate(a.user_id, 'ban', untilFromHours(hoursOf(banHours)), reason || null),
                  )
                }
              >
                Suspend
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="dev__action">
        <div className="dev__action-text">
          <h4 className="dev__action-title">Hide From Public</h4>
          <p className="dev__hint">
            Removes them from Bible Educator's search, friend-adds and profile links. They can still
            sign in and use everything.
            {hidden && (
              <>
                {' '}
                <strong>Currently hidden {a.hidden_until ? `until ${fmtDate(a.hidden_until)}` : 'indefinitely'}.</strong>
              </>
            )}
          </p>
        </div>
        <div className="dev__action-controls">
          {hidden ? (
            <Button
              busy={busy === 'unhide'}
              onClick={() => run('unhide', 'Account visible again.', () => api.moderate(a.user_id, 'unhide', null, reason || null))}
            >
              Unhide
            </Button>
          ) : (
            <>
              <Select
                value={hideHours}
                onChange={setHideHours}
                options={DURATIONS.map((d) => ({ value: String(d.hours), label: d.label }))}
              />
              <Button
                busy={busy === 'hide'}
                onClick={() =>
                  run('hide', 'Account hidden.', () =>
                    api.moderate(a.user_id, 'hide', untilFromHours(hoursOf(hideHours)), reason || null),
                  )
                }
              >
                Hide
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="dev__action">
        <div className="dev__action-text">
          <h4 className="dev__action-title">Sign Out Everywhere</h4>
          <p className="dev__hint">
            Ends every live session on every device. They can sign straight back in. This is for a
            password that may have leaked, not a punishment.
          </p>
        </div>
        <div className="dev__action-controls">
          <Button
            busy={busy === 'signout'}
            onClick={() =>
              run('signout', 'Every session ended.', () =>
                api.moderate(a.user_id, 'sign_out_everywhere', null, reason || null),
              )
            }
          >
            Sign Out Everywhere
          </Button>
        </div>
      </div>

      <div className="dev__action">
        <div className="dev__action-text">
          <h4 className="dev__action-title">Soft Delete</h4>
          <p className="dev__hint">
            Locks the account out and hides it, but keeps every row: profile, purchases, friends,
            streak. Restore puts it all back exactly as it was.
            {a.deleted_by_admin && (
              <>
                {' '}
                <strong>Soft-deleted {fmtRelative(a.deleted_at)}.</strong>
              </>
            )}
          </p>
        </div>
        <div className="dev__action-controls">
          {a.deleted_by_admin ? (
            <Button
              busy={busy === 'restore'}
              onClick={() => run('restore', 'Account restored.', () => api.moderate(a.user_id, 'restore', null, reason || null))}
            >
              Restore
            </Button>
          ) : (
            <Button
              variant="danger"
              busy={busy === 'soft'}
              onClick={() =>
                run('soft', 'Account soft-deleted.', () =>
                  api.moderate(a.user_id, 'soft_delete', null, reason || null),
                )
              }
            >
              Soft Delete
            </Button>
          )}
        </div>
      </div>

      <div className="dev__action dev__action--last">
        <div className="dev__action-text">
          <h4 className="dev__action-title">Delete Forever</h4>
          <p className="dev__hint">
            Erases the account, its profile, its purchases and its place in everyone else's friend
            lists. There is no undo and no backup of it. The account has to be soft-deleted first,
            and the ledger keeps the payment rows with nobody attached.
            {isProtected && (
              <>
                {' '}
                <strong>
                  Not this one. Deleting a protected owner account is how you would take its
                  Developer permission away by the back door, so the database refuses it.
                </strong>
              </>
            )}
          </p>
        </div>
        <div className="dev__action-controls">
          {isProtected ? (
            <p className="dev__panel-quiet">Protected account.</p>
          ) : a.deleted_by_admin ? (
            <TypeToConfirm
              phrase={a.username || a.email || a.user_id}
              actionLabel="Delete Forever"
              busy={busy === 'nuke'}
              label={
                <>
                  This permanently erases <strong>{nameOf(a)}</strong>. Everything above goes with it.
                </>
              }
              onConfirm={() =>
                run('nuke', 'Account deleted forever.', () => api.deleteForever(a.user_id))
              }
            />
          ) : (
            <p className="dev__panel-quiet">Soft delete it first.</p>
          )}
        </div>
      </div>
    </Panel>
  )
}

/* ── history ───────────────────────────────────────────────────────────── */

function HistoryPanel({ events, audit, historyState }: Props) {
  const { terms, active } = useSearch()

  /*
   * Filtered here rather than by the caller, because this panel is the only
   * thing that renders these two lists and its own match count has to be the
   * number of rows it will actually show. A header promising three matches
   * over an empty list is worse than no count at all.
   */
  // `e.who` is deliberately NOT in this haystack. Every row here already
  // belongs to the account on screen, so matching their name would light up
  // the whole list with nothing in any row visibly matching, which reads as a
  // broken search rather than a scoped one.
  const shownEvents = events.filter((e) =>
    matchesTerms(hay(e.source, e.event_type, e.item, e.event_id, fmtUsd(e.amount_cents)), terms),
  )
  const shownAudit = audit.filter((r) =>
    matchesTerms(hay(r.app, r.action, r.detail, r.actor_name), terms),
  )
  const shown = shownEvents.length + shownAudit.length

  return (
    <Panel
      title="This Account's History"
      what="Every payment, grant and moderation action recorded against them, newest first."
      writes="*_purchase_events + mak_subscription_events + bea_moderation_audit"
      matchCount={historyState === 'ready' ? shown : 0}
      right={
        historyState === 'ready' ? (
          <Tag tone={shown ? 'ok' : 'plain'}>{shown} ENTRIES</Tag>
        ) : (
          <Tag tone={historyState === 'error' ? 'bad' : 'plain'}>
            {historyState === 'error' ? 'UNREADABLE' : 'READING'}
          </Tag>
        )
      }
    >
      {historyState === 'loading' && <p className="dev__panel-quiet">Reading the ledger…</p>}
      {historyState === 'error' && (
        <p className="dev__warn">Couldn't read the history. Nothing is wrong with the account.</p>
      )}

      {historyState === 'ready' && (
        <>
          <h4 className="dev__sub">Purchases And Grants</h4>
          {shownEvents.length === 0 ? (
            <p className="dev__panel-quiet">
              {active
                ? 'No purchase or grant matches that.'
                : "Nothing has ever changed this account's entitlements."}
            </p>
          ) : (
            <ul className="dev__log">
              {shownEvents.map((e) => (
                <li key={e.event_id} className="dev__log-row">
                  <span className="dev__log-when" title={fmtDate(e.at)}>
                    {fmtRelative(e.at)}
                  </span>
                  <Tag tone={e.event_id.startsWith('admin:') ? 'warn' : 'ok'}>
                    {e.event_id.startsWith('admin:') ? 'GRANTED' : 'PAID'}
                  </Tag>
                  <span className="dev__log-what">
                    <code className="dev__code">
                      <Highlight text={e.event_type} />
                    </code>
                    {e.item ? (
                      <>
                        {' · '}
                        <Highlight text={e.item} />
                      </>
                    ) : null}
                  </span>
                  <span className="dev__log-amount">
                    <Highlight text={fmtUsd(e.amount_cents)} />
                  </span>
                </li>
              ))}
            </ul>
          )}

          <h4 className="dev__sub">Moderation And Permissions</h4>
          {shownAudit.length === 0 ? (
            <p className="dev__panel-quiet">
              {active ? 'No action matches that.' : 'No developer has ever acted on this account.'}
            </p>
          ) : (
            <ul className="dev__log">
              {shownAudit.map((r) => (
                <li key={r.id} className="dev__log-row">
                  <span className="dev__log-when" title={fmtDate(r.at)}>
                    {fmtRelative(r.at)}
                  </span>
                  <Tag>{r.app}</Tag>
                  <span className="dev__log-what">
                    <strong>
                      <Highlight text={r.action} />
                    </strong>
                    {r.detail ? (
                      <>
                        {' · '}
                        <Highlight text={r.detail} />
                      </>
                    ) : null}
                  </span>
                  <span className="dev__log-amount">
                    by <Highlight text={r.actor_name} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Panel>
  )
}
