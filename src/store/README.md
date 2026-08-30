# `src/store/` · what this account owns, and what it can do about it

| File | What it is |
| --- | --- |
| `useOwnedPacks.ts` | The read: which packs this account holds, and how it holds each one. |
| `grant.ts` | What "how it holds it" MEANS — the shape, and the sentence the card prints. |
| `billing.ts` | The write: change a plan, stop the renewals, start them again. |
| `sale.ts` | Whether a pack may be bought AT ALL — which is a question about the app, not the account. |

```ts
const { stateFor, owned, grantFor, revokedFor, refresh } = useOwnedPacks()
```

| | |
| --- | --- |
| `stateFor(appId)` | That shelf's state: `loading` · `signedOut` · `ready` · `error`. An id no app claims stays `loading`, never `ready`. |
| `revokedFor(app, pack?)` | The standing block on that product, or null. Omit the pack to ask about the whole app; a whole-app block answers for every pack in it. |
| `owned` | A set of `packKey(app, pack)` strings. Meaningful once that app's shelf is `ready`. |
| `grantFor(app, pack)` | The `grants` entry for one pack, or `null` when that app records none. Never a substitute for `owned`. |
| `refresh()` | Ask again, now. The hook already asks on its own (see below); this is for a caller that knows something changed. |

The catalogue it reads against is [`../data/store.ts`](../data/README.md). The
card that renders the answer is `components/Store.tsx`.

---

## Two columns, and only one of them decides anything

`owned_packs` is the answer: a plain `text[]` of pack ids, and the only thing the
apps gate on. `grants` is the *reason*: an object keyed by pack id saying HOW
each one is held — bought outright, or subscribed, with Stripe's status, the end
of the period paid for, and whether it is set to stop at the end of it.

**`owned_packs` is DERIVED from `grants` by a trigger in tdg-core**, through
`<app>_packs_in_force()`. That function is the authority and the app asks the
same one. Nothing in this folder decides whether a pack is in force; `grant.ts`
only decides what sentence to print beside it, which is why a browser with a
wrong clock can word a date badly and can never grant or remove a pack.

**Not every app has a `grants` column.** DevFleet's table does not, because
DevFleet sells nothing with a clock on it. The hook does not write that fact
down anywhere — it ASKS for the column and reads the server's own refusal
(PostgREST `42703`), remembering the answer per table for the life of the tab.
A schema fact typed into a catalogue goes stale the day the column is added, and
it fails in the direction that hides a subscription.

## What a revocation is, and why it is not the absence of a grant

A developer can put a product out of an account's reach from `#/dev`: the pack —
or the whole app — stops being owned, and cannot be bought back. The row lives in
`tdg_product_revocations` and this hook reads it through `tdg_my_revocations()`,
over the same RLS the account's own app reads it through, so the shop and the app
cannot give different answers about the same decision.

**It is its own card state and not a variant of `buy`.** A pack that lapsed is
unowned and the shop should sell it again; a revoked one is unowned and must
never be offered. The two are the same absence and opposite decisions, and a
card that fell back to Buy would be taking money for something the database has
already decided to refuse. So `Store.tsx` draws `revoked` before it draws
anything else, with the reason we recorded and the date — the only surface the
person it is about will ever read it on.

The block also removed the entitlement when it went on, and remembers exactly
what it removed, so lifting it restores the same grant with the same dates.
Nothing in this folder writes any of that; it reads the answer.

**A failed read is not a revocation.** The blocks are held apart from ownership
for that reason: a refusal leaves the last answer standing rather than accusing
somebody of something on a hiccup, which is the same rule the ownership read
keeps one paragraph up.

## And the shop can be shut for reasons that are nothing to do with the account

`sale.ts` answers a different question from everything above it: not *may THEY
have this*, but *may ANYBODY buy it yet*. A pack is a key, and this shop does not
sell keys to doors that do not exist — so a pack whose app has not shipped has
no Buy button, and `Store.tsx` draws `closed` instead.

```ts
const sale = useSaleState(app)          // 'open' | 'soon' | 'down'
const words = saleWording('soon', 'TDG Veditor')   // { name, line, short }
```

**It is derived from the same answer the app's own card uses**, in this order: a
hand-written access on the resolved card (a `download`, including one the
Developer console's Content tab has set — a human decision, and the runtime
never argues with one), then `released` in the catalogue, then `src/live/`'s
runtime read of GitHub. Launch day therefore opens the shop with nothing here
edited and no deploy.

**`released` may only ever RAISE the answer.** `src/live/` is allowed to fail —
GitHub rate-limits, and it returns the same `null` for "never shipped" as for
"could not ask" — so a hiccup must never be able to close a launched app's shop.
The written floor is what stops it. In the other direction nothing is needed:
"could not ask" is not a confirmed way in, so it sells nothing, which is the
safe end of the same trade.

`down` is kept apart from `soon` for the reason [`../live/`](../live/README.md)
keeps them apart: telling somebody who used the app yesterday that it has not
launched is a lie by omission, and the shop has no more licence to tell it than
the card does.

**Shut means the shop, never the account.** `closed` replaces `buy` and
`signedOut` and nothing else, so `owned` still says Owned, a failed ownership
read still says the read failed, and **Manage or Cancel Plan** is drawn on every
current subscription whatever the shelf is doing. A shop that could stop
somebody cancelling by going off sale would be the dark pattern rule 11 exists
to forbid, wearing a launch date.

## What a standing is

`standingOfGrant(grant)` turns a grant into one of seven readings — `perpetual`,
`active`, `trial`, `ending`, `dunning`, `lapsed`, `unknown` — each with a Title
Case label, one sentence-case line, and whether there is a live Stripe
subscription behind it to act on.

`unknown` is not a gap. It is what a grant written by an app newer than this page
looks like, and it renders as a real state saying exactly what is known, because
**a state a reader can reach and cannot read is a bug**.

`manageable` is false for a subscription grant with no `subscriptionId` on it —
which is what a pack granted by hand from `#/dev` looks like. That flag answers
whether a Stripe action has an id to act on; it does not answer whether the
account holder may open the management panel. Every current subscription
standing draws **Manage or Cancel Plan** for every account. A missing id is
named inside it as **Billing Link Missing**, so broken billing data is visible
without Developer permission controlling a customer-facing cancellation route.

The catalogue is the authority on whether a pack can recur. `Store.tsx` ignores
subscription-shaped metadata on a one-time pack, so an old malformed Theme Pack
grant cannot grow subscription controls or describe a one-time purchase as
renewing.

## Changing and cancelling

`billing.ts` talks to the `tdg-site-billing` Edge Function
([`supabase/README.md`](../../supabase/README.md)). The request carries an app id
and a pack id and nothing else that matters: the account comes from the caller's
own access token, and the Stripe customer and subscription come from that
account's own row. **A body naming somebody else's subscription changes nothing**,
because no field of it is ever passed to Stripe.

- `openBilling({ intent: 'update' })` — Stripe's own plan picker, prorated.
- `openBilling({ intent: 'billing' })` — the card on file and past charges.
- `setRenewal({ renew: false })` — `cancel_at_period_end`, never "cancel now".

**Cancelling takes nothing away that day.** Stripe leaves the subscription
`active` until the period ends, and `<app>_packs_in_force()` keeps it in force
while that is true — so the pack goes on working, in the app as well as here,
for every day already paid for. The card names the date; the database is what
makes it true.

Nothing here writes `<app>_entitlements`. That table has exactly one writer —
the app's own Stripe webhook, from Stripe's own events. The cancel lands at
Stripe, `customer.subscription.updated` follows within seconds, the webhook
writes the grant, and `refresh()` reads it back. The card shows Stripe's own
answer in the meantime and drops it the moment the grant arrives.

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

A cancel or a resume calls `refresh()` once rather than starting a watch, because
that round trip is seconds rather than a payment's minutes — and the card is not
waiting on it in any case: it renders Stripe's own answer immediately and lets
the grant replace it.
