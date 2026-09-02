# `src/theme/` · two worlds, and the wave between them

Two files. `ThemeProvider.tsx` owns exactly one piece of state — `dark` or
`light` — and the choreography of changing it. `artPrefetch.ts` makes sure the
scenery the choreography needs is already in the browser.

```tsx
const { theme, toggle } = useTheme()
```

`toggle` takes the click event, so the wave can start at the toggle rather than
at the middle of the screen.

---

## What it actually sets

`data-theme` on `document.documentElement`, and nothing else. Every colour on the
site comes from a token that swaps on that attribute; see
[`../styles/README.md`](../styles/README.md).

Dark is the default and is what `index.html` ships with, so the first paint is
never the wrong scene. The choice persists in `localStorage` under `tdg-theme`,
wrapped in a `try` because private mode throws.

## The wave, and why it is not a snap

Colour crosses the page rather than flipping. Three things make that work, and
all three are load-bearing:

1. **`--t-theme` is declared on `*`, not on `:root`.** Each element has to
   substitute `--wave-delay` in its own context. Declared on the root, the value
   would inherit already-substituted and every element would change at once.
2. **`stageWave()` writes a per-element `--wave-delay`**, from that element's
   distance to the origin as a fraction of the farthest corner, capped at 640 ms.
   It **measures everything first and then writes**, because `--wave-delay` is
   inherited and a write dirties the whole subtree — interleaving reads and
   writes forced a style recalc per element and blocked the main thread through
   the start of the wave.
3. **The tint tokens are `@property`-registered** in `tokens.css`, so the section
   blend gradients animate instead of snapping. Without that the wave would stop
   dead at every section boundary.

A translucent bloom and an expanding ring ride along on top, painted from the
origin point.

Tall elements are clamped so a full-page section does not measure its delay from
its own middle, which would put the top of the viewport in the wrong phase.

## The two things a colour transition cannot carry

Everything above moves colour. Two of the page's biggest surfaces are not
colour, and until this pass both of them cut while the rest of the page waved.
Measured in headless Chrome at 1440x900, before: one composited frame in which
**149 of 255 mean RGB changed at once**, and the whole change done inside three
frames. After: the same change spread over **500–800 ms and 40–60 frames**, with
no frame carrying more than a fraction of it.

**The scenery is `<img>` files, and a resource swap has no interpolable value.**
`crossArt` clones every on-screen `img.scene__art` at the start of the wave,
leaves the clone holding the outgoing picture on top of the incoming one, and
cross-fades the pair with `filter: opacity()` over `--t-art` — same 0.6s, same
`--wave-delay`. It clones rather than re-rendering because `useParallax`
captures its element in an effect: swap the node under it and that slot's drift
is dead for the session. Every clone is removed at `WAVE_RESTORE`, so **at rest
there is one `<img>` per slot and no filter on it.**
[`../components/scene/README.md`](../components/scene/README.md) carries the
rest.

**The hero sky was a whole gradient in one token, and `background-image` does
not transition.** Its four stops, its two stop positions and the daylight haze
over it are `@property`-registered colours now, assigned on `.hero__sky` from
per-theme tokens and eased by `--t-sky` — the same two-step the section bands
use with `--band-*` into `--tint-*`.

## Nothing waits on the network

`artPrefetch.ts` fetches the OTHER theme's art after `load`, in batches of four
off `requestIdleCallback`, at `fetchPriority: 'low'`, and not at all on a
`saveData` or 2G connection. The list is read off the DOM (`img.scene__art`,
theme suffix swapped) rather than written down, so it cannot go stale.

It runs again on every theme change, held back past `WAVE_RESTORE`. That second
pass is not redundant: the first can only warm the twins of slots the page has
actually loaded its own file for, and everything below the fold is
`loading="lazy"`. Without it, scrolling to the bridge and then toggling would
find that slot's other-theme file missing. Holding it past the wave matters too
— the wave runs on the compositor, so the main thread is free exactly when an
idle callback goes looking, and the requests would otherwise land inside a
toggle that needs none.

Measured on the built site with GitHub Pages' cache headers, at 1440x900 and
375x812, from both themes, at the top of the page and parked on the bridge and
at the cross: **zero bytes fetched during any toggle**, no slot ever without a
picture.

## Two names, one slot

`artPrefetch.ts` used to derive the inactive theme's file by swapping the
suffix on the one name a slot had. Since 2.44.0 a slot may draw a different
piece in light (`ThemedArt`'s `light=` prop), so the element carries
`data-twin` — the other theme's URL, written by `scene/ThemedArt.tsx` — and
the prefetch reads that first, falling back to the suffix swap for the winter
pairs that are still one name.

## Things to know before you touch it

- **`THEMED` is a selector list**, not a class. Adding a new kind of element that
  carries colour may mean adding its tag to that list, or the element will change
  instantly while the page around it waves.
- **The delays are cleaned up** after `WAVE_RESTORE` (1700 ms). Leaving them set
  would make every later theme change inherit the previous wave's shape.
- **The auth modal deliberately does not participate.** It is the site's one
  always-dark glass scene and stays itself whatever the page theme is. That is a
  design decision, not an oversight — there was no light variant, so rather than
  invent one it keeps the one true look.
- **Verifying anything colour-related:** the transition runs ~600 ms, so read
  computed styles after it settles. In a tab that is not compositing frames the
  transition freezes at its *start* value and every reading comes back as the
  previous theme. `document.getAnimations().forEach(a => a.finish())` forces
  them to land.
- `motionIntensity` from `lib/motion.ts` is respected: a visitor who asked for
  less motion gets the change without the wave.
