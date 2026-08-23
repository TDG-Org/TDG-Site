# `src/lib/` · the machinery

Everything that is not a component, not content and not a hook. Each file here
solves one problem, and most of them exist because the obvious approach failed
in a way that is written down at the top of the file. Read the header before you
change one.

| File | What it is |
| --- | --- |
| `route.ts` | The hash router. |
| `motion.ts` | The one animation loop for the whole page. |
| `sections.tsx` | Which collapsible sections are open. |
| `supabase.ts` | The shared TDG Core client. |
| `asset.ts` | A URL for a file in `public/`. |
| `chromeGuard.ts` | Keeping extensions from repainting our controls. |
| `dpr.ts` | Noticing when the display's pixel ratio changes. |
| `mergeRefs.ts` | Point several refs at one node. |
| `modal.ts` | One dialog's scroll lock, Escape and focus return — counted across all of them. |

---

## `route.ts`

**Hash routes, not paths.** The site is served from GitHub Pages, where a real
path needs a `404.html` rewrite to survive a refresh or a shared link, and every
existing nav item was already a hash anchor.

**Every route carries a leading slash**, and that is load-bearing: `#store` and
`#story` are one letter apart, and a route that ate a section anchor would break
the one-page scroll. `#/app/<slug>` also puts the slug behind a segment, so no
future app name can collide with a section either.

```ts
type Route =
  | { kind: 'home' }
  | { kind: 'about' }
  | { kind: 'store'; app?: string }
  | { kind: 'dev' }
  | { kind: 'app'; slug: string }
```

Four things to keep true when you add one:

1. **A route may name a place on the page it opens.** `#/store/veditor` is the
   Store landed at that shelf. A link that has already said which shelf it means
   should not make the reader find it again, so anything pointing at one thing on
   a long page gets this shape rather than a bare page hash.
2. **Unknown values fall through, hash untouched.** `#/app/banana` renders home,
   exactly like `#/banana`. `#/store/banana` renders the Store without a shelf,
   because it is unmistakably a request for the shop. No "not found" screen and
   no redirect: both of those answer the question "is there something here?".
3. **`same()` has to tell your routes apart**, or effects keyed on the route will
   not re-run. Two Store routes naming different shelves are two different
   journeys; treating them as one leaves a reader who clicked the second link
   standing at the first shelf.
4. **Accepted app slugs come from the CARDS**, in `data/content.ts` — never from
   `appPages.ts`. That file is a large lazy chunk and only a visitor who opens a
   page should pay to download it, so this file must not import it. Every card
   names its page, so the two lists cannot drift without a card visibly losing
   its link.

`rememberOrigin` / `takeOrigin` are how Back from an app page lands at the exact
scroll position the card was clicked from — and only when the hash is the one
that was left, so somebody who leaves via the nav is not dragged back to it.

`dev` being listed here is not a leak. Anything the router recognises has to be
named, and what keeps the console out of everyone's way is that `App.tsx` renders
home for a non-developer and every byte behind it comes from Postgres functions
that refuse one. See [`../dev/README.md`](../dev/README.md).

## `motion.ts`

**One `requestAnimationFrame` loop drives the whole page, and it parks itself.**

Everything reads element rects rather than a scroll offset, so the choreography
is independent of which element owns the scroll. The loop only runs while there
is work: most of what it drives is scroll-linked and has nothing to do until the
page moves. Anything genuinely time-based — the hero model, the dust, a lerp
still converging — calls `frame.hold()` to keep it alive another frame.
Everything else returns, and once nothing holds, the browser stops running its
rendering lifecycle entirely.

Measured on this page: a reader parked mid-article went from **71 ms of main
thread per second to 0.1 ms**.

```ts
onFrame(({ vh, mi, now, dt, hold }) => { ... })   // returns an unsubscribe
```

`mi` is the motion intensity multiplier and is **0** when the visitor asked for
less motion. `dt` is clamped to 50 ms so a backgrounded tab does not jump.

**Never call `requestAnimationFrame` yourself, never add a scroll listener, and
never animate on a `setInterval`.** All three break the parking.

## `sections.tsx`

Which collapsible sections of a page are open — shared by the Developer console
and the public folded pages, because both want a long page that opens as an index
and one pair of buttons that can reach every section on it.

**Shared state rather than a `useState` per panel**, because Expand All has to
reach the nine sections inside a Developer console account detail: panels that
page never renders directly and that mount and unmount as you click between
people. Each section registers its id on mount, so the buttons work from that
register rather than from a list somebody has to remember to update.

**Everything starts collapsed unless the page says otherwise.** `initialOpen`
seeds the set once, on mount, and is how a page that remembers its own
arrangement hands it back: the Developer console restores it from the session so
a reload lands on the page you were reading rather than on a collapsed copy of
it (`src/dev/viewState.ts`). Nothing is persisted here. Every other page passes
nothing and opens shut.

`openIds` is the counterpart: every open id, including ones nothing is currently
rendering. That is the set a page would persist — what you arranged, not what
happens to be mounted at the moment you ask. `openCount` and `total` stay about
what is on screen, because that is what the two buttons act on.

## `supabase.ts`

The shared TDG Core project — the same `profiles` / `auth.users` every TDG app
reads. Throws on boot if `VITE_SUPABASE_URL` or
`VITE_SUPABASE_PUBLISHABLE_KEY` are missing, by design: a site that silently
renders signed-out because an env var was forgotten is worse than one that says
so. Use the publishable key (`sb_publishable_…`), not the legacy anon JWT. It is
not a secret; the protection is RLS.

## `asset.ts`

```ts
srcSet={asset('shots/maranatha-720.webp')}
```

The site is served from a subpath, so a leading slash resolves against the origin
and 404s. Vite rewrites the paths it can see, in HTML and in CSS, **but not
strings assembled at runtime** — which is every `srcSet` in this codebase.
`BASE_URL` is `/` in dev and always ends in a slash, so the argument never takes
one.

This is the failure mode that works perfectly in dev and breaks only after
deploy. Use the helper.

## `chromeGuard.ts`

Runs before the first render, from `main.tsx`.

**The line it draws:** an extension may do whatever it likes in its own UI — its
popup, its menu, its shortcuts, its filling of a field — and it may not repaint
ours. Nothing here stops one filling anything in, and nothing here touches an
element it renders outside our tree. What is undone is writes aimed at controls
this app rendered, and widgets parked inside their layout.

Three defences in cost order: the documented opt-outs (`darkreader-lock`,
`color-scheme`), then CSS in `base.css`, then a `MutationObserver` for what is
left.

## `dpr.ts`

Every canvas here sizes its backing buffer to `devicePixelRatio` and re-reads it
from a `ResizeObserver` — which is right for a window being dragged wider and
**wrong** for the other way a ratio changes: a laptop at 200% beside a monitor at
100%, and a window dragged between them. The CSS size never moved, so no observer
fires, and the buffer stays sized for the screen it left.

A media query is the one thing that notices. `(resolution: Ndppx)` is true only
at exactly the ratio it was armed with, so the first event **is** the ratio
having moved; the listener is then re-armed at the new value. On a browser that
does not understand `resolution` the query never fires, which leaves the old
behaviour rather than breaking anything.

## `modal.ts`

`useModal(open, onClose, focusFirst?)`. Every dialog on the site calls it: the
auth modal, Send Feedback, the reply panel, the Developer console's report
dialog. **Do not write `document.body.style.overflow` in a component.**

The lock is COUNTED, because the per-dialog version was only correct one dialog
at a time. Two open at once — the reply panel arriving over an open Send
Feedback form — and the second one saved `hidden` as the value to put back. One
Escape closed both in the same commit, the cleanups ran in tree order, and the
page was left unscrollable with nothing on top of it. Only the last dialog to
leave restores the page now.

Escape is listened for ONCE and handed to whichever dialog opened last, so a key
press closes the top layer rather than every layer. Listeners that are not
dialogs — the account menu's own Escape — are left alone on purpose.

Focus goes to `focusFirst` on open and back to whatever had it on close. What
does **not** work: an opener that is still mounted but has gone `inert`, which is
every button in the closed account menu — it accepts `focus()` and ignores it.
That is why `Nav.tsx` hands focus to the account trigger before opening the
feedback dialog, so there is a live element to come back to.
