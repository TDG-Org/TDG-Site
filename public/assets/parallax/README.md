# TDG parallax art kit

This folder is a collection of transparent cutouts for the home page, in **two
files per artwork**: a `.png` source and the `.webp` the site actually loads.
See [Two files per artwork](#two-files-per-artwork) below — it is the first
thing to read before adding anything here.

The kit is now wired in, through `ThemedArt` / `ThemedHeroArt` / `StillArt` in
[`src/components/scene/`](../../../src/components/scene/README.md).  It stays
what it always was: framing layers.  The hero's wordmark, point cloud, shafts
and copy remain the primary scene, and every guardrail below still holds.

Every file in this kit has a real alpha channel.  The black visible in some
image previewers represents transparency, not a painted background.

## Two files per artwork

`.png` is the **source**.  It is what the art tool emits, it stays in the repo,
and it is what you re-render from when a piece needs changing.

`.webp` is what the **site loads**.  Same name, same folder, `.webp` instead of
`.png`.  Every component that asks for a piece of this kit asks for the `.webp`
and only the `.webp` — `ThemedArt`, `ThemedHeroArt`, `StillArt`, and the app
covers in `src/components/KeyArt.tsx`.  Nothing on the site ever requests a
`.png` from this folder.

**Adding new art means adding the pair *and* generating its `.webp`.**  A
`-dark.png` / `-light.png` pair dropped in here with no `.webp` beside it does
not render — it 404s.  There is no fallback anywhere in the code, and a missing
decorative image fails silently: no error, no console warning, just a section
that quietly lost its scenery.

The exact command that produced the ones already here, so this is reproducible
rather than folklore:

```bash
ffmpeg -y -i in.png -vf "scale='if(gt(iw,1000),1000,iw)':-1:flags=lanczos" \
  -c:v libwebp -lossless 0 -q:v 84 -compression_level 6 out.webp
```

- **`1000` for most folders, `1600` for `landscapes/` and `atmosphere/`.**  Those
  two span the full page width; everything else paints at a few hundred CSS
  pixels at most and 1000 is already generous for a retina reader.
- **`-c:v libwebp` is what keeps the alpha channel.**  The encoded files are
  `yuva420p` — verify with `ffprobe -show_entries stream=pix_fmt`.  This is why
  a screenshot-to-JPEG step, or any encoder without an alpha path, destroys this
  art: every cutout here is a silhouette floating on transparency, and flattening
  it onto a background gives you a rectangle with a visible box around it.
- **`q:v 84`** was compared against the source at full size and the difference
  was not findable.  Do not push it lower to save a few more kilobytes; the fine
  edges in this kit — the pine fringe along the mountain ridge, the speckle at
  the top of the fog veil — are what goes first.
- The `if(gt(iw,...))` guard means the filter only ever downscales.  Feed it
  something already small and it is left alone.

### Why this matters enough to be the first section in the file

The PNG kit is **28 files, 28.0 MB** — the heaviest single decorative prop is
2.10 MB, the widest piece is 2172px.  The WebP kit is the same 28 pieces at
**2.0 MB**: a 93% reduction, and roughly 3–4 MB of eager image bytes off the
home page's first load.  This is a site whose own documentation is proud of taking a
parked reader from 71 ms of main thread per second down to 0.1 ms.  A 1.6 MB
decorative arch undoes that work for a real visitor on a real connection, and
nothing in a typecheck or a build will tell you it happened.

So: one more prop is not free.  Add the `.webp`, keep the sizes above, and if a
piece cannot justify its kilobytes at the scale it actually renders, it does not
go in.

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
| `transitions/` | Theme-paired stepping-stone paths | A quiet cue between Origin beats. |
| `faith/` | Theme-paired hillside crosses | A small, reverent Faith-section detail. |
| `atmosphere/` | Theme-paired fog veils | A slow, quiet layer behind a landscape or prop. |
| `implementation-brief.md` | Implementation brief | The exact handoff prompt for Claude Code. |

Every art folder holds four files per piece: `-dark.png` / `-light.png`, and the
`-dark.webp` / `-light.webp` the site loads.

**`-dark` and `-light` are separate artwork.  Do not recolour one with a CSS
filter:** the pair already accounts for the different contrast ranges of TDG's
two worlds.  This is a different axis from the PNG/WebP pair above and the two
are never traded against each other — the `.webp` step is a re-encode of one
file at a smaller size, and it never touches which of the two artworks is drawn.

## Asset selection

| Asset group | Dark | Light | Placement |
| --- | --- | --- | --- |
| Mountain ridge | `landscapes/mountain-ridge-dark.webp` | `landscapes/mountain-ridge-light.webp` | Hero floor, behind the content and model. |
| Park lamppost | `hero/lamppost-left-dark.webp` | `hero/lamppost-left-light.webp` | Far-left edge, below navigation, no closer than 30px to the wordmark. |
| Pine pair | `props/pine-pair-dark.webp` | `props/pine-pair-light.webp` | A secondary edge prop, never adjacent to the lamppost. |
| Faceted pine pair | `props/pine-faceted-pair-dark.webp` | `props/pine-faceted-pair-light.webp` | **Recommended tree pair.** Strong graphic facets with no realistic foliage. |
| Canopy tree | `props/canopy-tree-dark.webp` | `props/canopy-tree-light.webp` | A distinct, softer silhouette for a later section. |
| Park bench | `props/park-bench-dark.webp` | `props/park-bench-light.webp` | Compact lower-corner accent opposite a tree or lamppost. |
| Bushes and reeds | `props/bushes-reeds-dark.webp` | `props/bushes-reeds-light.webp` | A low foreground cover or section seam. |
| Fog veil | `atmosphere/fog-veil-dark.webp` | `atmosphere/fog-veil-light.webp` | Far backdrop; place behind mountains and props. |
| Wayfinding post | `props/wayfinding-post-dark.webp` | `props/wayfinding-post-light.webp` | Origin's far edge; its boards must stay blank. |
| Stone footbridge | `landscapes/stone-footbridge-dark.webp` | `landscapes/stone-footbridge-light.webp` | A low Origin seam, used instead of—not with—the stepping stones. |
| Garden arch | `props/garden-arch-dark.webp` | `props/garden-arch-light.webp` | A far-edge Outro threshold, never a content container. |
| Stepping stones | `transitions/stepping-stones-dark.webp` | `transitions/stepping-stones-light.webp` | A subtle Origin transition, behind the timeline. |
| Hillside cross | `faith/hillside-cross-dark.webp` | `faith/hillside-cross-light.webp` | A small Faith-only lower-corner detail, below the verse. |
| Pine grove | `props/pine-grove-dark.webp` | `props/pine-grove-light.webp` | A richer edge anchor for one later section; never beside the lamppost. |

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
   served from `/TDG-Site/`.  Ask for the `.webp`, never the `.png` — see
   [Two files per artwork](#two-files-per-artwork).
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
- Check the network panel, which is the one thing the build will not check for
  you: every request into `assets/parallax/` should be a `.webp`, and none
  should 404.  A `.png` request means a component wrote the extension itself;
  a 404 means art was added without its `.webp`.
