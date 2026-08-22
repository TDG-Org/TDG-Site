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
| `refresh()` | Ask again — after a purchase, or when the tab comes back to the front. |

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

`Store.tsx` owns that part, not this hook: it opens Stripe in a **new tab** —
navigating away would throw the wait away — then polls `refresh()` every 4
seconds for 5 minutes, and asks immediately on `visibilitychange`, because coming
back to this tab is the strongest signal there is that something happened in the
other one.

That effect depends on the pending pack alone and **never on `owned`**:
re-running on every answer would reset the deadline and poll for ever.
