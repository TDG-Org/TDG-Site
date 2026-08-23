import { useEffect, useMemo, useState } from 'react'
import type { DevAccount, DevAuditRow, DevCatalog, DevEvent } from './api'
import * as api from './api'
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
 */
function StorePanel({ account: a, run, busy, app }: Props & { app: DevStoreApp }) {
  const entry = a.store?.[app.id]
  const customer = entry?.stripe_customer_id ?? null
  // A pack is only STRAY if there was something for it to be missing from. An
  // app that publishes no pack list and is not in the shop has no list to fall
  // off, so its packs are simply its packs — see `hasList` in apps.ts.
  const strays =
    app.hasList || app.inShop ? app.packs.filter((p) => !p.onServer && !p.inShop) : []

  const what = !app.onServer
    ? `The site sells ${app.title}'s packs, but TDG Core has no table to record them in, so nothing here can be granted and a real payment would land nowhere.`
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
      tone={!app.onServer ? 'danger' : 'plain'}
      terms={[
        app.id,
        app.title,
        ...app.packs.map((p) => `${p.id} ${p.name}`),
        customer,
        'pack store grant revoke',
      ]}
      right={
        !app.onServer ? (
          <Tag tone="bad">NO TABLE</Tag>
        ) : (
          <Tag tone={app.ownedCount ? 'ok' : 'plain'}>{app.ownedCount} OWNED</Tag>
        )
      }
    >
      {!app.onServer && (
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

      {app.onServer && app.packs.length === 0 ? (
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
              disabled={!app.onServer}
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

      {app.onServer && !app.hasList && app.packs.length > 0 && (
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
