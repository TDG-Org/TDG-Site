# `src/people/` · somebody else's TDG account

One TDG account signs you in to every app we make. This folder is the page that
shows you **somebody else's** — who they are, where you stand with them, and
whatever they have chosen to share.

`src/account/` is the other half and is about *you*: your fields, your
counters, your privacy, your four lists of people. This one is about *them*.
The line between the two is what stops a page called "your account" quietly
becoming a page about everybody.

The server half is
[`supabase/migrations/20260828230000_tdg_people_and_profiles.sql`](../../supabase/migrations/README.md).

> The house rules are in [`AGENTS.md`](../../AGENTS.md). This file is
> authoritative for `src/people/`.

| File | What it is |
| --- | --- |
| `api.ts` | Two reads: `profileAt` and `profileFriends`. No writes — see below. |
| `usePerson.ts` | `usePerson(handle)` — the read, the press, and the re-read after it. |
| `ProfilePage.tsx` | The page at `#/user/<handle>`, in its own lazy chunk. |
| `Profile.css` | Only what is new here: the head, the standing banner, the friend links. |

```ts
const panel = usePerson('luke')
// panel.state: 'checking' | 'signedOut' | 'missing' | 'error' | 'ok'
```

## The route is a handle, and it is not gated

`#/user/<handle>`, parsed in [`../lib/route.ts`](../lib/README.md). The variable
part is a **username** rather than an id, because this is the one route on the
site somebody types, says out loud and pastes to a friend — and a uuid in the
address bar tells a reader nothing about where they are. The hash is
lower-cased with the rest, so `#/user/Rose` and `#/user/rose` are one page
rather than two.

It renders for anybody, including a signed-out reader who followed a link, who
is told to **sign in, in words, on the page they asked for**. That is
`#/account`'s rule and the opposite of `#/dev`'s: a page linked from every
friend card and every search result must not answer "is there something here?"
with silence.

What they may then SEE is decided in Postgres and nowhere else (AGENTS.md rule
12). `tdg_profile_at` is granted to `authenticated`, because it names a person,
and every function on this project that names a person is.

**A profile with no handle has no address.** `userHash` is built from a
username and there is no second route, so every surface that draws a person
draws the card without a link rather than a link to `#/user/`.

## The page always opens. What is on it does not loosen by one column.

This is the whole design, and it is the one thing not to undo.

Before this folder existed, `tdg_find_profile` answered **nothing** for an
account that had blocked you: the handle read as free, the page read as absent,
and the site had no way to tell you the difference between *no such person* and
*that person blocked you*. A block is a real answer, and hiding it is not
kindness — it is the reader concluding the site is broken and going off to check
a spelling that was right.

So `tdg_profile_at` resolves a handle whoever holds it. The page draws a name, a
handle, a standing chip and a sentence. **Every content key still goes through
`tdg_can_view`**, which still refuses everything to somebody who has been
blocked, so a blocked reader gets an identity, an explanation, and nothing else.
The block keeps everything it was ever protecting; it stops being a lie.

The four cases, and what each draws:

| Standing | Chip | The page |
| --- | --- | --- |
| `blocked` — you blocked them | `Blocked` | Everything their privacy allows, plus **Unblock**. Their settings decide the content; your block does not hide them from you. |
| `blocked_by` — they blocked you | `Blocked You` | Identity, the sentence, and nothing else. No actions: there is nothing you can do about it, and a greyed-out Add Friend would be the page pretending otherwise. |
| profile is `friends` or `self` and you are not allowed | none | Identity, a card saying so, and any contact action still open — `friend_requests` is a `contact` key and is **not** gated by the profile key above it. |
| hidden or deleted by a moderator | — | **Nothing.** `tdg_is_findable` gates every read, so it answers exactly what an unheld handle answers. Moderation is not a block and does not soften. |

## Every withheld section says why it is empty

A missing badge row could mean *no badges* or *not shown to you*, and those are
different sentences about a person. `tdg_profile` sends **both facts** — the
value AND the `can*` flag that decided it — precisely so this page never has to
guess, and a section drawn from a false flag says so instead of looking like a
page that failed to load.

The sentence never claims to know WHICH setting did it. The server answers "may
you see this" and deliberately does not answer "because it is friends-only" —
telling a stranger that a thing is friends-only is itself a fact about the
account, and a page that leaked it one section at a time would be a privacy
screen with a side door.

## One round trip for the head, a second for the names

`tdg_profile` answers the identity, the standing, all eight visibility flags,
the counters and the badge/app/streak lists **together**. One call because a
profile that lands in eight pieces reads as a page still loading, and because
eight calls can disagree with each other: a friends list from a world where you
were still friends, under a header from a world where you are not.

The friends' NAMES are a second read (`tdg_public_friends`), made only once the
head has said there are any. `friendCount` is counted from that same query
server-side rather than from `friend_ids`, so the number and the list can never
disagree — that function drops a friend whose own profile you may not open, and
a heading saying 8 over a list of 5 is a page that looks broken.

## The writes are not in this folder

Adding, accepting, declining, withdrawing, unfriending, blocking and unblocking
are `socialAct` in [`../account/api.ts`](../account/README.md), imported rather
than repeated. They are one mechanism with one set of refusals, and a second
copy of the seven verb names is the beginning of two surfaces disagreeing about
what a press does.

**Which buttons appear comes from [`../account/standing.ts`](../account/README.md)**,
shared with the Account page's person cards for the same reason. Bible
Educator's profile page once drew all seven and let the server refuse five —
five buttons that looked like actions and were guaranteed to be errors — and
that is the mistake one table exists to make impossible.

A press runs the verb and then reads the profile again, rather than patching the
standing. One action changes what may be SEEN as well as where you stand:
accepting a request opens every `friends`-audience section on the page at once,
and blocking closes the lot. A locally-patched standing would leave a page whose
buttons say Unfriend over sections still drawn for a stranger.

## Five states, and `missing` is not `error`

`checking` · `signedOut` · `missing` · `error` · `ok`.

The pair that matters is the middle two. **A handle nobody holds and a read that
failed must never draw the same sentence.** "There is no @rose" is a fact about
the world; "we couldn't reach the server" is a fact about this browser, and
telling somebody the first when the second happened sends them off to check a
spelling that was right. It is the rule
[`../store/useOwnedPacks.ts`](../store/README.md) settled and
[`../badges/`](../badges/README.md) repeats, one step further: here the invented
answer is not "you own nothing", it is "that person does not exist".

A handle nobody holds and an account a developer has hidden ARE the same answer,
deliberately. A different sentence for the second would turn this route into a
way to test whether an account has been moderated.

## It wears the Account page's clothes

`AppPage.css` arrives with `BackButton` and gives this page its shell, head,
grid texture, blob and ghost buttons — the decision `About.tsx` records and
`AccountPage.tsx` repeats. `Account.css` is imported for the second layer: the
counters, the badge chips, the streak rows, the app facts, the notes and the
refusal banner. Every one of those draws the **same fact** here as it does on
your own account, and a second set of lookalike tiles is how two surfaces
showing one thing start disagreeing about what it looks like.

`Profile.css` holds only what is genuinely new, and it contains no colour
literal: every value is a token, so both themes resolve (rules 2 and 3).

## Nothing here names an app

`apps` and `streaks` arrive keyed by whatever has written a row, in the same
shape `tdg_my_account_stats` answers, and are drawn through
[`../account/appNames.ts`](../account/README.md) — so a product added tomorrow
appears on every profile with no migration, and nobody is ever told they have a
`Bea` streak (rule 17).

## Rules for changing anything here

- **Never widen what is shown.** Every `can*` is the server's answer, carried
  through untouched. Do not infer one from another, do not hide a section
  because a value came back null, and never move a visibility decision into
  this folder.
- **Never make the page refuse to open.** A block, a private profile and an
  empty profile are three sentences; only moderation is silence.
- **Never draw a button for a standing that cannot use it.** `actionsFor` is
  the one table, in `src/account/standing.ts`.
- **Never build a profile URL from anything but a username**, and never render
  a link for an account that has none.
- The server's refusals are **shown, not rewritten** — they are worded to be
  read.
