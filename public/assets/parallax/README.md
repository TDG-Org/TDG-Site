# TDG parallax art kit

This folder is a collection of transparent cutouts for the home page, in **two
files per artwork**: a `.png` source and the `.webp` the site actually loads.
See [Two files per artwork](#two-files-per-artwork) below — it is the first
thing to read before adding anything here.

The kit is wired in, through `ThemedArt` and `StillArt` in
[`src/components/scene/`](../../../src/components/scene/README.md) — twelve
layers across six sections of the home page, plus four more as app-card covers
in `KeyArt.tsx`.  (`ThemedHeroArt` is the third of those components and has no
caller at the moment; `scene/README.md` says why it is kept.)  It stays what it
always was: framing layers.  The hero's wordmark, point cloud, shafts and copy
remain the primary scene, and every guardrail below still holds.

**Seven of the eighteen pieces are not placed anywhere, and that is fine.**  A
kit is a kit.  The [Asset selection](#asset-selection) table says which pieces
render today and which do not; an unplaced piece is a spare, not a bug, and it
is not a reason to delete a file or to go and find somewhere to put it.  The
guardrails below — one structural anchor per section, do not build a scene —
are the reason there are spares at all.

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

The PNG kit is **36 files, 35.4 MB** — the heaviest single decorative prop is
2.10 MB, the widest piece is 2172px.  The WebP kit is the same 36 pieces at
**2.3 MB**: a 93% reduction, and roughly 2–3 MB of eager image bytes off the
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
| `landscapes/` | Theme-paired mountain ridges, snow-bank strips, and stone footbridge cutouts | Layered hero terrain or a quiet lower-section seam. |
| `props/` | Theme-paired trees, boulder clusters, bench, foliage/reeds, wayfinding post, garden arch, and pine grove | Sparse section-edge decoration. |
| `transitions/` | Theme-paired stepping-stone paths | A quiet cue between Origin beats. |
| `faith/` | Theme-paired hillside crosses | A small, reverent detail. **Not placed** — Faith authors its own terrain and cross; see the table below. |
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

Two columns: **Placed** is where the piece renders today, from a grep of
`art="` across `src/`; **Intent** is what the piece was drawn for and is the
guidance for anyone placing it. Re-run the grep rather than trusting the first
column — this table has already been out of date once.

| Asset group | Files (`-dark` / `-light`, both `.webp`) | Placed | Intent |
| --- | --- | --- | --- |
| Mountain ridge | `landscapes/mountain-ridge` | **Hero**, the horizon inside its pinned stage. Also the DevFleet app cover in `KeyArt.tsx`. | Hero floor, behind the content and model. |
| Rear mountain ridge | `landscapes/mountain-ridge-rear` | **Hero**, behind the main ridge, drifting at half its rate. | Distant Hero/Origin layer, **behind** the main ridge. Never Faith — Faith's terrain is authored SVG. |
| Snow bank | `landscapes/snow-bank` | **Origin**, and it is that section's entire boundary treatment: the crest stands up into the hero and the body fills down into Origin. It replaced the `Seam` that used to sit there — two silhouettes on one boundary is mush. | A low foreground drift that runs beyond both section edges; a floor, not a scene. |
| Park lamppost | `hero/lamppost-left` | **Origin**, not the hero — and that is the trick. It is a child of `#origin`, so it paints over the hero's stage while its foot plants 30px inside Origin's snow; a pole living in a pinned hero is painted over the instant Origin rises. `display: none` below 1366px. | Far-left edge, below navigation, no closer than 30px to the wordmark. |
| Pine pair | `props/pine-pair` | Not placed. | A secondary edge prop, never adjacent to the lamppost. The faceted pair below is the default; this is the plainer variation. |
| Faceted pine pair | `props/pine-faceted-pair` | **Building**. Also the Say2Quill app cover. | **Recommended tree pair.** Strong graphic facets with no realistic foliage. |
| Tall foreground pine | `props/tall-pine` | **Hero** (the near foreground, and the layer that answers the mouse most) and **Apps**. | One oversized edge prop, cropped by the frame. Alone in its composition, not alongside another pine family — which is a rule about one section, not about the page. |
| Boulder cluster | `props/boulder-cluster` | **Tools**, on a pointer-sway wrapper. | A dark, chunky bottom-corner anchor; pair only with a quiet landscape layer. |
| Canopy tree | `props/canopy-tree` | Not placed. | A distinct, softer silhouette for a later section. |
| Park bench | `props/park-bench` | Not placed. | Compact lower-corner accent opposite a tree or lamppost. |
| Bushes and reeds | `props/bushes-reeds` | **Apps**, the low cover along that section's floor. | A low foreground cover or section seam. |
| Fog veil | `atmosphere/fog-veil` | **Building**, the far backdrop behind its pines. | Far backdrop; place behind mountains and props. |
| Wayfinding post | `props/wayfinding-post` | Not placed. | Origin's far edge; its boards must stay blank. |
| Stone footbridge | `landscapes/stone-footbridge` | **Tools** — not Origin, which this row used to say. Also the Music Everything app cover, where its repeating arches read as a bar line. | A low seam, used instead of—not with—the stepping stones. |
| Garden arch | `props/garden-arch` | **Outro**, the far-edge threshold. Also the Makullveny app cover. | A far-edge threshold, never a content container. |
| Stepping stones | `transitions/stepping-stones` | Not placed. Origin's behind-the-timeline layer is `origin/CabinScene.tsx` now. | A subtle Origin transition, behind the timeline. |
| Hillside cross | `faith/hillside-cross` | **Not placed, and Faith is not the section to place it in — see below.** | It was drawn as a small Faith-only lower-corner detail below the verse. |
| Pine grove | `props/pine-grove` | Not placed. | A richer edge anchor for one later section; never beside the lamppost. The optional painterly variation — do not substitute it for the faceted pair. |

The **Faceted pine pair** is the default tree treatment for this kit: it has
clear illustrated facets and an expressive silhouette without naturalistic
foliage.  Keep the more painterly `pine-grove` files as an optional variation;
do not substitute them for the faceted pair by default and never remove either
family when adding further tree props.

`tall-pine` is deliberately a **single foreground** variation rather than a
replacement for the faceted pair.  It keeps the same broad illustrated facet
language while offering an edge-overflow silhouette for a different depth plane.
It is not a reason to add multiple trees to one composition.

### Why Faith stopped using `faith/hillside-cross`

**The files stay.** Nothing below is a case for deleting them, and the kit is
not tidier for having exactly as many pieces as the page currently draws. This
is here because the Hillside cross row in the table above used to claim a live
placement, and a reader who went looking for it in `Faith.tsx` would find
something else entirely.

Faith draws its own terrain now — `src/components/faith/Summit.tsx`: three
smooth authored ridges, the moon low behind them, and the site's own
`CrossGlyph` standing on the crest with the disc directly behind it. The
reasoning is in that file's header and in `Faith.tsx`, and it is four things at
once rather than a preference:

- **A second cross on a second hill.** Once the summit exists, this artwork
  brings its own hill *and* its own cross into a section that already has one
  of each. Guardrail 8 below — at most one structural anchor per section — is
  exactly that rule, and the hill inside the artwork would have to be hidden
  behind the hill the section draws.
- **The wrong texture.** This piece is faceted low-poly, which is the hero's
  language. The reference for Faith is soft, smooth, layered hills in flat
  tones and almost entirely negative space; a facet count is the fastest way to
  lose that.
- **A light source that disagrees.** Its glow is painted into its own alpha,
  lighting the cross from behind and to the right. The moon in that section is
  a real object at a known position, and the two do not agree.
- **It is a raster.** It cannot ride the theme wave the way a `<stop>` does,
  and it cannot be resized without bytes. `CrossGlyph` is one path that scales
  to any height for nothing and crosses on the wave for free.

None of that is a fault in the art. It is a piece drawn for a Faith section
that was a corner detail under a verse, and that section grew a summit.

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

Two of the six are placed today — `stone-footbridge` in Tools and `garden-arch`
in the Outro, one section each.  That ratio is the guardrail working, not a
backlog: six anchors on a seven-section page would be six illustrated scenes.

## Guardrails for implementation

1. Load paths through `asset()` from `src/lib/asset.ts`; the deployed site is
   served from `/TDG-Site/`.  Ask for the `.webp`, never the `.png` — see
   [Two files per artwork](#two-files-per-artwork).
2. Render the selected themed image as decorative (`alt=""`, `aria-hidden`,
   `pointer-events: none`) and swap the actual source on `data-theme`, rather
   than recolouring the art in CSS.
3. The hero stack is deliberate.  If the distant terrain is used, order it
   fog → rear mountain ridge → main mountain ridge → optional snow bank. Keep
   those layers below the point cloud, and keep every prop below the hero
   content; never place art over the `TDG` mark, eyebrow, CTA group, nav, or
   bottom strip. The rear mountain is for Hero/Origin depth only, never Faith.
4. Use the existing `useHeroParallax` / `useParallax` hooks only.  No new scroll
   listener, direct `requestAnimationFrame`, interval, animation package, or
   continuously animated image filter.
5. Respect reduced motion.  At `motionIntensity === 0`, leave art in its
   composed resting location—visible but still.
6. Start very subtly: the mountains at 0.48–0.64 opacity in dark and
   0.34–0.48 in light; props at 0.50–0.72 in dark and 0.38–0.56 in light.  Let
   the art disappear first when vertical space is tight.
7. At `max-width: 640px`, hide the peripheral lamppost and bench.  Keep only a
   simplified mountain/fog composition if it does not obscure hero copy.  This
   is a floor and the page is currently stricter than it: `.origin__lamp` is
   `display: none` until `min-width: 1366px`, because the clearance it needs
   from the wordmark is solved from the hero's own copy column and there is no
   room for it below that.  The bench is not placed at all.
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
