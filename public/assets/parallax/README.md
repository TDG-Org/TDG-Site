# TDG parallax art kit

This folder is a source-ready collection of transparent PNG cutouts for the
home page.  It deliberately **does not wire the art into the site**: the hero's
current wordmark, point cloud, shafts, and copy remain the primary scene.

Every PNG in this kit has a real alpha channel.  The black visible in some image
previewers represents transparency, not a painted background.

## Visual language

- Flat 2D graphic art: chunky low-poly planes, broad matte shapes, and clean
  storybook silhouettes.
- A restrained blue / graphite palette.  The dark set carries a small midnight
  blue note; the light set is intentionally low contrast and pale.
- Minimal by design.  These are framing layers, never background scenes and
  never substitutes for the existing hero's point-cloud art.
- No text, people, animals, or decorative frames.  They are safe to mark
  `aria-hidden` and use with `pointer-events: none`.

## Folder map

| Folder | Contents | Intended use |
| --- | --- | --- |
| `hero/` | Theme-paired lampposts | A small left-edge hero detail. |
| `landscapes/` | Theme-paired mountain ridge cutouts | The bottom hero layer; reveal upward behind the strip. |
| `props/` | Theme-paired pine, canopy tree, bench, and foliage/reed cutouts | Sparse section-edge or transition decoration. |
| `atmosphere/` | Theme-paired fog veils | A slow, quiet layer behind a landscape or prop. |
| `implementation-brief.md` | Implementation brief | The exact handoff prompt for Claude Code. |

`-dark` and `-light` are separate artwork.  Do not recolour one with a CSS
filter: the pair already accounts for the different contrast ranges of TDG's
two worlds.

## Asset selection

| Asset group | Dark | Light | Placement |
| --- | --- | --- | --- |
| Mountain ridge | `landscapes/mountain-ridge-dark.png` | `landscapes/mountain-ridge-light.png` | Hero floor, behind the content and model. |
| Park lamppost | `hero/lamppost-left-dark.png` | `hero/lamppost-left-light.png` | Far-left edge, below navigation, no closer than 30px to the wordmark. |
| Pine pair | `props/pine-pair-dark.png` | `props/pine-pair-light.png` | A secondary edge prop, never adjacent to the lamppost. |
| Canopy tree | `props/canopy-tree-dark.png` | `props/canopy-tree-light.png` | A distinct, softer silhouette for a later section. |
| Park bench | `props/park-bench-dark.png` | `props/park-bench-light.png` | Compact lower-corner accent opposite a tree or lamppost. |
| Bushes and reeds | `props/bushes-reeds-dark.png` | `props/bushes-reeds-light.png` | A low foreground cover or section seam. |
| Fog veil | `atmosphere/fog-veil-dark.png` | `atmosphere/fog-veil-light.png` | Far backdrop; place behind mountains and props. |

## Guardrails for implementation

1. Load paths through `asset()` from `src/lib/asset.ts`; the deployed site is
   served from `/TDG-Site/`.
2. Render the selected themed image as decorative (`alt=""`, `aria-hidden`,
   `pointer-events: none`) and swap the actual source on `data-theme`, rather
   than recolouring the art in CSS.
3. The hero stack is deliberate.  Keep fog and mountains below the point cloud;
   keep every prop below the hero content; never place art over the `TDG` mark,
   eyebrow, CTA group, nav, or bottom strip.
4. Use the existing `useHeroParallax` / `useParallax` hooks only.  No new scroll
   listener, direct `requestAnimationFrame`, interval, animation package, or
   continuously animated image filter.
5. Respect reduced motion.  At `motionIntensity === 0`, leave art in its
   composed resting location—visible but still.
6. Start very subtly: the mountains at 0.48–0.64 opacity in dark and
   0.34–0.48 in light; props at 0.50–0.72 in dark and 0.38–0.56 in light.  Let
   the art disappear first when vertical space is tight.
7. At `max-width: 640px`, hide the peripheral lamppost and bench.  Keep only a
   simplified mountain/fog composition if it does not obscure hero copy.

## Validation after integration

- Verify both themes after the theme wave settles.
- Check 375px and 1440px, then 300% zoom.  Art must not introduce overflow or
  overlap copy / controls.
- Use the existing browser checks: keyboard path, console, reduced motion,
  `npm run typecheck`, and `npm run build`.
