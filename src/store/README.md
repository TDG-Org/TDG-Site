# `src/store/` · what this account owns

One hook, `useOwnedPacks()`. It answers the only question the shop needs a server
for: which packs has this account already bought?

```ts
const { stateFor, owned, refresh } = useOwnedPacks()
```

| | |
| --- | --- |
| `stateFor(appId)` | That shelf's state: `loading` · `signedOut` · `ready` · `error`. An id no app claims stays `loading`, never `ready`. |
| `owned` | A set of `packKey(app, pack)` strings. Meaningful once that app's shelf is `ready`. |
| `refresh()` | Ask again, now. The hook already asks on its own (see below); this is for a caller that knows something changed. |

The catalogue it reads against is [`../data/store.ts`](../data/README.md). The
card that renders the answer is `components/Store.tsx`.

---

## Where the answer comes from

Straight from each app's `<app>_entitlements` table over RLS. Every one of those
grants the owner `select` on their own row and carries **no client write policy
at all**, so this is a read of the same row the app itself reads and the same row
that app's Stripe webhook writes. One answer, three readers.

**Ownership is never decided in this repo.** Nothing here can grant a pack, and
that is the point.

## Four states, and why "could not read" is one of them

A shop must never draw *"you do not own this"* from a failed request. Telling
somebody they have not bought what they have bought is the one mistake this page
cannot make, so an error is its own state and the card says the reading failed
rather than offering to sell it again.

**An absent row is not an error.** It is the ordinary answer for an account that
has never bought anything.

## The state is per app, because the tables are

Each app owns its own entitlements table deliberately, for isolation on a money
path — two products behind one table means a schema change made for one can break
the other's purchases. So each read can fail on its own, and each shelf answers
for itself.

Folded into one state, a hiccup reading Veditor's table would hide DevFleet's
prices behind a failure that has nothing to do with it. Every shelf speaks for
itself and for nobody else.

## Ownership is keyed per app too

Both apps sell a pack whose id is `themes`. `owned` therefore holds
`packKey(app, pack)` and **never a bare pack id**. The alternative is buying one
Theme Pack and being told you own the other.

## Ownership goes both ways, so the hook keeps asking

A pack can stop being owned: a refund, a chargeback, a subscription that lapses,
or a developer revoking it from `#/dev`. **None of those happen in this tab, and
none of them tell it anything.**

This used to be read once on mount and then only while a checkout was open,
which made ownership one-way for the life of the page. A pack revoked while the
shop sat open went on reading **Owned**, with no buy button, until somebody
reloaded — the mirror image of the mistake the four states above exist to
prevent, and the one that was actually shipping.

So the hook re-asks at the moments a person would expect an answer: the tab
coming back to the front, the window taking focus, the network returning, and
otherwise every five minutes. That is the same set
[`../auth/sessionGuard.ts`](../auth/README.md) settled on, for the same reason —
**foreground is the one that matters**, because clicking back onto the shop after
changing something elsewhere is exactly when it has to be right.

Only while signed in. A signed-out shelf has nothing to re-read, and a timer
firing for every visitor who never signs in is a request per tab per five minutes
to be told the same nothing.

**A re-check that fails changes nothing.** Only the *first* read of a shelf may
turn it red; once a shelf has answered, a later failure says nothing new — the
connection dropped, the tab woke mid-suspend — and replacing a settled answer
with "we couldn't check" would punish the reader for our own hiccup. Same rule
`sessionGuard` keeps: only an answer *from* the server changes anything.

**This lives in the hook and not in `Store.tsx` on purpose.** Keeping the answer
fresh is part of owning the answer. It sat in the page before, gated behind a
checkout, which is how it came to be missing for every other way a pack can
leave an account.

## Four details that look like noise and are not

- **`refresh()` bumps a counter** rather than calling the query directly, so a
  refresh that lands after the user signed out cannot revive stale packs.
- **`loadedFor` tracks whose answers are on screen.** A refresh for the same
  account keeps them until the new ones land; a *different* account starts from
  nothing, so switching users can never show the previous person's purchases for
  a frame.
- **An app's keys are replaced, not merged.** A pack that was refunded or
  revoked has to be able to leave the set, and a merge would make ownership
  one-way for as long as the tab is open.
- **The shelves are queried in parallel and land independently.** One table
  refusing must not hold up another, or answer for it.

## The watch after a buy

`Store.tsx` owns that part, not this hook, and it is a different job from the
re-asking above: this one has a **deadline**. It opens Stripe in a **new tab** —
navigating away would throw the wait away — then polls `refresh()` every 4
seconds for 5 minutes, so a pack the webhook lands appears within seconds rather
than at the next foreground.

That effect depends on the pending pack alone and **never on `owned`**:
re-running on every answer would reset the deadline and poll for ever.
