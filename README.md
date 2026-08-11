# TDG — The Disciples of God

The landing page for **TDG**, two brothers building software, games, and tools.

Stack: **Vite + React 19 + TypeScript**, plain CSS with custom-property tokens. No UI or
animation libraries — the motion is small enough to own, and owning it is what keeps the
timings exact.

```bash
npm install
npm run dev        # http://localhost:5180
npm run build      # typecheck + production bundle into dist/
npm run typecheck
```

## Layout

```
src/
  styles/tokens.css     design tokens, both themes, theme-transition plumbing
  styles/base.css       reset, shared primitives (.card, .chip, .kicker…), keyframes
  lib/motion.ts         the single rAF loop every animation subscribes to
  theme/ThemeProvider   theme state + the distance-delayed colour wave
  hooks/                useReveal · useTilt · useParallax · useOffscreenPause
  components/           one file + one stylesheet per section
  components/hero/      the point cloud, its twelve forms, and the dust field
  data/content.ts       all copy, cards and links
public/shots/           product screenshots, AVIF + WebP at 1x and 2x
```

## The four things that carry the character

**The theme wave.** Colour crosses the page from the toggle rather than snapping. Every
themed element gets a `--wave-delay` derived from its distance to the click point as a
fraction of the farthest corner (0–640ms); the stylesheet reads that variable inside its
transition declarations, so each element animates on its own clock. The step that makes it
work is the forced reflow in `ThemeProvider` between setting the delays and flipping
`data-theme` — without it the browser has no "from" value and the whole thing snaps.

**The hero point cloud.** Up to 4200 points morphing between twelve forms, drawn to a 2D
canvas with additive blending. Each form is a weighted set of sampler primitives
(`hero/shapes.ts`), so every form emits the same point count and a morph is a straight
point-for-point lerp with a swirl riding the midpoint. It rotates **only** while the left
button is held and dragged — never on hover — with inertia and X rotation clamped to ±1.15
rad. Every brightness × on-screen-size combination is pre-rendered into a sprite atlas, so
the hot loop is a 1:1 blit with no per-point canvas state changes.

**Section blending.** Story, Tools and Faith paint a top-to-bottom blend; Apps and Building
stay flat as contrast anchors. Each blending section's edge colour equals its flat
neighbour's exactly, so every boundary meets on an identical value. The stops live in
`@property`-registered custom properties, which is what lets the gradients ride the theme
wave instead of snapping.

**Card hover.** Tilt toward the cursor plus a cursor-following spotlight and a 1px inset
ring that is brightest nearest the pointer. Story rows use the same machinery at a
deliberately gentler setting — 1.05°, 2.5px, 0.95s settle.

## Motion, cursor and accessibility

One `requestAnimationFrame` loop drives parallax, the hero→story takeover, the story spine
fill, the scroll progress bar, the custom cursor and the reveal choreography. Subscribers
measure in one phase and write in another, so a frame costs one layout flush rather than
one per subscriber. Decorative animations are parked while their section is off screen.

The custom cursor is a dot that tracks exactly plus a ring that trails and reacts — open
over anything clickable, dashed over the draggable hero model, pinched on press. Fine
pointers only; touch devices keep their native behaviour, and the native cursor is only
hidden once the script has mounted.

Everything respects `prefers-reduced-motion`. `:focus-visible` rings are 2px `--accent` at
3px offset on every interactive element, including story rows and image slots.

## Content

All copy, cards, chips and links live in `src/data/content.ts`. Screenshots are in
`public/shots/` as AVIF with a WebP fallback at 1x and 2x; regenerate them from a source
image at 16:10 (16:11 for the MARANATHA panel).

Cards without a screenshot render a drop target instead — drag an image onto one and it is
kept in that browser's `localStorage`, so the page can be reviewed filled-in before the real
asset lands. To ship one for real, add a `shot` entry to the card in `content.ts`.

Fonts (Cormorant Garamond, Space Grotesk, Manrope, JetBrains Mono) load from Google Fonts,
trimmed to the exact weights the stylesheet sets. Self-host for production if you'd rather
not depend on it.
