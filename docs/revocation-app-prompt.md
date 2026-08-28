# Teaching a TDG app to honour a revocation

A developer can now take a product out of an account's reach from the TDG Site
Developer console (`#/dev` → Accounts → Apps): the pack — or the whole app —
stops being owned, cannot be bought again, and carries a reason and a date. The
server side is live and the shop side is done; TDG Site's Store already draws
the state.

What each app still needs is the half only it can do: **saying so.** Removing
the entitlement is enough to stop an app unlocking a feature, because every TDG
app gates on `owned_packs` and the pack leaves it. It is not enough to explain
anything — an app that simply finds the pack missing offers to sell it, which is
the one sentence a revoked account must never be shown.

**To wire an app up, paste everything below the rule into a Claude session in
that app's repo.** One session per app; the prompt is the same for all of them.
TDG Site's `src/store/useOwnedPacks.ts` and `src/components/Store.tsx` are the
reference implementation.

---

WHAT I WANT

When we have revoked a product from somebody's account, this app says so where
they would otherwise be offered it — with the reason we wrote and the date —
instead of quietly showing them a locked feature or an invitation to buy. A
revoked pack must never render as "not bought yet", and a revoked app must not
present its paid surface as available.

CONTEXT

This is a contract with another system, so the surface is stated here rather
than being discoverable in this repo. It is already applied and live in tdg-core,
the shared Supabase project this app signs into. The migration lives in the
TDG-Site repo as
`supabase/migrations/20260828235900_product_revocations_and_notices.sql`.

**One RPC**, called with this app's existing signed-in Supabase client. The
caller's identity comes from the JWT — there is no user id parameter:

- `tdg_my_revocations()` returns `(app text, pack text, reason text, created_at
  timestamptz)` — every product this account may not hold and may not buy.
  `pack` is a pack id, or `*` meaning the whole app. `reason` may be null, and
  a null reason is a real answer ("no reason was recorded"), not a missing one.
  It returns rows for EVERY TDG app, not only this one, so filter by `app`.

There is also a plain `select` policy on `public.tdg_product_revocations` for
the row's own owner, if reading the table directly suits this app better. There
is no write policy in either direction, deliberately: only
`tdg_admin_set_revocation` writes one, and only a TDG developer can call it.

WHAT A REVOCATION ALREADY DID BEFORE THIS APP SEES IT

The revoking press removed the entitlement in the same statement. For an app
with a `grants` column the grant came off and `owned_packs` re-derived without
it; for one without, the pack ids came out of `owned_packs`. So by the time this
app reads anything, the pack is genuinely not owned and every existing gate is
already correct. **Do not add a second gate.** What is being added here is the
explanation, not the enforcement — and a feature re-gated on the revocation list
would be a second authority that goes stale the moment a block is lifted.

The block also remembers exactly what it took, so lifting it puts the same grant
back with the same dates. Nothing this app does should try to restore anything.

THE BAR

- **Wherever this app would offer the product, it says the truth instead.** A
  buy button, an upsell, an "unlock this" prompt, a locked-feature tooltip —
  each of those, for a revoked product, becomes a plain statement that it is not
  available on this account, the reason we recorded, and the date.
- **Revoked is not "not bought".** They must not look alike. Somebody who never
  bought a pack should still be offered it; somebody we revoked it from must not
  be, and must not have to guess why they are being treated differently.
- **A whole-app revocation (`pack = '*'`) covers every pack in the app.** Say it
  once, up front, rather than repeating it on each locked feature.
- **A failed read changes nothing.** Only an answer from the server may make
  this app show a revocation. A timeout must leave the previous answer standing,
  the same rule this project already keeps for ownership: accusing somebody of
  something on a hiccup is worse than being a minute out of date.
- **No new gate, no new cache of what is owned.** Read it where the app already
  reads ownership, at the same moments, and hold it beside that answer.
- **The words are ours, not yours.** Print `reason` as written. It was typed by
  a developer for the person reading it. Where it is null, say that no reason
  was recorded — never invent one, and never fall back to a generic sentence
  that implies there was one.
- Match this app's own design system, both themes, keyboard reachable, and
  every state given a face.

RELATED, AND ARRIVING THROUGH A DIFFERENT DOOR

The same console can send the account a message about the change —
`tdg_my_notices()` / `tdg_notice_ack(p_id)`, exactly the shape
`tdg_feedback_inbox()` / `tdg_feedback_ack()` already has. If this app has
already implemented the feedback reply panel from
[`feedback-app-prompt.md`](feedback-app-prompt.md), showing notices in the same
panel is a small addition and worth doing in the same pass: TDG Site delivers
both through one dialog (`src/feedback/ReplyInbox.tsx`) for exactly that reason.

- `tdg_my_notices()` returns `(id bigint, app text, subject text, body text,
  created_at timestamptz)` — everything waiting and not yet acked, oldest first,
  across every TDG app.
- `tdg_notice_ack(p_id bigint)` — "they read it." Idempotent and silent. Ack it
  only when the person actually dismissed it themselves; closing on Escape or a
  scrim click must not count, so a reflex press does not cost them the message.

DONE WHEN

- A signed-in account with a revoked pack sees the reason and the date in this
  app, in the place the product would otherwise be offered, and is offered no
  way to buy it.
- An account with a whole-app revocation is told once, clearly, at the app's own
  paid surface.
- An account with no revocations sees nothing new anywhere.
- The read failing leaves the app exactly as it was, with no revocation shown.
- Both themes, narrow widths, and this app's own checks green.
