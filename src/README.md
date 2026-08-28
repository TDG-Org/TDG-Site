# `src/` · the site

A React 19 + TypeScript single page, hand-written CSS, no framework. Start at
[`AGENTS.md`](../AGENTS.md) in the repo root for the rules; this file is the map.

---

## The shape of it

`main.tsx` mounts three providers and nothing else:

```
ThemeProvider  →  AuthProvider  →  App
```

Globals are imported first (`styles/tokens.css`, then `styles/base.css`) so they
land ahead of component CSS in the bundle. Component overrides are written as
compound selectors anyway, so the order is belt-and-braces rather than the only
thing holding the cascade together.

`guardChrome()` runs **before** the first render, so an extension that repaints a
field never gets a frame where its version is the one on screen.

## What App.tsx does

One `useRoute()` call decides which of five things is on screen:

| Route | What renders |
| --- | --- |
| `home` | Hero, Origin, Apps, Tools, Building, Faith, Outro — the one-page scroll |
| `#/about` | `About`, lazily |
| `#/store` · `#/store/<app>` | `Store`: its index of app cards, or one app's own page of packs |
| `#/app/<slug>` | `AppPage`, lazily |
| `#/dev` | `DevConsole`, lazily, **and only for a signed-in TDG developer** |

Nav, Footer, Cursor and AuthModal render on every route, and so do the two
feedback surfaces: `FeedbackDialog` (opened from Send Feedback in the account
menu) and `ReplyInbox`, which renders nothing until a developer's reply is
actually waiting for the signed-in account. See
[`feedback/README.md`](feedback/README.md).

**Four lazy chunks, for three different reasons.** `AppPage` and `About` are a
lot of prose, and a visitor who reads the landing page and leaves should not
download a word of it. `DevConsole` is lazy so its panels, labels and table
names are never in the bundle everyone gets — tidiness, not a lock; the lock is
in Postgres. See [`dev/README.md`](dev/README.md). The fourth is
`hero/PointCloud`, split from `Hero.tsx` itself: the model and its twelve form
definitions are the largest thing on the page and none of it is needed to paint
the hero. All four ship as `assets/<hash>.js` — `vite.config.ts` says why the
names are anonymous.

**Scroll restoration lives in one effect in `App.tsx`.** A page change scrolls
`instant`, never smooth: the document's own `scroll-behavior: smooth` makes
arriving at the Store from halfway down the home page look like the new page
sliding up under you rather than like opening a page. Returning from an app page
lands back at the exact scroll position the card was clicked from, and only when
the hash is the one that was left — see `lib/route.ts`.

## The folders

| Folder | What it owns | README |
| --- | --- | --- |
| `data/` | The catalogue and every page drawn from it, plus the shop | [→](data/README.md) |
| `components/` | Every rendered surface, one `.tsx` + one `.css` each | [→](components/README.md) |
| `styles/` | The palette (`tokens.css`) and the primitives (`base.css`) | [→](styles/README.md) |
| `lib/` | Routing, the frame loop, sections state, Supabase, asset paths | [→](lib/README.md) |
| `hooks/` | Reveal, tilt, parallax, hero parallax, offscreen pause | [→](hooks/README.md) |
| `auth/` | Sign-in, the profile, session revocation, refusal wording | [→](auth/README.md) |
| `account/` | The `#/account` page: the account's facts, its counters, and who may see each part of it | [→](account/README.md) |
| `badges/` | Global account badges, and the account count the footer prints | [→](badges/README.md) |
| `feedback/` | Send Feedback, and the panel that delivers our replies | [→](feedback/README.md) |
| `store/` | Which packs an account owns | [→](store/README.md) |
| `theme/` | The theme wave and `data-theme` | [→](theme/README.md) |
| `dev/` | The internal Developer console | [→](dev/README.md) |

## Two rules that decide most edits

**A catalogue is data.** If you are typing an app's name, a price, a chip, a
status or a paragraph of a guide into a `.tsx`, stop — it belongs in `data/`. A
section's own kicker, heading and lede stay with the section that draws them;
[`data/README.md`](data/README.md) has the line and why it falls there.

**Colour is a token.** If you are typing a `#hex` into a `.css` file, stop — it
belongs in `styles/tokens.css`, and it needs a light value too.
