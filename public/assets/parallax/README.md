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
| `landscapes/` | Theme-paired mountain ridge and stone footbridge cutouts | The hero floor or a quiet lower section seam. |
| `props/` | Theme-paired trees, bench, foliage/reeds, wayfinding post, garden arch, and pine grove | Sparse section-edge decoration. |
| `transitions/` | Theme-paired stepping-stone paths | A quiet cue between Story beats. |
| `faith/` | Theme-paired hillside crosses | A small, reverent Faith-section detail. |
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
| Faceted pine pair | `props/pine-faceted-pair-dark.png` | `props/pine-faceted-pair-light.png` | **Recommended tree pair.** Strong graphic facets with no realistic foliage. |
| Canopy tree | `props/canopy-tree-dark.png` | `props/canopy-tree-light.png` | A distinct, softer silhouette for a later section. |
| Park bench | `props/park-bench-dark.png` | `props/park-bench-light.png` | Compact lower-corner accent opposite a tree or lamppost. |
| Bushes and reeds | `props/bushes-reeds-dark.png` | `props/bushes-reeds-light.png` | A low foreground cover or section seam. |
| Fog veil | `atmosphere/fog-veil-dark.png` | `atmosphere/fog-veil-light.png` | Far backdrop; place behind mountains and props. |
| Wayfinding post | `props/wayfinding-post-dark.png` | `props/wayfinding-post-light.png` | Story's far edge; its boards must stay blank. |
| Stone footbridge | `landscapes/stone-footbridge-dark.png` | `landscapes/stone-footbridge-light.png` | A low Story seam, used instead of—not with—the stepping stones. |
| Garden arch | `props/garden-arch-dark.png` | `props/garden-arch-light.png` | A far-edge Outro threshold, never a content container. |
| Stepping stones | `transitions/stepping-stones-dark.png` | `transitions/stepping-stones-light.png` | A subtle Story transition, behind the timeline. |
| Hillside cross | `faith/hillside-cross-dark.png` | `faith/hillside-cross-light.png` | A small Faith-only lower-corner detail, below the verse. |
| Pine grove | `props/pine-grove-dark.png` | `props/pine-grove-light.png` | A richer edge anchor for one later section; never beside the lamppost. |

The **Faceted pine pair** is the default tree treatment for this kit: it has
clear illustrated facets and an expressive silhouette without naturalistic
foliage.  Keep the more painterly `pine-grove` files as an optional variation;
do not substitute them for the faceted pair by default and never remove either
family when adding further tree props.

## Richer-detail family

`wayfinding-post`, `stone-footbridge`, `garden-arch`, `stepping-stones`,
`hillside-cross`, and `pine-grove` deliberately carry more facets than the
first foliage props.  The faceted pine pair deliberately stays one step
cleaner than these story anchors: it is detailed graphic art, not a realistic
painted tree.
They are the kit's **story anchors**: use one, at a small scale, to suggest a
place without turning a content section into an illustrated scene.  Their dark
versions are materially deeper midnight blue; their light partners are paler
mist/silver with a narrow graphite-blue note.  This contrast shift is why both
files must be swapped as actual themed assets rather than filtered.

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
8. Do not build a scene from the kit.  A section gets at most one structural
   anchor (bridge, arch, wayfinder, or cross), plus optional low foliage/fog.

## Validation after integration

- Verify both themes after the theme wave settles.
- Check 375px and 1440px, then 300% zoom.  Art must not introduce overflow or
  overlap copy / controls.
- Use the existing browser checks: keyboard path, console, reduced motion,
  `npm run typecheck`, and `npm run build`.
