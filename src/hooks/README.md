# `src/hooks/` · the motion hooks

Seven hooks, in six files. Between them they do all the movement on this site,
and every one of them runs on the single frame loop in
[`../lib/motion.ts`](../lib/README.md).

**Never call `requestAnimationFrame` directly, never add a scroll listener, and
never animate on a `setInterval`.** The loop parks itself when nothing holds it,
and any of those three breaks the parking — which is worth 71 ms of main thread
per second on a page nobody is even scrolling.

| Hook | What it does |
| --- | --- |
| `useReveal(kind, index)` | Brings an element in as it enters the viewport. |
| `useTilt(soft?)` | Tilts a card toward the cursor and feeds the spotlight. |
| `useParallax(factor)` | Drifts a decorative layer against its own distance from centre. **Stops painting 400px outside the viewport.** |
| `useHeroParallax(factor)` | Drifts a layer with the **hero's** displacement instead of its own. Same file as `useParallax`, and the two must never share an element. |
| `usePointer()` | Damped pointer position, −1..1 per axis. **Returns without rendering.** One listener for the whole page. |
| `useSway(x, y)` | Slides a layer with the cursor. Reads `usePointer` and writes `translate`, so it may never share an element with either parallax hook. Lived privately in `Tools.tsx` until `scene/` needed it. |
| `useSectionProgress()` | 0 as a section's top reaches the viewport bottom, 1 as its bottom reaches the top. **Returns without rendering.** |
| `useOffscreenPause()` | Parks decorative animation in sections nobody can see. |

**Two of the seven write nothing.** Every other hook here takes a ref and moves
that element for you. `usePointer` and `useSectionProgress` hand back a
*number* and stop: they touch no DOM at all, and the caller decides what the
number means inside its own `onFrame` tick. They are the two you reach for when
the thing being driven is not one element's transform — a canvas, an SVG
attribute, three layers at once.

---

## `useReveal`

```tsx
const reveal = useReveal<HTMLElement>('card3d', index % 3)
```

Seven kinds: `wipe` · `card3d` · `slideL` · `pop` · `scale` · `holy` · `rise`.
The second argument is a stagger index, so a row of cards arrives in sequence
rather than together.

**Scroll-linked, not a one-shot trigger.** Progress tracks the element's rect
between 94% and 46% of the viewport height, so scrolling back up plays it
backwards. When it completes it clears every inline style it wrote and deletes
`data-revealing`, which is what **hands `transform` back to the tilt hook** —
the two share the property and would otherwise fight over it.

At `mi === 0` (reduced motion) it finishes immediately.

## `useTilt`

```tsx
const tilt = useTilt<HTMLElement>()          // cards
const soft = useTilt<HTMLElement>(true)      // the Origin timeline rows
```

Rotates toward the cursor and sets the two custom properties the spotlight
(`.card__spot`) and the pointer-lit ring (`.card__edge`) read.

**A tap has no cursor to tilt toward**, so on a device without hover it returns
without attaching anything and cards stay flat.

**The settle is `.card`'s, not the hook's.** This writes `transform` straight
onto the element on every `pointermove` and writes the rest pose back on
`pointerleave`, so a card with no `transition` on `transform` snaps flat in one
frame the moment the pointer goes. That line lives once, on `.card` in
`base.css`; it used to be copied into five card rules across five stylesheets,
which is exactly how `.cloud__panel` — the sixth card written — was born without
it and jumped. Tilt something that is not a `.card` and it needs its own
(`.origin__row` is the one, at a gentler 0.95s).

Because this leaves a 3D transform on the element, **`getBoundingClientRect()`
inside a card returns projected sizes** — two identical elements at different
heights measure a pixel or two apart. Use `offsetWidth` / `offsetHeight` when
you are checking layout.

### Both on one element

```tsx
import { mergeRefs } from '../lib/mergeRefs'

<article ref={mergeRefs(reveal, tilt)} className="card">
```

That is the standard card pattern; every card grid on the site uses it.

## `useParallax`

```tsx
const blob = useParallax<HTMLDivElement>(-0.12)
```

Uses the standalone `translate` property rather than `transform`, so any
transform the element already carries — centring, rotation — survives untouched.
Lerps per second rather than per frame, so 144 Hz feels like 60 Hz — through
`settle()` in [`../lib/motion.ts`](../lib/README.md), which every damped lerp
on this site shares: `useParallax`, `usePointer`, `Hero`, `origin/CabinScene`
and `Cursor`. That is five, and the fifth was found three passes late — see
`settle`'s own header, which carries the count and why a miscount there is the
exact failure the export exists to prevent.

The one thing that looks like a sixth and is not: `hero/PointCloud.tsx` decays
a *throw's velocity* with `Math.pow(0.945, step * 60)`, which is the same
per-second normalisation written as the complement. It is not a lerp toward a
target and there is nothing for `settle()` to return to it, so read the claim
above as "every lerp", not "every exponential".

**Zero under reduced motion, and it SNAPS there rather than easing.** Same rule
`usePointer` states and for the same reason: an eased return is itself motion,
and the one moment it would ever play is the moment somebody asked for less of
it. It used to lerp to rest, so a visitor who *toggled* the preference
mid-session watched every parallax layer on the page glide to a stop — about
seventeen frames of exactly what they had just asked to stop. The identity is
still written once rather than swallowed, and the loop parks on the next frame
because a snapped layer never calls `hold()`.

**Your layer stops updating 400px outside the viewport.** That is a contract,
not an implementation detail: while it is parked nothing is written to
`element.style.translate`, so the value sitting there is the one from the last
frame it was near the viewport, and anything else reading that element's
position off screen is reading a stale one. It goes on tracking its target
internally the whole time, so the first frame back inside the band is painted at
the correct place with no snap and no catch-up slide — but that frame happens
400px out, not at the viewport edge. See `PARK_MARGIN` in the file for why 400
and not `useOffscreenPause`'s 120.

`useOffscreenPause` cannot do this job for you. It stamps `data-live` and CSS
`animation-play-state` follows it, but an `onFrame` subscriber never sees an
attribute — **anything you drive from JS instead of CSS keyframes has to check
visibility itself**, the way `hero/Starfield.tsx`, `origin/CabinScene.tsx`,
`components/faith/Summit.tsx` and `components/scene/Snow.tsx` all do. (That
list used to name `origin/OriginField.tsx`, which was deleted this pass and
replaced by `CabinScene.tsx`; the lesson survived the file.)

## `useHeroParallax`

```tsx
const rays = useHeroParallax<HTMLDivElement>(0.05)
```

The fifth hook, exported from `useParallax.ts` beside the fourth. It reads
**the hero's** rect (`#top`) rather than the element's own, so a layer follows
the hero down as it sinks instead of drifting against its own distance from the
centre of the viewport.

**Which one you want.** Inside the hero, or in a section that is meant to read
as still tied to it, use `useHeroParallax`. Anything else on the page uses
`useParallax`. There is no lerp in the hero version and it needs none: it tracks
a rect that is already moving smoothly, so a smoother of its own would only add
lag.

**Exactly one element on the page rides it today**, and that is worth knowing
before you read the file's header. `grep -rn 'useHeroParallax<' src/` returns
two call sites: `Faith.tsx`'s rays, which is the live one, and
`components/scene/ThemedArt.tsx`'s `ThemedHeroArt`, which currently has no
caller of its own (`scene/README.md` says why it is kept anyway). The hero
itself no longer uses it at all — it is a pinned `Stage` now, and every layer
inside it comes off **one** shared `getBoundingClientRect` per frame in
`Hero.tsx`, which is cheaper than a subscriber per layer each measuring the
same element.

**It does not park off screen, and `useParallax` does.** No lerp to keep the
loop awake, no `hold()` ever, and a guard here would have to buy a second rect
the hook does not otherwise read — a measurement added to every live frame to
save one style write. `useParallax.ts`'s header carries the full reasoning and
**the subscriber count it was decided against**. That number is stated there and
deliberately not repeated here, because a figure written down twice is one that
will eventually disagree with itself — §8 of [`AGENTS.md`](../../AGENTS.md) is
that lesson, learned on a button size. Note when you read it that the count has
since fallen rather than risen, so the argument got stronger. What it means for
a consumer: a `useHeroParallax` layer's inline `translate` is current on every
frame the page moves, wherever that layer is.

**Never put both on one element.** Each writes the whole of
`element.style.translate` every frame from its own source and neither reads what
the other left, so two writes race inside one frame, the winner depends on
effect order, and the visible result is art that shakes between two positions.
This is why `components/scene/ThemedArt.tsx` is three components rather than one
with a `mode` prop — hooks cannot be called conditionally, so a single component
would have to call both. Its header comment is the long version, and it is
worth reading before you "simplify" anything here.

## `usePointer`

```tsx
const pointer = usePointer()   // { readonly x: number; readonly y: number }
```

−1..1 on each axis, 0 at the viewport centre, damped so a layer following it
has weight instead of twitch.

**It never causes a React render, and that is the contract.** Returning state
would re-render a whole section on every mouse move — several times a frame,
for a decorative offset. What comes back is a frozen accessor over module
state: the same object on every call and for every consumer. **Read it inside
your own `onFrame` tick**, never during render, where it gives you the value at
render time and nothing afterwards.

```tsx
const pointer = usePointer()
const layer = useRef<HTMLDivElement | null>(null)
useEffect(
  () =>
    onFrame(() => {
      const el = layer.current
      if (!el) return
      const next = `${(pointer.x * 26).toFixed(2)}px ${(pointer.y * 14).toFixed(2)}px`
      return () => {
        el.style.translate = next
      }
    }),
  [pointer],
)
```

**One `pointermove` listener and one lerp for the whole page**, reference
counted inside the module, so every consumer after the first costs nothing —
the table at the bottom of this file is how many there are. The listener
stores two integers and writes nothing — rule 9 forbids a listener that
*animates*, and `motion.ts` already listens to `pointermove` as a wake source,
so the loop is awake for the whole gesture. The lerp lives in the tick, which
is the only place it can keep converging after the last event.

**Zero on a coarse pointer.** It tests `(pointer: fine)`, the same query
`Cursor.tsx` uses, and on a phone it never attaches a listener at all — so a
touch drag cannot shove the scenery sideways.

**Zero under reduced motion**, and it snaps there rather than easing, because
an eased return is itself motion and the one moment it would play is the moment
somebody asked for less.

**It holds the loop only while converging.** Once the lerp lands on the target
it snaps and stops holding, so a reader who has stopped moving the mouse lets
the loop park. That is not a nicety: a lerp that never quite arrives is a page
that never parks.

## `useSectionProgress`

```tsx
const [section, progress] = useSectionProgress<HTMLElement>()
// ...
<section ref={section} className="section">
```

0 as the section's top reaches the viewport bottom, 1 as its bottom reaches the
viewport top, clamped. Same no-render contract as `usePointer`: `progress.p` is
a frozen accessor over a ref, read inside your own tick.

`origin/CabinScene.tsx` computes exactly this expression inline —
`(vh - rect.top) / (vh + rect.height)`, inside its own tick — and inherited it
from `origin/OriginField.tsx`, the file it replaced this pass. This is that
line with the reasoning attached, so anything new that wants scroll progress
through a section calls the hook rather than writing the arithmetic a third
time. `Faith.tsx` is the one that did, and it is the only caller today.

**There is a case where you should not.** `Hero.tsx` declined it on purpose and
its header says why: `p` runs over `vh + height` with the section entirely off
screen at both ends, so recovering "how far through this pinned runway am I"
from it needs the height and the viewport back again — the two measurements the
hook was meant to save. One rect, read once and mapped directly, is cheaper and
exact. Reach for this hook when you want a section's travel across the
viewport; read your own rect when you want a fraction of one specific box.

**What p actually means.** The travel is `vh + height`, so the run starts and
ends with the section completely out of view. That is what makes it safe to
drive an entrance *and* an exit from: there is no first frame at which
something has to appear already half-done.

- **p = 0.5 is always the section's centre crossing the viewport's centre**,
  whatever the two heights are. It is the one landmark that does not move, so
  anything meant to peak "in the middle of the section" peaks there.
- **The section is at its most visible between `height / (vh + height)` and
  `vh / (vh + height)`.** A section *taller* than the viewport fills the screen
  across that band; a section *shorter* than it is fully on screen across the
  same band with page visible above and below. Either way it brackets 0.5, and
  it shrinks to the single instant p = 0.5 when the two heights are equal.

What p is **not** is "how much of this section have I read". For a section
three screens tall, p has already spent a quarter of its run before the first
line of copy reaches the middle of the screen. Map a sub-range of p rather than
reaching for a second measurement.

**It never calls `hold()`**, so it can never keep the loop awake, and it never
writes. One rect per frame per consumer while the page is moving, nothing at
all while it is parked — which is also why it has no off-screen guard: outside
the viewport the clamp has already pinned p to 0 or 1, and a guard would cost
the rect it was trying to save.

## `useOffscreenPause`

Called once, from `App.tsx`. Sets `data-live="true"` / `"false"` on every
`section` and `footer` from an `IntersectionObserver`, and `base.css` turns that
into `animation-play-state: paused !important` on everything inside.

The Faith gradient field alone is a rotating conic gradient under a 46px blur:
cheap to look at, expensive to keep compositing when nobody can see it.

**Anything decorative you add should be a CSS animation on an element inside a
section, so this reaches it for free.** Something driven from JavaScript needs to
check for itself.

`components/scene/Stage.tsx` adds a third member to that family: it stamps
`data-covered` on itself when its section is off screen and `Stage.css` turns
that into `visibility: hidden`. Same limitation, for the same reason — an
`onFrame` subscriber inside a stage does not see the attribute, so a canvas in
there still does its own rect check. `scene/Snow.tsx` does, from inside
`.origin__stage`; so does `hero/Starfield.tsx`, which has been sitting in
`.hero__stage` since before this note was written. Ask the DOM rather than the
call sites for which canvases are actually in one —
`[...document.querySelectorAll('canvas')].filter(c => c.closest('.stage'))` —
because `origin/CabinScene.tsx`'s is in there too and arrives a lazy chunk
later than the rest of the page.

---

## Who calls the two that write nothing

`usePointer` and `useSectionProgress` were written ahead of the sections that
now use them, the way `components/scene/` was, so that the several sections
about to grow scroll and pointer choreography would all reach for one
implementation rather than each inlining its own. Both are wired in now. The
table is what `grep -rn '= usePointer()' src/` and
`grep -rn 'useSectionProgress<' src/` return — re-run them rather than trusting
it, because this section has already been wrong once.

| Caller | Hook | What it drives |
| --- | --- | --- |
| `components/Hero.tsx` | `usePointer` | The tall pine (26 × 11 px) and the moon (7 × 3). The ridges and the sky answer the mouse with nothing at all, which is what makes the pine read as near. |
| `components/Origin.tsx` | `usePointer` | The lamppost, **on the x axis only** — a foot that bobs off the snow loses the illusion the whole arrangement exists to build. |
| `components/Tools.tsx` | `useSway` | The boulder cluster's wrapper. |
| `scene/ThemedArt.tsx` | `useSway` | Any slot a Scene Editor draft sets to `motion: 'sway'`, on the `<img>` itself — which is safe there because the resolver builds ONE component per slot, so nothing else is writing that element's `translate`. |
| `components/faith/Summit.tsx` | `usePointer` | The moon and the far ridge, by a few pixels. The cross takes no pointer response, deliberately. |
| `components/Faith.tsx` | `useSectionProgress` | Read on the section and handed straight down to `faith/Summit.tsx` as the frozen accessor, where the moon, the far ridge and the crest lag the page by 30 / 26 / 13 px across the whole of `p`. |

Two things in that table are worth copying rather than re-deriving.

**A pointer layer goes on a WRAPPER, never on the element a parallax hook
owns.** `Tools`, `Origin` and `Hero` all do it that way. `useParallax`
writes the whole of `element.style.translate` every frame and so does a pointer
tick, so one element with both is the same race `useHeroParallax` and
`useParallax` have — see **Never put both on one element** above. The wrapper
takes the pointer; the child takes the scroll.

**`useSway` was `Tools.tsx`'s private fifteen-line helper and is now a hook in
this folder.** This paragraph used to say the trigger for moving it was "a
second section that wants one"; `scene/ThemedArt.tsx` is that second caller, so
it moved, unchanged apart from the file it is in. `faith/Summit.tsx` is still
not a caller and should not become one — it drives three layers from one tick
with scroll and pointer terms mixed, which is not what `useSway` does.
