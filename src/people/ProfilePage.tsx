import { useMemo, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { useAppNames } from '../account/appNames'
import { fmtCount, fmtDay, fmtRelative } from '../account/format'
import { actionsFor, standingChip, standingNotice } from '../account/standing'
import { BackButton } from '../components/Folded'
import { useParallax } from '../hooks/useParallax'
import { useReveal } from '../hooks/useReveal'
import { ACCOUNT_HASH, userHash } from '../lib/route'
import { usePerson } from './usePerson'
import type { ProfileFriend, PublicProfile } from './api'
/*
 * It wears the Account page's clothes, and that is deliberate.
 *
 * `AppPage.css` arrives with `BackButton` and gives this page its shell, head,
 * grid texture, blob and ghost buttons — the decision `About.tsx` records and
 * `AccountPage.tsx` repeats. `Account.css` is imported for the second layer:
 * the counters, the badge chips, the streak rows, the app facts, the notes and
 * the refusal banner. Every one of those draws the SAME fact here as it does
 * on your own account, and a second set of lookalike tiles is how two surfaces
 * showing one thing start disagreeing about what it looks like.
 *
 * `Profile.css` holds only what is genuinely new: the head, the standing
 * banner, the withheld notes, and the friend links.
 */
import '../account/Account.css'
import './Profile.css'

/**
 * Somebody else's TDG account, at `#/user/<handle>`.
 *
 * ## Why the page opens even when there is nothing on it
 *
 * A profile is reachable for an account that has closed itself off, and for an
 * account that has blocked you. Both of those used to answer the way a
 * misspelled handle answers — nothing at all — and that is the one thing this
 * page exists to stop. "We couldn't find anybody with that username" for an
 * account that plainly exists is the site telling a reader something false to
 * avoid saying something awkward, and the reader's next move is to go and
 * check a spelling that was right.
 *
 * So the page always resolves: a name, a handle, a standing chip, and a
 * sentence saying which of the two it is. **What is ON it does not loosen by
 * one column.** Every section comes from `tdg_can_view`, which still refuses
 * everything to somebody who has been blocked, so a blocked reader gets an
 * identity, an explanation, and nothing else. The block keeps everything it
 * ever protected and stops being a lie.
 *
 * Moderation is not a block and does not soften: an account hidden or deleted
 * by a developer answers exactly what an unheld handle answers, which is
 * nothing — the property `src/auth/README.md` protects everywhere else.
 *
 * ## Every withheld section says so
 *
 * A missing badge row could mean "no badges" or "not shown to you", and the
 * two are different sentences about a person. The server sends both facts —
 * the value AND the `can*` flag that decided it — precisely so this page never
 * has to guess, and a section drawn from a false flag says why it is empty
 * instead of looking like a page that failed to load.
 *
 * ## The route is not gated, and the read is
 *
 * `#/user/<handle>` renders for anybody, including a signed-out reader who
 * followed a link — who is told to sign in, in words, on the page they asked
 * for. That is `#/account`'s rule, not `#/dev`'s. What they may then SEE is
 * decided in Postgres and nowhere else (AGENTS.md rule 12): `tdg_profile_at`
 * is granted to `authenticated`, because it names a person and every function
 * on this project that names a person does.
 */

/** A section of the page. `h2`, because the person's name is the `h1`. */
function ProfileSection({
  title,
  what,
  children,
}: {
  title: string
  what?: string
  children: ReactNode
}) {
  return (
    <section className="acct__sub prof__section">
      <h2 className="acct__sub-title">{title}</h2>
      {what && <p className="acct__sub-what">{what}</p>}
      {children}
    </section>
  )
}

/**
 * The one sentence a section that is not yours to read says.
 *
 * It never claims to know WHICH setting did it. The server answers "may you
 * see this" and deliberately does not answer "because it is friends-only" —
 * telling a stranger that a thing is friends-only is itself a fact about the
 * account, and a page that leaked it one section at a time would be a privacy
 * screen with a side door.
 */
function Withheld({ what }: { what: string }) {
  return <p className="acct__note prof__withheld">Their privacy settings don't share {what} with you.</p>
}

function Tile({ n, label, hint }: { n: number | string; label: string; hint?: string }) {
  return (
    <div className="acct__tile">
      <span className="acct__tile-n">{n}</span>
      <span className="acct__tile-label">{label}</span>
      {hint && <span className="acct__tile-hint">{hint}</span>}
    </div>
  )
}

/** One of their friends, as a link to that person's own page. A friend with no
 *  handle has no page — `userHash` is built from a username, and there is no
 *  other address for a profile — so they are drawn as a name rather than as a
 *  link that goes nowhere. */
function FriendLink({ friend }: { friend: ProfileFriend }) {
  const name = friend.displayName || friend.username || 'A TDG account'
  if (!friend.username) return <span className="prof__friend prof__friend--flat">{name}</span>
  return (
    <a className="prof__friend" href={userHash(friend.username)}>
      <span className="prof__friend-name">{name}</span>
      <span className="prof__friend-handle">@{friend.username}</span>
    </a>
  )
}

function ProfileBody({ profile, panel }: { profile: PublicProfile; panel: ReturnType<typeof usePerson> }) {
  const appName = useAppNames()
  const streaks = useMemo(() => Object.entries(profile.streaks ?? {}), [profile.streaks])
  const apps = useMemo(
    () =>
      Object.entries(profile.apps ?? {})
        .map(([id, app]) => ({
          id,
          title: appName(id),
          since: app.since,
          earned: Object.keys(app.earned ?? {}).length,
        }))
        .sort((a, b) => a.title.localeCompare(b.title)),
    [profile.apps, appName],
  )

  /*
   * A profile nobody may open is still a page, and this is the whole of it:
   * who they are, where you stand, and whatever contact you are still allowed
   * to make. `friend_requests` is a `contact` key and is NOT gated by the
   * profile key above it — a private account is still an account you may ask
   * to be friends with, which Bible Educator settled first and on purpose.
   */
  if (!profile.visible) {
    return (
      <div className="card acct__card prof__closed">
        <h2 className="acct__card-title">
          {profile.standing === 'blocked_by' ? 'Nothing Here Is Shown To You' : 'This Profile Is Private'}
        </h2>
        <p className="acct__card-blurb">
          {profile.standing === 'blocked_by'
            ? 'This is still their account and this is still their page. What they share is not shown to you while the block stands.'
            : 'This account keeps its page to itself, or shows it to friends only. Nothing is missing — it is simply not shared with you.'}
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="acct__tiles prof__tiles">
        <Tile
          n={profile.canFriends ? fmtCount(profile.friendCount) : '—'}
          label="Friends"
          hint={profile.canFriends ? undefined : 'not shared'}
        />
        {/* Not drawn on your own page. "Friends you both have" with yourself
            is every friend you have, counted twice under two headings — a
            figure that is arithmetically right and means nothing. */}
        {profile.standing !== 'self' && (
          <Tile
            n={profile.mutualCount === null ? '—' : fmtCount(profile.mutualCount)}
            label="In Common"
            hint={profile.mutualCount === null ? 'not shared' : 'friends you both have'}
          />
        )}
        <Tile
          n={profile.canBadges ? fmtCount((profile.badges ?? []).length) : '—'}
          label="Badges"
          hint={profile.canBadges ? undefined : 'not shared'}
        />
        <Tile
          n={profile.canApps ? fmtCount(apps.length) : '—'}
          label="Apps Used"
          hint={profile.canApps ? undefined : 'not shared'}
        />
      </div>

      <ProfileSection
        title="Member Since"
        what="When this TDG account began — one account across every app we make."
      >
        {profile.canAccountAge ? (
          <p className="acct__note">
            {fmtDay(profile.createdAt)} · {fmtRelative(profile.createdAt)}
          </p>
        ) : (
          <Withheld what="when their account began" />
        )}
      </ProfileSection>

      <ProfileSection
        title="Badges"
        what="Marks on the account itself, true in every TDG app at once."
      >
        {!profile.canBadges ? (
          <Withheld what="their badges" />
        ) : (profile.badges ?? []).length === 0 ? (
          <p className="acct__note">No badges yet. We hand them out one at a time.</p>
        ) : (
          <div className="chips acct__badges">
            {(profile.badges ?? []).map((badge) => (
              <span key={badge.id} className="chip acct__badge" title={badge.blurb}>
                {badge.label}
                <span className="sr-only"> — {badge.blurb}</span>
              </span>
            ))}
          </div>
        )}
      </ProfileSection>

      <ProfileSection
        title="Streaks"
        /* "Kept on this account", not "they kept": this page is also how you
           look at your own profile, and a section that says `they` over your
           own streak reads as the site not knowing who you are. Every heading
           here is worded to be true whoever is reading it, which is cheaper
           and steadier than a second set of strings for one case. */
        what="A run of days kept on this account, counted per app. Nothing here is a total: two apps are two habits."
      >
        {!profile.canStreak ? (
          <Withheld what="their streaks" />
        ) : streaks.length === 0 ? (
          <p className="acct__note">No streak counted yet.</p>
        ) : (
          <div className="acct__streaks">
            {streaks.map(([app, streak]) => (
              <div key={app} className="acct__streak">
                {/* The app's own name, never the id the database stores. */}
                <span className="acct__streak-app">{appName(app)}</span>
                <span className="acct__streak-n">
                  {fmtCount(streak.current ?? 0)}
                  <span className="acct__streak-unit">day streak</span>
                </span>
                <span className="acct__streak-more">
                  Best {fmtCount(streak.longest ?? 0)} · {fmtCount(streak.days ?? 0)} days in all
                  {streak.lastActive ? ` · last counted ${fmtRelative(streak.lastActive)}` : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </ProfileSection>

      <ProfileSection title="Apps" what="Which TDG apps this account has opened.">
        {!profile.canApps ? (
          <Withheld what="which apps they use" />
        ) : apps.length === 0 ? (
          <p className="acct__note">Nothing yet.</p>
        ) : (
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
                </dl>
              </div>
            ))}
          </div>
        )}
      </ProfileSection>

      <ProfileSection
        title="Friends"
        what="Only the ones whose own profile you may open — so this list and the number above it can never disagree."
      >
        {!profile.canFriends ? (
          <Withheld what="their friends list" />
        ) : profile.friendCount === 0 ? (
          <p className="acct__note">Nobody to show.</p>
        ) : panel.friendsFailed ? (
          <p className="acct__note acct__note--warn">
            We couldn't read their friends just now, so this is not showing you a guess.
          </p>
        ) : panel.friends === null ? (
          <p className="acct__note">Reading…</p>
        ) : (
          <div className="prof__friends">
            {panel.friends.map((friend) => (
              <FriendLink key={friend.userId} friend={friend} />
            ))}
          </div>
        )}
      </ProfileSection>
    </>
  )
}

export default function ProfilePage({
  username,
  onOpenAuth,
}: {
  username: string
  onOpenAuth: () => void
}) {
  const { profile: mine } = useAuth()
  const panel = usePerson(username)
  const blob = useParallax<HTMLDivElement>(-0.12)
  const head = useReveal<HTMLDivElement>('wipe', 0)

  const profile = panel.state.kind === 'ok' ? panel.state.profile : null
  const name = profile?.displayName || profile?.username || `@${username}`
  const chip = profile ? standingChip(profile.standing) : null
  const notice = profile ? standingNotice(profile.standing) : null
  const actions = profile ? actionsFor(profile.standing) : []

  /*
   * The one place a drawn button is dropped rather than left to be refused.
   * `friend_requests` is a setting an account chose, `tdg_add_friend` refuses
   * on it with a sentence, and the honest render of a no somebody has ALREADY
   * said is a line of text — not a button whose only outcome is that
   * sentence. Every other action stays exactly as `actionsFor` gives it: the
   * boundary is Postgres and this is presentation.
   */
  const askRefused = profile?.standing === 'none' && !profile.canRequest
  const shown = askRefused ? actions.filter((a) => a.action !== 'add') : actions

  /* Your own page, seen the way anybody else sees it. Reached by opening your
     own handle, and worth saying out loud — a reader who lands here through a
     search result should not have to work out why there are no buttons. */
  const isMe = profile?.standing === 'self'

  return (
    <section id="top" className="section section--blend appview prof">
      <div className="texture appview__grid" aria-hidden="true" />
      <div ref={blob} className="blob appview__blob" aria-hidden="true" />

      <div className="shell appview__shell">
        <BackButton fallbackLabel="Your Account" fallbackHash={ACCOUNT_HASH} />

        <div ref={head} className="appview__head">
          <div className="kicker">
            <span className="kicker__rule" />
            <span className="kicker__label">TDG Profile</span>
          </div>
          <h1 className="h2 appview__title">{name}</h1>

          <div className="acct__identity prof__identity">
            {/* Only once the read has landed. Until then the heading above IS
                the handle — it is the only thing this page knows about the
                person — and printing it twice would read as a page that had
                lost its own name. */}
            {profile?.username && <span className="acct__handle">@{profile.username}</span>}
            {chip && (
              <span className="chips acct__tags">
                <span
                  className="chip"
                  data-standing={profile?.standing}
                >
                  {chip}
                </span>
              </span>
            )}
          </div>

          {profile?.canBio && profile.bio && <p className="prof__bio">{profile.bio}</p>}
          {profile && profile.visible && !profile.canBio && (
            <p className="prof__bio prof__bio--withheld">
              Their privacy settings don't share their bio with you.
            </p>
          )}
        </div>

        {panel.state.kind === 'checking' && (
          <div className="card acct__card">
            <p className="acct__note">Reading their profile…</p>
          </div>
        )}

        {panel.state.kind === 'signedOut' && (
          <div className="card acct__card">
            <h2 className="acct__card-title">Sign In To See Profiles</h2>
            <p className="acct__card-blurb">
              One TDG account signs you in to every app we make, and profiles are shown to people
              who have one.
            </p>
            <button type="button" className="acct__primary" onClick={onOpenAuth}>
              Sign In Or Create An Account
            </button>
          </div>
        )}

        {/* A handle nobody holds and an account a developer has hidden are
            deliberately the same answer. A different sentence for the second
            would turn this route into a way to test whether an account has
            been moderated, which is the property src/auth/README.md protects
            everywhere else on this site. */}
        {panel.state.kind === 'missing' && (
          <div className="card acct__card">
            <h2 className="acct__card-title">No Such Account</h2>
            <p className="acct__card-blurb">
              We couldn't find anybody with the username @{username}. Handles can be changed, so a
              link that used to work may be pointing at a name somebody has since let go.
            </p>
            <a className="acct__primary" href={ACCOUNT_HASH}>
              Find People
            </a>
          </div>
        )}

        {panel.state.kind === 'error' && (
          <div className="card acct__card">
            <h2 className="acct__card-title">We Couldn't Read That</h2>
            <p className="acct__card-blurb">
              Something went wrong on the way to this profile, so this is not showing you a guess
              about who they are. Try again in a moment.
            </p>
          </div>
        )}

        {profile && (
          <div className="prof__body">
            {/* Where you stand, in a sentence, before anything else. The two
                block cases are the reason this page is reachable at all, and
                a chip alone would leave the reader to work out what it means
                for what they can see. */}
            {notice && (
              <p className="prof__notice" data-standing={profile.standing}>
                {notice}
              </p>
            )}

            {isMe && (
              <p className="prof__notice" data-standing="self">
                This is your own profile, shown the way another TDG account sees it. Change what is
                on it from Privacy on your account page.
              </p>
            )}

            {/* A refusal from any of the seven verbs, in the server's own
                words, where the press was made. */}
            {panel.problem && (
              <p className="acct__problem" role="alert">
                {panel.problem}
                <button
                  type="button"
                  className="acct__problem-x"
                  aria-label="Dismiss"
                  onClick={panel.dismissProblem}
                >
                  ×
                </button>
              </p>
            )}

            {(shown.length > 0 || askRefused || isMe) && (
              <div className="prof__acts" data-busy={panel.busy || undefined}>
                {shown.map((a) => (
                  <button
                    key={a.action}
                    type="button"
                    className="appview__ghost"
                    data-tone={a.tone}
                    disabled={panel.busy}
                    onClick={() => panel.act(a.action)}
                  >
                    {a.label}
                  </button>
                ))}
                {askRefused && (
                  <p className="acct__note prof__no-ask">
                    This account is not taking friend requests.
                  </p>
                )}
                {isMe && mine?.username && (
                  <a className="appview__ghost" href={ACCOUNT_HASH}>
                    Edit Your Account
                  </a>
                )}
              </div>
            )}

            <ProfileBody profile={profile} panel={panel} />
          </div>
        )}
      </div>
    </section>
  )
}
