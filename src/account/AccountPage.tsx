import { useId, useRef } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { useMyBadges } from '../badges/useBadges'
import { BackButton } from '../components/Folded'
import { useParallax } from '../hooks/useParallax'
import { useReveal } from '../hooks/useReveal'
import { fmtCount, fmtDay, fmtRelative, prettyId } from './format'
import { useAccountStats, usePrivacy } from './useAccount'
import type { Audience, PrivacyControl, PrivacyGroup } from './types'
import './Account.css'

/**
 * Your TDG account, on one page.
 *
 * ## Why it is a page and not a bigger menu
 *
 * The account menu in the nav answers *who am I signed in as* in a glance, and
 * that is all a menu hanging off a fixed bar can honestly do — it is capped at
 * 280px wide and at the room under the bar, and it closes the moment the
 * pointer leaves it. Eight privacy controls, nine counters and a badge shelf in
 * there would be a panel nobody can read on a phone. So the menu keeps the
 * glance, gains the four figures somebody actually wants at a glance, and
 * carries one button to here.
 *
 * ## It wears the app page's clothes on purpose
 *
 * `.appview` and its shell, head, back control and ghost buttons come from
 * `AppPage.css`, which `Folded.tsx` already imports — the same decision
 * `About.tsx` records, and for the same reason: this page is opened from the
 * same chrome as those, and a second set of lookalike page furniture is the
 * beginning of the two drifting apart. `Account.css` holds only what is
 * genuinely new here, which is the privacy list and the counters.
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
 * is safe here because every value is reversible and none of them is
 * destructive.
 *
 * The options are `control.allowed` mapped through the audience list — never
 * a hardcoded three. An audience id this build has never seen still draws,
 * with a label made from its id (rule 17), because an option silently missing
 * from a privacy control is the worst kind of missing.
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
        const rows = controls
          .filter((c) => c.group === group.id)
          .sort((a, b) => a.sort - b.sort)
        if (rows.length === 0) return null
        return (
          <section key={group.id} className="acct__group">
            <h3 className="acct__group-title">{group.label}</h3>
            {group.blurb && <p className="acct__group-blurb">{group.blurb}</p>}
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
          </section>
        )
      })}
    </>
  )
}

/** A card's own heading, so the six of them cannot drift apart. */
function CardHead({ title, blurb }: { title: string; blurb: string }) {
  return (
    <header className="acct__card-head">
      <h2 className="acct__card-title">{title}</h2>
      <p className="acct__card-blurb">{blurb}</p>
    </header>
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

  const blob = useParallax<HTMLDivElement>(-0.12)
  const head = useReveal<HTMLDivElement>('wipe', 0)

  const name = profile?.display_name || profile?.username || 'Your TDG Account'
  const packs =
    stats.kind === 'ok'
      ? Object.values(stats.stats.packs).reduce((sum, list) => sum + list.length, 0)
      : 0
  const streaks = stats.kind === 'ok' ? Object.entries(stats.stats.streaks) : []

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
            </div>
          )}
        </div>

        {/* ── signed out ────────────────────────────────────────────────────
            The route exists, so this says so. Rendering home instead — the way
            `#/dev` does — would be the right answer for a page nobody is meant
            to know about, and the wrong one for a page whose whole job is to
            be somewhere a reader can get to. */}
        {status === 'signedOut' && (
          <div className="card acct__card acct__card--wide">
            <CardHead
              title="Sign In To See Your Account"
              blurb="One TDG account signs you in to every app we make, and this page is where it lives."
            />
            <button type="button" className="acct__primary" onClick={onOpenAuth}>
              Sign In Or Create An Account
            </button>
          </div>
        )}

        {status === 'loading' && (
          <div className="card acct__card acct__card--wide">
            <p className="acct__note">Restoring your session…</p>
          </div>
        )}

        {status === 'signedIn' && (
          <div className="acct__grid">
            {/* ── the account itself ─────────────────────────────────────── */}
            <div className="card acct__card">
              <CardHead title="Account" blurb="What this account is, and when it began." />
              <dl className="acct__facts">
                <Fact label="Display Name" value={profile?.display_name || 'not set'} />
                <Fact
                  label="Username"
                  value={profile?.username ? `@${profile.username}` : 'not set'}
                />
                <Fact label="Email" value={user?.email || 'not set'} />
                <Fact label="Plan" value={prettyId(tier ?? 'free')} />
                <Fact
                  label="Account Type"
                  value={isAdmin ? 'TDG Developer' : 'TDG Account'}
                />
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
            </div>

            {/* ── the counters ───────────────────────────────────────────── */}
            <div className="card acct__card">
              <CardHead
                title="Your Stats"
                blurb="Everything this account has added up, across every TDG app."
              />
              {stats.kind === 'checking' && <p className="acct__note">Counting…</p>}
              {stats.kind === 'error' && (
                <p className="acct__note acct__note--warn">
                  We couldn't read your stats just now. Nothing has changed — try again in a moment.
                </p>
              )}
              {stats.kind === 'ok' && (
                <>
                  <div className="acct__tiles">
                    <Tile n={stats.stats.friends} label="Friends" />
                    <Tile
                      n={stats.stats.requestsIn}
                      label="Requests"
                      hint="waiting on you"
                    />
                    <Tile n={stats.stats.requestsOut} label="Asked" hint="sent by you" />
                    <Tile n={stats.stats.blocked} label="Blocked" />
                    <Tile n={stats.stats.badges} label="Badges" />
                    <Tile n={Object.keys(stats.stats.apps).length} label="Apps Used" />
                    <Tile n={packs} label="Packs Owned" />
                    <Tile n={stats.stats.feedbackSent} label="Reports Sent" />
                  </div>

                  {/* Per app, and the app names are the server's — nothing here
                      lists one (rule 17). An app with no streak row simply is
                      not here; an app this build has never heard of still is,
                      under a name made from its id. */}
                  {streaks.length > 0 && (
                    <div className="acct__streaks">
                      {streaks.map(([app, streak]) => (
                        <div key={app} className="acct__streak">
                          <span className="acct__streak-app">{prettyId(app)}</span>
                          <span className="acct__streak-n">
                            {fmtCount(streak.current)}
                            <span className="acct__streak-unit">day streak</span>
                          </span>
                          <span className="acct__streak-more">
                            Best {fmtCount(streak.longest)} · {fmtCount(streak.days)} days in all
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* ── badges ─────────────────────────────────────────────────── */}
            <div className="card acct__card">
              <CardHead
                title="Badges"
                blurb="Marks on the account itself, true in every TDG app at once."
              />
              {badges.kind === 'checking' && <p className="acct__note">Checking your badges…</p>}
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
            </div>

            {/* ── privacy ────────────────────────────────────────────────── */}
            <div className="card acct__card acct__card--wide">
              <CardHead
                title="Privacy"
                blurb="Who can see each part of your account. Every one of these is yours to change, and every change is saved the moment you make it."
              />

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
                      server's own words, and the control has already gone back
                      to what it was. A silent revert would read as the site
                      undoing a choice for reasons of its own. */}
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
            </div>

            {/* ── the way out ────────────────────────────────────────────── */}
            <div className="card acct__card acct__card--wide">
              <CardHead
                title="Session"
                blurb="How you reach us, and how you leave. Signing out here signs out this browser only — your other devices and the other TDG apps stay signed in."
              />
              <div className="acct__actions">
                <button type="button" className="appview__ghost" onClick={onOpenFeedback}>
                  Send Feedback
                </button>
                <button type="button" className="appview__ghost" onClick={() => void signOut()}>
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
