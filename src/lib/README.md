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
| `dpr.ts` | The cap on a canvas's backing store, and noticing when the display's pixel ratio changes. |
| `mergeRefs.ts` | Point several refs at one node. |
| `modal.ts` | A dialog's scroll lock, Escape, Tab, focus return and scrim — and, for a dialog that covers a card rather than the page, the Escape ordering on its own. |

---

## `route.ts`

**Hash routes, not paths.** The site is served from GitHub Pages, where a real
path needs a `404.html` rewrite to survive a refresh or a shared link, and every
existing nav item was already a hash anchor.

**Every route carries a leading slash**, and that is load-bearing: a route that
ate a section anchor would break the one-page scroll. The rule was learned from
one near miss — the home section used to be `#story`, one letter from `#store`.
That section is `#origin` now, so that particular pair cannot clash any more,
and the rule is unchanged regardless: what it buys is that no section anchor
added in future collides with a route added today. `#/app/<slug>` also puts the
slug behind a segment, so no future app name can collide with a section either.

**Old `#story` links still land on Origin.** It is a fragment and not a route,
so it falls through this file to home like anything else unrecognised; what
resolves it is one named alias in `App.tsx`'s hash effect, which scrolls it to
`#origin` and **does not rewrite the hash**. It is the only legacy anchor alias
on the site and the comment at that line says when the rename happened.

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

**The one exemption, and what it costs to take.** Something that is not
animation, that the loop would serve *worse* than a timer does — because the
loop would be held awake at 60 Hz for work that happens once a second or once a
session — and that stops on its own may use a plain timer instead. All three
conditions, not two. **Write the reason at the call site**, in the shape
`src/feedback/FeedbackDialog.tsx` uses above its countdown interval: name rule
9, say why the loop is the wrong home for this particular thing, and say when
the timer dies. An exemption nobody documented is indistinguishable from
somebody who had not read this file, and the rule stops being enforceable the
third time that happens.

`clamp01()` and `settle()` are the two bits of shared arithmetic that ride
along with the loop. `settle(rate, dt)` is the per-second lerp rate — 144 Hz
settling the way 60 Hz does — and it is exported from here rather than written
per consumer because it had drifted into five private copies of one expression
(`useParallax`, `usePointer`, `Hero`, `origin/CabinScene`, `Cursor`), where a correction
would have landed in one and silently not the rest. Its header says why that
failure is invisible on a 60 Hz machine.

`isParked()` is exported for checking the claim above rather than for using:
"did the loop actually park?" is the one thing in this section a screenshot
cannot settle. `setMotionIntensity()` is the only writer of the intensity
multiplier and nothing calls it today, so `mi` on the shipped site is 1, or 0
for a visitor who asked for less motion. The 0–1.5 clamp is the contract for
whatever turns that knob first, not a range the page uses.

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

Two halves of one decision — what the ceiling on a canvas's backing store is,
and how you find out the display's ratio moved. They live together because the
second is only ever used to re-apply the first.

**`MAX_DPR` is 1.5, and every canvas on this site sizes its backing buffer to
`Math.min(devicePixelRatio, MAX_DPR)`.** The reasoning is `hero/PointCloud.tsx`'s
and it is the one that generalises: at the scales anything here draws at, 2x buys
nothing for a soft point or a flat-shaded facet, and it costs four times the
fill. A dust mote in `hero/Starfield.tsx` is sub-pixel to begin with; a snowflake
in `scene/Snow.tsx` is a 0.6–2.7px disc; `origin/CabinScene.tsx` is untextured
facets with no high-frequency detail for the extra samples to resolve. None of
the four has an edge sharp enough to reward a retina buffer, and all four pay the
fill rate every frame.

It arrived here because it was in those four files at once — three declaring a
byte-identical `const MAX_DPR = 1.5`, and `PointCloud`, which owns the argument,
writing the 1.5 as a bare literal with no name at all. That is `settle()`'s story
one step earlier: one decision, four copies, correctable in one.

An **area** cap is not a display fact and does not belong here.
`origin/CabinScene.tsx` keeps its own `MAX_PIXELS` beside its `resize`, because
that number is about one component's option to mount a canvas over a whole tall
section — it would be wrong to impose on a viewport-sized canvas and meaningless
to state next to a ratio.

**`onDprChange` is the other half.** Every canvas re-reads the ratio from a
`ResizeObserver` — which is right for a window being dragged wider and **wrong**
for the other way a ratio changes: a laptop at 200% beside a monitor at 100%, and
a window dragged between them. The CSS size never moved, so no observer fires,
and the buffer stays sized for the screen it left. Changing the OS scaling with
the window where it is does the same thing.

A media query is the one thing that notices. `(resolution: Ndppx)` is true only
at exactly the ratio it was armed with, so the first event **is** the ratio
having moved; the listener is then re-armed at the new value. On a browser that
does not understand `resolution` the query never fires, which leaves the old
behaviour rather than breaking anything.

## `modal.ts`

`useModal({ open, onClose, layer, dialog, focusFirst? })` and
`useBackdropClose(onClose)`. Every full-screen dialog on the site calls both:
the auth modal, Send Feedback, the reply panel, the Developer console's report
dialog. **Do not write `document.body.style.overflow` in a component, do not add
your own `keydown` listener for Escape or Tab, and do not write a scrim's
`onClick` by hand.**

`useEscape({ open, onClose, layer })` is the third export and it is one of those
five things alone: a place in the Escape ordering. The Store's two plan panels
take it. They are `role="dialog"` but not `aria-modal`, they cover one card
rather than the page, and the page goes on scrolling behind them — so they want
no scroll lock, no Tab trap and no focus of this file's choosing, and `useModal`
would have given them all three. Left outside the stack with a `document`
listener each, a panel open beneath the auth modal took the same Escape as the
modal in front of it and closed something the reader could not see, which is the
bug the stack exists to prevent arriving from the one direction it did not
reach. What made the fix possible is that the two properties are counted
separately: the scroll lock over the members that asked for it, never over
`stack.length`, and the Tab trap only over members that name a dialog element.

`dialog` is a ref to the element carrying `role="dialog"`, and it is required
rather than optional because that is what Tab is kept inside — a trap that
silently does not run is worse than no trap at all.

The lock is COUNTED, because the per-dialog version was only correct one dialog
at a time. Two open at once — the reply panel arriving over an open Send
Feedback form — and the second one saved `hidden` as the value to put back. One
Escape closed both in the same commit, the cleanups ran in tree order, and the
page was left unscrollable with nothing on top of it. Only the last dialog to
leave restores the page now.

Escape is listened for ONCE and handed to the dialog that is actually PAINTED
on top, which is what `layer` is for. Handing it to the last dialog to open is
what this replaced, and it was wrong in a reachable case: at boot a recovery
link opens the auth modal from an effect while the reply panel is still waiting
on its fetch, so the panel opens second at z-index 290 and the modal covering it
sits at 300. Escape closed the panel nobody could see. `MODAL_LAYER` holds the
four numbers and names the stylesheet each one mirrors — change one, change
both. The Store panel's 2 is the odd one and is honest: `.store__action` is a
direct child of `.card` and carries a `z-index`, so the panel's number is
measured inside the card's own stacking context, which places it under
everything the page paints over a card. Listeners that are not dialogs — the
account menu's own Escape — are left alone on purpose.

`useBackdropClose` is the scrim, and it needs a press that both STARTED and
ended on the backdrop. A drag that begins inside the card and finishes outside
it fires its `click` on the nearest common ancestor, which IS the backdrop, so
`onClick={onClose}` and a bare `e.target === e.currentTarget` both read the tail
of a drag-select as "close". Send Feedback was binning a written report that
way, and the console's report dialog was binning a written reply — the second
one because the fix lived in the first component instead of here.

Tab is wrapped at both ends of the topmost dialog, because all four say
`aria-modal="true"` and Tab used to walk straight out of the card and off down
the nav and the footer — a promise made in ARIA and broken by the keyboard,
which is worst for the reader who most depends on it. The focusable list is
read fresh on every press rather than collected when the dialog opens: every
dialog here changes shape while open (the auth modal swaps its whole form, the
send form becomes a receipt, the report dialog grows a confirm step). Elements
are filtered on their EFFECTIVE `tabIndex`, which is what keeps the send form's
roving-tabindex kind picker to the one tile the arrow keys have selected.

Focus goes to `focusFirst` on open and back to whatever had it on close. What
does **not** work: an opener that is still mounted but has gone `inert`, which is
every button in the closed account menu — it accepts `focus()` and ignores it.
That is why `Nav.tsx` hands focus to the account trigger before opening the
feedback dialog, so there is a live element to come back to. For the same
reason the trap skips anything inside `[inert]`: those buttons are still in the
DOM and still match the selector.
