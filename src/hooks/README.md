# `src/hooks/` · the motion hooks

Five hooks, in four files. Between them they do all the movement on this site,
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
| `useParallax(factor)` | Drifts a decorative layer against its own distance from centre. |
| `useHeroParallax(factor)` | Drifts a layer with the **hero's** displacement instead of its own. Same file as `useParallax`, and the two must never share an element. |
| `useOffscreenPause()` | Parks decorative animation in sections nobody can see. |

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
Lerps per second rather than per frame, so 144 Hz feels like 60 Hz.

## `useHeroParallax`

```tsx
const shafts = useHeroParallax<HTMLDivElement>(0.06)
```

The fifth hook, exported from `useParallax.ts` beside the fourth. It reads
**the hero's** rect (`#top`) rather than the element's own, so a layer follows
the hero down as it sinks instead of drifting against its own distance from the
centre of the viewport.

**Which one you want.** Inside the hero, or in a section that is meant to read
as still tied to it, use `useHeroParallax` — `Hero.tsx` moves its shafts and its
content with it, and `Faith.tsx` gives its rays the same ride. Anything else on
the page uses `useParallax`. There is no lerp in the hero version and it needs
none: it tracks a rect that is already moving smoothly, so a smoother of its own
would only add lag.

**Never put both on one element.** Each writes the whole of
`element.style.translate` every frame from its own source and neither reads what
the other left, so two writes race inside one frame, the winner depends on
effect order, and the visible result is art that shakes between two positions.
This is why `components/scene/ThemedArt.tsx` is three components rather than one
with a `mode` prop — hooks cannot be called conditionally, so a single component
would have to call both. Its header comment is the long version, and it is
worth reading before you "simplify" anything here.

## `useOffscreenPause`

Called once, from `App.tsx`. Sets `data-live="true"` / `"false"` on every
`section` and `footer` from an `IntersectionObserver`, and `base.css` turns that
into `animation-play-state: paused !important` on everything inside.

The Faith gradient field alone is a rotating conic gradient under a 46px blur:
cheap to look at, expensive to keep compositing when nobody can see it.

**Anything decorative you add should be a CSS animation on an element inside a
section, so this reaches it for free.** Something driven from JavaScript needs to
check for itself.
