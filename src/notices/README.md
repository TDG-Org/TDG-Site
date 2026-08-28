# `src/notices/` · telling somebody what we changed about their account

| File | What it is |
| --- | --- |
| `api.ts` | The two calls: what is waiting for this account, and marking one read. |

There is no component here. The panel that draws a notice is
[`src/feedback/ReplyInbox.tsx`](../feedback/README.md), which already drew the
other thing that waits for an account, and now draws both.

> The house rules for building anything on this site are in
> [`AGENTS.md`](../../AGENTS.md). This file is authoritative for `src/notices/`.

---

## What a notice is

One message to one account about **what it owns**, written by a developer from
`#/dev` at the moment they changed it: a pack granted, a subscription ended, a
product taken out of reach.

It exists because a change somebody can see and cannot account for reads as a
fault. Before it, a developer could remove a pack and the person would open the
shop to find it gone, or find a card saying `Revoked` with a reason they had
never been told; there was nowhere at all for the explanation to live. So the
console's save bar carries one tick box — **Tell Them What Changed** — and the
words typed beside it land here.

It is **off by default**, because sending a message is the one press on that
page that cannot be taken back.

## Why it is a table and not an email

The same reason `tdg_feedback_replies` is one, and it is not squeamishness about
mail: this project has no outbound mail at all, and the entitlement path is the
last place to add a dependency that fails silently at somebody else's SMTP
server.

A notice waits in `public.tdg_notices` until the person's own app asks for it,
is shown once, and is acked when they press the button that says so. **"Sent"
and "seen" stay different facts** — which is exactly the distinction the
Feedback tab already teaches a developer to read, and it is deliberately the
same one here rather than a second, subtly different promise.

## The two calls

```ts
const waiting = await fetchNotices()   // oldest first, unseen only
ackNotice(id)                          // they pressed Got It
```

| | |
| --- | --- |
| `tdg_my_notices()` | `(id, app, subject, body, created_at)` for this account, unseen, oldest first, capped at twenty. |
| `tdg_notice_ack(id)` | Sets `seen_at`, once. Idempotent, and only ever your own row. |

Both are **opportunistic**. A failed read answers an empty list rather than a
state, because nothing here is urgent enough to earn an error surface on a
marketing page, and a panel that could fail to open is better than one that
opens to say it could not open.

`ackNotice` returns nothing and is fire-and-forget. Note the `.then()` inside
it: `void supabase.rpc(…)` on its own compiles, runs, and dispatches nothing,
because the builder is lazy. `feedback/api.ts` documents the same trap beside
its own ack — it is the kind of bug that looks like it works.

## Where it is written

`tdg_admin_notify(p_target, p_app, p_subject, p_body)`, guarded by
`tdg_admin_uid()` like every other privileged verb, called from
[`src/dev/api.ts`](../dev/README.md). It is its own verb rather than a flag on
every entitlement function for two reasons: the **words** are the point and a
status column cannot produce them, and a signature that never grows means adding
the tick box to another panel is a client edit rather than a migration.

Every notice also writes a line to the audit log, so *"did anybody tell them?"*
is answered in the same place as *"who changed it?"*.

There is no client write policy on `tdg_notices` in either direction. The
boundary is the function and only the function (`AGENTS.md` rule 12).

## Seen means SEEN

`ReplyInbox` acks only from **Got It**. Escape and the scrim close the panel
without acking, so a reflex dismissal costs nothing and the message comes back
next visit. That is not politeness: the console shows a developer whether a
notice has been seen, and a panel that acked on close would make that reading a
lie about whether anybody read it.

## Adding a notice from somewhere else

Nothing stops another `tdg_admin_*` verb calling `tdg_admin_notify` — but prefer
the tick box. A notice sent automatically by a function is a message nobody
chose the words of, and the reason this exists at all is that the words are the
part a status column cannot produce.

The contract for teaching another TDG app to show these is in
[`docs/revocation-app-prompt.md`](../../docs/revocation-app-prompt.md), which
carries the notice half alongside the revocation half — they arrive together and
an app implementing one should do the other in the same pass.
