# AGENTS.md · building on the TDG site

**Read this before you change a file.** It is written for an AI assistant
arriving cold — Claude, Codex, Cursor, Copilot, Gemini, anything — with no
memory of how this site got the way it is. Every rule below exists because
breaking it has a visible cost, and the cost is named beside the rule.

The short version, if you read nothing else:

> **The structure and the interface are the product. You extend them; you do not
> restyle them, simplify them, or replace them with something you would have
> chosen.** A change that looks like the rest of the site and is written the way
> the rest of the site is written is the only kind that ships here.

---

## 1 · Orientation

| | |
| --- | --- |
| **Stack** | React 19 · TypeScript 5.9 · Vite 7. Hand-written CSS, **no framework**, no CSS-in-JS, no component library. |
| **Backend** | Supabase (`src/lib/supabase.ts`), shared with the other TDG apps. See `supabase/README.md`. |
| **Hosting** | GitHub Pages, from `main`, at `/TDG-Site/`. Push to `main` deploys — see `.github/workflows/deploy.yml`. |
| **Router** | Hash routes, hand-rolled in `src/lib/route.ts`. No router library. |
| **State** | React context and hooks. No Redux, Zustand, Jotai, React Query, or anything else. |
| **Tests** | **There are none.** The typecheck and the build are the entire safety net. Read §7 before you claim anything works. |

```bash
npm install && npm run dev
```

| Command | What it is |
| --- | --- |
| `npm run dev` | Vite dev server on `http://localhost:5180`. |
| `npm run typecheck` | `tsc -b --noEmit`. Must be silent. |
| `npm run build` | `tsc -b && vite build`. Must be green. The 500 kB chunk warning is pre-existing and expected. |
| `npm run preview` | Serves the production build, so it sees the real `/TDG-Site/` base path. |

Copy `.env.example` to `.env.local` and fill in the two Supabase values, or the
app throws on boot by design. The publishable key is not a secret; the
protection is RLS on the server.

### Where things live

| Path | What it is | Its own README |
| --- | --- | --- |
| `src/data/` | **All page copy and catalogue data.** Prices, app pages, About, the Store's prose. | [`src/data/README.md`](src/data/README.md) |
| `src/components/` | Every rendered surface, one `.tsx` + one `.css` per component. | [`src/components/README.md`](src/components/README.md) |
| `src/styles/` | `tokens.css` (the palette) and `base.css` (the shared primitives). | [`src/styles/README.md`](src/styles/README.md) |
| `src/lib/` | Routing, the animation loop, sections state, Supabase client, asset paths. | [`src/lib/README.md`](src/lib/README.md) |
| `src/hooks/` | The four motion hooks every card and section uses. | [`src/hooks/README.md`](src/hooks/README.md) |
| `src/auth/` | Sign-in, the profile, session revocation, and what a refusal says. | [`src/auth/README.md`](src/auth/README.md) |
| `src/store/` | Reading which packs an account owns. | [`src/store/README.md`](src/store/README.md) |
| `src/theme/` | The theme wave and the `data-theme` attribute. | [`src/theme/README.md`](src/theme/README.md) |
| `src/dev/` | The internal Developer console at `#/dev`. | [`src/dev/README.md`](src/dev/README.md) |
| `supabase/` | The edge function and the SQL migrations. Not part of the bundle. | [`supabase/README.md`](supabase/README.md) |

**A folder's README is authoritative for that folder.** Read it before editing
anything inside, and update it in the same commit as any change to that
folder's public surface. If a README disagrees with the code, the code wins —
fix the README.

---

## 2 · The fifteen rules

### 1. Content is data. It is never a component.

Every word a visitor reads lives in `src/data/`. `AppPage.tsx` knows nothing
about any particular app; it renders whatever `appPages.ts` holds. Adding an app
is an entry in `APP_PAGES` plus a `page:` on its card in `content.ts`. Fixing a
line of a guide is one string.

**Never** hardcode copy into a component, and never add a component whose only
job is to render one app's content. Ten pages stay consistent with each other
precisely because one component draws all of them.

### 2. Never write a colour, and never write a second one.

Every colour comes from a token in `src/styles/tokens.css`: `--bg`, `--bg2`,
`--surface`, `--text`, `--muted`, `--faint`, `--border`, `--border-hover`,
`--accent`, `--accent-soft`, `--warm`, `--invert-bg`/`--invert-fg`,
`--live-fg`/`--live-bg`/`--live-border`. Need a variant? `color-mix(in srgb,
var(--token) N%, transparent)`, the way `AppPage.css` does.

A literal hex in a component stylesheet is a bug even when it looks right,
because it will be right in exactly one theme.

### 3. Both themes, always, and never a colour defined only in one place.

Dark is the default on `:root`. Light is `[data-theme='light']`. If you add a
token you add both. Verify both — see §7; a value that only resolves correctly
in the theme you happened to be looking at is the single most common way a
change here breaks.

### 4. Reuse the primitives before you invent one.

`base.css` already owns: `.page`, `.shell`, `.section`, `.section--blend`,
`.kicker`, `.h2`, `.lede`, `.chip` / `.chips` / `.chip--hot`, `.card` with its
`.card__spot` / `.card__edge` / `.card__cover`, `.badge`, `.sr-only`. A section
that does not open with a `.kicker` and a `.h2` inside a `.shell` will not look
like this site. A box that is not a `.card` will not tilt, will not light its
edge, and will read as foreign the moment the cursor passes it.

`.card` is `overflow: hidden` with `transform-style: preserve-3d`, and
`base.css` forces every direct child to `position: relative`. **An absolutely
positioned overlay inside a card must be a grandchild** — anchor it to an inner
wrapper, not to the card itself. `Store.tsx`'s plan chooser is the worked
example.

### 5. Custom-style every interactive element and every state.

Nothing on this site ships wearing the browser's default look: not a select, not
a checkbox, not a scrollbar, not a stepper arrow, not a focus ring, not an
autofilled field. `base.css` already handles form controls and the autofill
highlight; `src/lib/chromeGuard.ts` handles extensions that try to repaint them.

Empty, loading and error states count as states. The Store card has six —
`checking` · `signedOut` · `error` · `owned` · `waiting` · `buy` — and a fixed
`min-height` so it never changes size as answers arrive; a shelf that jumps as
answers land reads as a page still loading.

### 6. Symmetry is structural, never hand-tuned.

Anything paired or mirrored — two cards on a shelf, a header's left and right
clusters, a panel and the card it sits in — takes its padding, gaps, sizes and
radii from **one** set of variables on the common parent, applied in mirror
image. Never a literal on one side and a different literal on the other.

When you change one side, **measure the rendered result on both** and assert
they match. A lopsided pair is a bug even when neither number looks wrong alone.

### 7. Title Case for names. Sentence case for everything else.

Buttons, tabs, section titles, menu items, toggles, feature names, chips and
plan labels are **Title Case**: `Buy Theme Pack`, `Choose a Plan`, `Expand All`.

Descriptions, hints, helper text, errors and toasts are **sentence case**:
`Secure checkout by Stripe. Opens in a new tab.`

Proper nouns and acronyms keep their own form regardless — `TDG`, `Stripe`,
`FFmpeg`, `MARANATHA`.

### 8. Routes are hashes, and every route carries a leading slash.

`#/about`, `#/store`, `#/store/<app>`, `#/app/<slug>`, `#/dev`. The slash is not
decoration: `#store` and `#story` are one letter apart, and a route that ate a
section anchor would break the one-page scroll. Any new route gets the slash and
puts its variable part behind a segment.

An unrecognised route renders **home, with the hash untouched** — the same thing
`#/banana` does. Never a "not found" screen, never a redirect: both of those
answer the question "is there something here?".

A route may name a *place* on the page it opens (`#/store/veditor` lands on that
shelf). A link that has already said which shelf it means must not make the
reader find it again.

### 9. All motion goes through the one frame loop.

`src/lib/motion.ts` runs a single `requestAnimationFrame` loop for the whole
page, and it parks itself when nothing holds it. Measured: a reader parked
mid-article went from 71 ms of main thread per second to 0.1 ms.

Never call `requestAnimationFrame` directly, never add a scroll listener, never
add a `setInterval` for animation. Subscribe with `onFrame`, read element rects
rather than a scroll offset, and call `frame.hold()` only while genuinely
time-based work is outstanding.

Honour `prefers-reduced-motion` — `motionIntensity` is 0 when the visitor asked
for less, and every `@media (prefers-reduced-motion: reduce)` block in the
component stylesheets exists for the same reason. `useOffscreenPause` parks
decorative animation in sections nobody can see; leave it working.

### 10. A price is written down once, and this repo is not the only place.

`src/data/store.ts` is the single source for what is sold. Its header lists
**every other place the same number lives, including two other repositories**,
because a static page cannot ask Stripe what a price is. Change one and change
all of them in the same sitting.

Anything derived — a yearly saving, a discount, a total — is **computed**, never
typed. `annualSavingCents()` exists so `SAVE $22.88` can never disagree with the
two prices above it.

`storeAnswers.ts` deliberately names no amount at all. Keep it that way.

**Advertising one amount and charging another is the one mistake a shop may not
make.** Every chip, label and cadence on a card must agree with the plan it
describes.

### 11. The security boundary is in Postgres, and only in Postgres.

Every privileged read and write goes through a `tdg_admin_*` function that opens
with `bea_is_admin()` and raises `42501` otherwise. Entitlement tables have no
client write policies at all.

Hiding the Developer tab, lazy-loading its chunk and hashing its filename are
**tidiness, not a lock** — the files say so out loud. Never add anything that
relies on a page being secret, and never move a permission check into the
client. If you need a new privileged verb, it is a migration first.

### 12. Comments explain *why*, and say what does not work.

This codebase documents reasoning, not syntax. Look at any file header before
you write one. A comment here names the alternative that was tried, the failure
it produced, and the measurement that settled it — `useOwnedPacks.ts` on why a
failed read is its own state, `wording.ts` on why errors match codes and never
message text, `dpr.ts` on why a media query and not a ResizeObserver.

Do not strip these comments to "clean up". Do not replace them with restatements
of the code. When you change behaviour a comment describes, change the comment
in the same edit.

### 13. Accessibility is a floor, not a finish.

Keyboard reachable, visible `:focus-visible` outlines (`2px solid var(--accent)`
with an offset, everywhere), real ARIA on anything that opens (`aria-expanded`,
`aria-haspopup`, `role="dialog"` with an `aria-label`), Escape closes and
returns focus to whatever opened it, `.sr-only` for text a screen reader needs
and a sighted reader does not, and `aria-hidden` on decorative SVG.

### 14. Assets go through `asset()`.

The site is served from a subpath. Vite rewrites paths it can see in HTML and
CSS, but not strings assembled at runtime — which is every `srcSet` here. Use
`asset('shots/foo.webp')` from `src/lib/asset.ts`. A leading slash resolves
against the origin and 404s in production while working perfectly in dev, so
this breaks *only* after deploy.

### 15. Down to 320px, and up to 300% zoom.

Grid tracks use `minmax(min(100%, Npx), 1fr)` — a track whose minimum is wider
than its container overflows it, and at 320px the shell is 284px wide. Long
unbroken strings (a display name, a handle, a pasted URL) already break via
`overflow-wrap` in `base.css`. Keep both true.

---

## 3 · The five jobs you will actually be asked to do

**Add an app, tool or game.** An entry in `APPS` / `TOOLS` in
`src/data/content.ts` with a `page:` slug, its icon art in `public/assets/`, and
a matching entry in `APP_PAGES` in `src/data/appPages.ts`. The router picks the
slug up from the card, so a page with no card is unreachable by design. No
component changes.

**Add a section to an app or About page.** A `PageSection` in the same file. It
needs an `id`, a `title`, a `what` (the one line a closed row carries — a
section that says nothing while shut is a bug), an optional `tag`, and `blocks`
from the vocabulary in `src/data/pageBlocks.ts`. Do not invent a block type for
one paragraph; that is how a content file becomes a component.

**Add or change a pack in the Store.** `src/data/store.ts`, and read its header
first — the number lives in four places plus Stripe. A pack sold more than one
way gets a `plans[]` array whose **first entry must match the pack's own
`priceCents` and `paymentLink`**, so the primary plan is not a fourth place to
state it. The card renders one button whatever the plan count; see
`Store.tsx`'s chooser.

**Add a route.** `Route` union and `routeFromHash` in `src/lib/route.ts`, then a
branch in `App.tsx`. Leading slash, unknown values fall through to home, and
`same()` must be able to tell two of your routes apart or effects keyed on the
route will not re-run.

**Add a section to the home page.** A component in `src/components/` with its
own stylesheet, mounted in `App.tsx`'s home branch. It opens with a `.kicker`
and a `.h2` inside a `.shell`, takes its blend tints as `--tint-top` /
`--tint-mid` / `--tint-bot` the way `Store.css` does, and reveals with
`useReveal`. Register its id in `NAV_LINKS` if it belongs in the nav.

---

## 4 · Things that are not up for redesign

Do not "modernise", "simplify" or "clean up" any of these. Each was arrived at
deliberately and the reasoning is in the file:

- The hand-rolled hash router. No router library.
- Hand-written CSS with tokens. No Tailwind, no styled-components, no UI kit.
- The single `requestAnimationFrame` loop. No per-component animation libraries.
- The 2–3px radii, the tight letter-spacing, the mono chips, the four-font stack.
- The theme *wave* (colour crossing the page, not snapping) in `src/theme/`.
- The custom cursor, the card tilt, the pointer-lit card edge.
- Folded pages that open as an index, shared by app pages, About and `#/dev`.
- `#/dev` behaving exactly like an unknown hash for everybody else.
- The always-dark auth modal, which deliberately does not reskin with the page.

If a change genuinely requires breaking one of these, say so explicitly and
explain why before you do it. Do not do it quietly as part of something else.

---

## 5 · Dependencies

The runtime dependencies are `react`, `react-dom`, `@supabase/supabase-js` and
`three`. **Do not add another one** without being asked for it by name. A UI
library, an icon package, a date library, an animation library or a router would
each replace something this repo already does on purpose, and would land in a
bundle that is already flagged at 500 kB.

Icons are inline SVG components written where they are used (`Tick`, `Caret`,
`Cross` in `Store.tsx`, `Chevron` in `Folded.tsx`, the icon set in
`AuthModal.tsx`). Follow that pattern.

---

## 6 · Git

Work on `main`, commit in whole runnable steps, push. Checks green **before**
the commit, not after — on `main` a broken commit is everybody's, with nothing
between it and the next pull.

Never commit `.env.local`, machine-local settings, build output, or logs. The
tree is clean when you finish: `git status --porcelain` prints nothing.

Commit messages here are a sentence about what changed and why, not a
`feat(scope):` prefix. Read `git log` before writing one.

---

## 7 · What "done" means here

There are no tests. That is not permission to skip verification; it means the
verification is manual and you have to actually do it.

1. **`npm run typecheck` silent, `npm run build` green.** Non-negotiable.
2. **Drive the real path in a browser.** Run the dev server, open the route you
   changed, and exercise the thing — click it, tab to it, press Escape.
3. **Measure; do not eyeball.** Symmetry, alignment and sizing claims come from
   `getBoundingClientRect()` or `offsetWidth`/`offsetHeight`, not from a
   screenshot. Use `offsetHeight` for layout: cards on this site carry a 3D tilt
   transform, so `getBoundingClientRect()` returns *projected* sizes that differ
   by a pixel or two between two identical elements at different heights on the
   card.
4. **Check both themes.** Toggle with the nav switch. Note that theme colours
   transition over ~600 ms via `--t-theme`, so read computed styles *after* it
   settles — in a non-compositing tab, transitions freeze at their start value
   and every reading will be the old theme's. Force them to land with
   `document.getAnimations().forEach(a => a.finish())`.
5. **Check the console.** No errors, no React warnings.
6. **Check 375px and 1440px.** The layout changes at 620px.
7. **Say what you did not verify.** Anything needing a human eye — a hover
   state, an animation's feel, a colour judgement — is "needs verification", not
   "verified".

---

## 8 · A worked example

The Store's Pro Export Pack is sold monthly, yearly and outright. It used to
print one button per plan, which gave its card a taller action row than the
one-time Theme Pack beside it: same shelf, same size card, buy buttons that did
not line up.

The fix shows most of this document at once:

- **One button**, the same `store__buy` its neighbour has, so the pair matches.
- The three ways moved into a chooser that **opens over the card**, not into it
  — the packs sit in a grid row, which stretches siblings to the tallest, so an
  inline expansion would have grown *both* cards and left a hole under the other
  one's button. The unevenness would have moved, not gone.
- The panel is a **grandchild** of the card, anchored to `.store__action`,
  because `base.css` forces every direct card child to `position: relative`.
- The saving chip is **computed** from the two prices, so it cannot go stale.
- Nothing is picked silently: the chooser prices every plan before anything
  opens.
- `role="dialog"`, `aria-expanded`, Escape closes and refocuses the button,
  scrim click closes, first plan takes focus on open.
- Both themes, reduced-motion handled, and the three plan rows were made
  **exactly** equal — a chip at its default padding made one row 3 px taller,
  which is the same bug one level down.
- Verified by measurement: card 419 px open and shut, buttons 507×45 px each,
  rows 63 px each.

Read `src/components/Store.tsx`, `Store.css` and `src/data/store.ts` together
before touching the shop. Between them they demonstrate the data/component
split, the token discipline, the state machine, the copy rules and the
accessibility floor.

---

<div align="center">

**JESUS IS KING**

</div>
