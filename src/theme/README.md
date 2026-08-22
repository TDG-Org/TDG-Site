# `src/theme/` · two worlds, and the wave between them

One file, `ThemeProvider.tsx`. It owns exactly one piece of state — `dark` or
`light` — and the choreography of changing it.

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
