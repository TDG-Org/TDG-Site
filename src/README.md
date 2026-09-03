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

One `useRoute()` call decides which of seven things is on screen:

| Route | What renders |
| --- | --- |
| `home` | Hero, Origin, Apps, Tools, Games, Faith, Outro — the one-page scroll |
| `#/about` | `About`, lazily |
| `#/store` · `#/store/<app>` | `Store`: its index of app cards, or one app's own page of packs |
| `#/account` | `AccountPage`, lazily — **not gated**: a signed-out reader is told to sign in, on the page they asked for |
| `#/user/<handle>` | `ProfilePage`, lazily, keyed on the handle so one profile to the next remounts |
| `#/app/<slug>` | `AppPage`, lazily |
| `#/dev` | `DevConsole`, lazily, **and only for a signed-in TDG developer** |

Nav, Footer, Cursor and AuthModal render on every route, and so do the two
feedback surfaces: `FeedbackDialog` (opened from Send Feedback in the account
menu) and `ReplyInbox`, which renders nothing until a developer's reply is
actually waiting for the signed-in account. See
[`feedback/README.md`](feedback/README.md).

**Seven lazy chunks, for three different reasons.** `AppPage`, `About`,
`AccountPage` and `ProfilePage` are pages a visitor may never open, and one who
reads the landing page and leaves should not download a word of them.
`DevConsole` is lazy so its panels, labels and table names are never in the
bundle everyone gets — tidiness, not a lock; the lock is in Postgres. See
[`dev/README.md`](dev/README.md). The last two are scenery: `hero/PointCloud`,
split from `Hero.tsx` itself because the model and its twelve form definitions
are the largest thing on the page and none of it is needed to paint the hero,
and `origin/CabinScene`, split from `Walk.tsx` because it carries three.js. All
seven ship as `assets/<hash>.js` — `vite.config.ts` says why the names are
anonymous.

**And every one of them renders inside an `ErrorBoundary`**
([`components/ErrorBoundary.tsx`](components/ErrorBoundary.tsx)), because a
deploy replaces the whole set of hashed files and a tab opened before it will
404 on the next chunk it asks for. Without a boundary that rejection unmounts
the root — a blank page with no words. The five pages get a face with a Reload
button; the two pieces of scenery are `silent` and simply leave their section
without them.

**Where the page lands is decided in two effects in `App.tsx`, over
`lib/route.ts` and `lib/anchors.ts`.** A page change scrolls `instant`, never
smooth: the document's own `scroll-behavior: smooth` makes arriving at the Store
from halfway down the home page look like the new page sliding up under you
rather than like opening a page. Returning from an app page lands back at the
exact scroll position the card was clicked from, and only when the hash is the
one that was left — see `lib/route.ts`.

A **section anchor** lands on that section's heading, clear of the fixed nav,
whether it arrives as a shared link, a bookmark or a nav click on the page you
are already reading — never on the section's box top, which on the cabin walk is
up to 452px of camera padding above the heading. See
[`lib/README.md`](lib/README.md) for why that is JS and not `scroll-margin-top`.

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
| `people/` | The `#/user/<handle>` page: somebody else's account, and what a block looks like when it is said out loud | [→](people/README.md) |
| `badges/` | Global account badges, and the account count the footer prints | [→](badges/README.md) |
| `feedback/` | Send Feedback, and the panel that delivers our replies | [→](feedback/README.md) |
| `store/` | Which packs an account owns | [→](store/README.md) |
| `content/` | The site-content overlay: what the Developer console has changed about our products, applied without a deploy | [→](content/README.md) |
| `live/` | What GitHub can confirm about a product at runtime: which apps have a live deploy, and org repositories the catalogue has not been taught | [→](live/README.md) |
| `cloud/` | TDG Cloud's account surface — plans, usage, hosted files — built complete and shipped switched off | [→](cloud/README.md) |
| `notices/` | Telling somebody what we changed about their account | [→](notices/README.md) |
| `theme/` | The theme wave and `data-theme` | [→](theme/README.md) |
| `dev/` | The internal Developer console | [→](dev/README.md) |

## Two rules that decide most edits

**A catalogue is data.** If you are typing an app's name, a price, a chip, a
status or a paragraph of a guide into a `.tsx`, stop — it belongs in `data/`. A
section's own kicker, heading and lede stay with the section that draws them;
[`data/README.md`](data/README.md) has the line and why it falls there.

**Colour is a token.** If you are typing a `#hex` into a `.css` file, stop — it
belongs in `styles/tokens.css`, and it needs a light value too.
