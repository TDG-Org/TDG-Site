import { useEffect, useMemo, useState } from 'react'
import type { DevAccount, DevAuditRow, DevCatalog, DevEvent } from './api'
import * as api from './api'
// The badge verbs live with the rest of the badge surface rather than in
// `./api`, because the site's footer and every other TDG app call the same
// module. This console is one of its callers. See src/badges/README.md.
import { adminSetBadge } from '../badges/api'
import type { AdminBadge } from '../badges/types'
import { grantNote, storeApps, type DevStoreApp } from './apps'
import {
  Button,
  Combo,
  Fact,
  Field,
  OwnTile,
  Panel,
  Select,
  Switch,
  Tag,
  TextArea,
  TextInput,
  TypeToConfirm,
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

      <WhoPanel account={account} />
      <IdentityPanel {...props} />
      <PermissionsPanel {...props} isSelf={isSelf} isProtected={isProtected} />
      <CorePanel {...props} />
      {/* Directly under the two panels that own the facts today's derived
          badges follow, so "change the fact and the badge follows" points
          upward at something the reader can already see. */}
      <BadgesPanel {...props} />
      <MakullvenyPanel {...props} />
      {stores.map((app) => (
        <StorePanel key={app.id} {...props} app={app} />
      ))}
      <StandingPanel {...props} isSelf={isSelf} isProtected={isProtected} />
      <HistoryPanel {...props} />
    </div>
  )
}

/* ── who this is ───────────────────────────────────────────────────────── */

function WhoPanel({ account: a }: { account: DevAccount }) {
  return (
    <Panel
      title="At A Glance"
      what="Read-only facts about the account itself. Nothing here can be edited from this console: the email and the password belong to GoTrue, and the id is fixed for life."
      writes="auth.users + public.profiles"
      terms={[a.user_id, a.email, a.recovery_email, a.username, a.display_name]}
      right={
        a.email_confirmed_at ? (
          <Tag tone="ok">CONFIRMED</Tag>
        ) : (
          <Tag tone="warn">UNCONFIRMED</Tag>
        )
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
    </Panel>
  )
}

/* ── identity ──────────────────────────────────────────────────────────── */

function IdentityPanel({ account: a, run, busy }: Props) {
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
      what="The name and handle this account shows under, everywhere in TDG. Leave a field blank to clear it."
      writes="public.profiles"
      terms={[a.display_name, a.username, a.bio, 'name handle privacy']}
      right={
        dirty ? <Tag tone="warn">UNSAVED</Tag> : <span className="dev__panel-quiet">Saved</span>
      }
    >
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
    </Panel>
  )
}

/* ── permissions ───────────────────────────────────────────────────────── */

function PermissionsPanel({
  account: a,
  run,
  busy,
  isSelf,
  isProtected,
}: Props & { isSelf: boolean; isProtected: boolean }) {
  return (
    <Panel
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
        checked={a.is_admin}
        disabled={isSelf || isProtected}
        busy={busy === 'developer'}
        onChange={(next) =>
          run(
            'developer',
            next ? 'Developer granted.' : 'Developer revoked.',
            () => api.setDeveloper(a.user_id, next),
          )
        }
        label="Developer"
        hint={
          isProtected
            ? 'This is one of the two TDG owner accounts. Its Developer permission is fixed in the database and cannot be removed from here, or from anywhere else the apps can reach. Changing that list takes a migration.'
            : isSelf
              ? "You can't change your own. That rule is what stops the last developer locking everyone out, so ask the other one to do it."
              : 'Grants full read and write over every account, purchase and subscription in TDG Core. Give it to nobody who is not one of us.'
        }
      />
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

  const dirty = tier !== a.core_tier || status !== a.core_status

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
        <Field label="Status" hint="Only 'active' actually unlocks anything today; the rest are for matching Stripe.">
          <Select
            value={status}
            onChange={setStatus}
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
            run('core', `Core subscription set to ${tier} / ${status}.`, () =>
              api.setCoreSubscription(a.user_id, tier, status),
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

/* ── Makullveny ────────────────────────────────────────────────────────── */

function MakullvenyPanel({ account: a, catalog, run, busy }: Props) {
  const [tier, setTier] = useState(a.mak_tier)
  const [status, setStatus] = useState(a.mak_status)

  useEffect(() => {
    setTier(a.mak_tier)
    setStatus(a.mak_status)
  }, [a.user_id, a.mak_tier, a.mak_status])

  const dirty = tier !== a.mak_tier || status !== a.mak_status
  const candle = a.mak_candle_purchased_at != null

  return (
    <Panel
      title="Makullveny"
      what="Makullveny's own ladder, separate from the core one. The app uses whichever of the two is higher."
      writes="public.mak_subscriptions"
      terms={[
        a.mak_tier,
        a.mak_status,
        a.mak_themes,
        a.mak_stripe_customer_id,
        candle ? 'candle bundle' : '',
        a.mak_support_badge_at ? 'supporter badge' : '',
        'theme market',
      ]}
      right={<Tag tone={a.mak_tier === 'free' ? 'plain' : 'ok'}>{a.mak_tier.toUpperCase()}</Tag>}
    >
      <div className="dev__grid2">
        <Field label="Tier" hint="free · candle · lantern · hearth, cheapest first.">
          <Select
            value={tier}
            onChange={setTier}
            options={catalog.mak_tiers.map((t) => ({ value: t, label: t }))}
          />
        </Field>
        <Field label="Status" hint="Mirrors Stripe's own subscription statuses.">
          <Select
            value={status}
            onChange={setStatus}
            options={catalog.statuses.map((s) => ({ value: s, label: s }))}
          />
        </Field>
      </div>

      <div className="dev__row dev__row--end">
        <Button
          variant="primary"
          disabled={!dirty}
          busy={busy === 'mak'}
          onClick={() =>
            run('mak', `Makullveny set to ${tier} / ${status}.`, () =>
              api.setMakSubscription(a.user_id, tier, status),
            )
          }
        >
          Save Makullveny Tier
        </Button>
      </div>

      <hr className="dev__rule" />

      <Switch
        checked={candle}
        busy={busy === 'candle'}
        onChange={(next) =>
          run('candle', next ? 'Candle bundle granted.' : 'Candle bundle removed.', () =>
            api.setMakFlag(a.user_id, 'candle_bundle', next),
          )
        }
        label="Candle Bundle"
        hint="The whole marketplace in one switch. The app reads it as owning every theme below, including any added later, so granting Candle needs no individual themes."
      />
      <Switch
        checked={a.mak_support_badge_at != null}
        busy={busy === 'badge'}
        onChange={(next) =>
          run('badge', next ? 'Support badge granted.' : 'Support badge removed.', () =>
            api.setMakFlag(a.user_id, 'support_badge', next),
          )
        }
        label="Supporter Badge"
        hint="The permanent 'supported Mak' marker. Normally set once by a real payment and never cleared, even on a cancel."
      />

      <Field
        label="Individual Themes"
        hint={
          candle
            ? 'Candle is on, so every theme is already unlocked in the app whatever these say. These are the ones bought one at a time.'
            : 'Themes bought one at a time from the Market page.'
        }
      >
        <div className="dev__tiles">
          {catalog.mak_themes.map((theme) => (
            <OwnTile
              key={theme}
              name={prettyId(theme)}
              owned={a.mak_themes.includes(theme)}
              busy={busy === `theme:${theme}`}
              note={candle ? 'via Candle' : undefined}
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

  const what = absent
    ? `The site sells ${app.title}'s packs, but TDG Core has no table to record them in, so nothing here can be granted and a real payment would land nowhere.`
    : unknown
      ? `The console could not read TDG Core's list of apps, so it cannot say whether ${app.title} is registered or what this account holds. The switches still work: the server decides, and it says so in words if it disagrees.`
      : holdingsMissing
        ? `The server did not report what this account holds in ${app.title}, so this panel is not showing ownership rather than showing it as empty.`
        : !app.inShop
          ? `Store packs for ${app.title}. The console found this app by its entitlements table; the site's shop does not sell it yet, so these packs have names made from their ids and no prices.`
          : 'One-time Store packs. Switching one on is a free grant and switching it off is a revoke, and both land in the same ledger a real Stripe payment does.'

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
        'pack store grant revoke',
      ]}
      right={
        absent ? (
          <Tag tone="bad">NO TABLE</Tag>
        ) : unknown || holdingsMissing ? (
          // A shut panel must not summarise an unknown as a number. "0 OWNED"
          // is the sentence this whole change exists to stop the page saying.
          <Tag tone="warn">NO ANSWER</Tag>
        ) : (
          <Tag tone={app.ownedCount ? 'ok' : 'plain'}>{app.ownedCount} OWNED</Tag>
        )
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
        <div className="dev__tiles">
          {app.packs.map((pack) => (
            <OwnTile
              key={pack.id}
              name={pack.name}
              owned={pack.owned}
              disabled={absent}
              busy={busy === `${app.id}:${pack.id}`}
              // Short, and only when it says something. A note repeating what
              // every tile would say is a note nobody reads, which is how the
              // one saying `ends 23 Sep` gets missed. The cadence in the price
              // already tells you a pack is rented, so `grantNote` stays quiet
              // unless the account's own grant says something the price cannot.
              note={
                grantNote(pack.grant) ??
                (!pack.inShop && app.inShop ? 'not sold' : (pack.price ?? undefined))
              }
              onChange={(next) =>
                run(
                  `${app.id}:${pack.id}`,
                  `${pack.name} ${next ? 'granted' : 'revoked'}.`,
                  () => api.setPack(a.user_id, app.id, pack.id, next),
                )
              }
            />
          ))}
        </div>
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
