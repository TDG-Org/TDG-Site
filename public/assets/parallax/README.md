# TDG parallax art kit

This folder is a collection of transparent cutouts for the home page, in **two
files per artwork**: a `.png` source and the `.webp` the site actually loads.
See [Two files per artwork](#two-files-per-artwork) below — it is the first
thing to read before adding anything here.

The kit is wired in, through `ThemedArt` and `StillArt` in
[`src/components/scene/`](../../../src/components/scene/README.md) — **sixteen
layers across five sections** of the home page, plus four more as app-card
covers in `KeyArt.tsx`.  Counted with `grep -rn '<ThemedArt\|<StillArt' src/
--include=*.tsx`: eleven `ThemedArt` (Games 5, Origin 2, Outro 2, Tools 2)
and five `StillArt` (Hero 3, Origin 2).  It said thirteen across six until this
pass, and both halves of that had moved.

Sixteen LAYERS, not sixteen pieces: `atmosphere/fog-veil` and
`props/pine-faceted-pair` are each drawn twice in `#games`, and the same
file answers both times, so the layer count runs two ahead of the piece count.
(`ThemedHeroArt` is the third of those components and has no caller;
`scene/README.md` says why it is kept.)  It stays what it always was: framing
layers.  The hero's wordmark, point cloud, shafts and copy remain the primary
scene, and every guardrail below still holds.

**Eighteen of the thirty-two pieces are not placed anywhere, and that is fine.**  A
kit is a kit.  The [Asset selection](#asset-selection) table says which pieces
render today and which do not; an unplaced piece is a spare, not a bug, and it
is not a reason to delete a file or to go and find somewhere to put it.  The
guardrails below — one structural anchor per section, do not build a scene —
are the reason there are spares at all.

> **This count and the table's first column were taken while three other
> builders were editing the same tree**, and `#apps` in particular changed
> under the measurement: it drew `props/tall-pine`, `props/canopy-tree` and
> `props/bushes-reeds` at the start of the pass and draws none of them at the
> end, its scenery having moved into the new `Walk.tsx`.  The grep is the
> answer, not this paragraph.  Run it before you rely on either number.

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
node scripts/parallax-webp.mjs         # only what changed
node scripts/parallax-webp.mjs --all   # force a re-encode
```

**The two caps that used to be here are gone and must not come back.** They
were 1000px for `props/` and 1600px for `landscapes/` and `atmosphere/`, at
`-q:v 84`, and they were written for the winter kit, whose source art is 1024px
wide. The Cebu cut-outs are 3072. Measured in Chrome at 1920x1080 by walking the
document and taking each file's widest rendered box, `props/palm-row` paints at
2458 CSS px, `landscapes/sand-bank` at 3053 and `props/capiz-window` at 1910 —
4916, 6106 and 3820 device pixels on a 2x screen, against files encoded at 1000,
1600 and 1000. The site owner reported it as art that was not the quality he
sent, and he was right.

The cap is per FILE now, and it is `2 x the widest box that file is ever painted
in`, clamped to what the PNG holds, at `-q:v 92`. The table lives in the
script's header; **a piece that moves or resizes needs its entry re-measured**,
and an unmeasured file takes a deliberately generous default. The old command is
still what runs underneath, one file at a time:

```bash
ffmpeg -y -i in.png -vf "scale='if(gt(iw,CAP),CAP,iw)':-1:flags=lanczos" \
  -c:v libwebp -lossless 0 -q:v 92 -compression_level 6 out.webp
```

- **The cap comes from a MEASUREMENT, never from a folder name.**  "Everything
  outside `landscapes/` paints at a few hundred CSS pixels at most" is what the
  old rule assumed and it is false: `props/palm-row` and `props/capiz-window`
  both span the page.  Render the site, read `getBoundingClientRect().width` on
  every `img.scene__art` while walking the whole document, and take the maximum.
- **The slot CANVAS is the other cap, and it is in `scripts/cebu-art.json`.**  A
  3072px cut-out written to a 1024px canvas has already lost two thirds of
  itself before it reaches this step.
- **`-c:v libwebp` is what keeps the alpha channel.**  The encoded files are
  `yuva420p` — verify with `ffprobe -show_entries stream=pix_fmt`.  This is why
  a screenshot-to-JPEG step, or any encoder without an alpha path, destroys this
  art: every cutout here is a silhouette floating on transparency, and flattening
  it onto a background gives you a rectangle with a visible box around it.
- **`q:v 92`**, where it was 84.  The four points are worth about 15% of the
  bytes on this art and they are the difference on a large flat facet, which is
  what almost every piece in this kit is made of.  84 was compared against the
  source at full size and the difference was not findable at the time —  Do not push it lower to save a few more kilobytes; the fine
  edges in this kit — the pine fringe along the mountain ridge, the speckle at
  the top of the fog veil — are what goes first.
- The `if(gt(iw,...))` guard means the filter only ever downscales.  Feed it
  something already small and it is left alone.

### Why this matters enough to be the first section in the file

The PNG kit is **64 files, 61.1 MB** — the heaviest single decorative prop is
2.10 MB, the widest piece is 2172px.  The WebP kit is the same 64 files at
**4.27 MB**: a 93% reduction, and roughly 4–5 MB of eager image bytes off the
home page's first load.  This is a site whose own documentation is proud of taking a
parked reader from 71 ms of main thread per second down to 0.1 ms.  A 1.6 MB
decorative arch undoes that work for a real visitor on a real connection, and
nothing in a typecheck or a build will tell you it happened.

So: one more prop is not free.  Add the `.webp`, keep the sizes above, and if a
piece cannot justify its kilobytes at the scale it actually renders, it does not
go in.

## The Cebu set (the light theme since 2.44.0)

**The light theme is a different picture, not the winter one in silver.** Every
slot the home page draws still names its winter piece, and in light it draws a
Cebu piece instead: the call site says which with the `light=` prop on
`ThemedArt` / `StillArt` (`<StillArt art="props/tall-pine"
light="props/coconut-palm-tall" />`). The dark name stays the slot's identity,
so nothing about the winter kit moved, and a palm is never filed under
`pine-row-light.webp`. The `-light` suffix still means "the file the light
theme loads"; the name in front of it says what is in it.

The set is 23 pieces, every one a `-light.png` source with its `-light.webp`
beside it, encoded with the same ffmpeg line as the winter kit. They are built
by `scripts/cebu-art.py` driven by `scripts/cebu-art.json`, which records per
piece the source, the mode, the crop, and where the cut-out sits on its canvas.
Re-running it regenerates the PNGs exactly; the sources themselves live in the
owner's DevFleet logbook and are not in the repo.

**The modes changed and one of them must not come back.** The first version of
this set was cut out of white-background JPGs by a distance-to-white key (and a
per-row variant of it), which returns zero alpha exactly where the subject IS
white — the clouds shipped at about a twentieth of an alpha and painted as grey
ghosts, the surf vanished, and the palms lost their pale trunks and kept a rind
of speckle where the anti-aliased edge fell between the two thresholds. No pair
of thresholds fixes that, because the information is not in the file. The owner
supplied the same art as PNGs with real alpha, so the modes now are:

| Mode | What it does |
| --- | --- |
| `alpha` | the source already carries its alpha — trim to the ink, fit onto the canvas, touch no pixel's colour |
| `chroma` | a flat backdrop the subject does not contain (the owner's magenta plates), keyed on the colour read off the plate's OWN corners |
| `plate` | crop a region of a full-frame scene, scale, mirror-extend, feather the edges |
| `skyline` | a plate whose alpha follows its own horizon, so a beach is a drift with a crest and not a rectangle |
| `luma` | alpha from luminance, for the haze plates |
| `ellipse` | alpha from an elliptical window, for a patch of ground that fades out |

| Slot (winter piece) | Cebu piece | Where |
| --- | --- | --- |
| `landscapes/mountain-ridge-rear` | `landscapes/far-island` | Hero, the far island, standing on the horizon |
| `landscapes/mountain-ridge-mid` | `landscapes/island-mid` | Hero, the near island, left |
| `landscapes/mountain-ridge` | `landscapes/sea-band` | Hero, **the sea** — its top row is the horizon the sun sits on, drawn opaque |
| `landscapes/valley-fog` | `props/bangka` | Hero, the outrigger crossing the bay on the drifting layer |
| `props/moon-cloud` (near / far) | `props/cumulus-near` / `props/cumulus-far` | Hero, one cloud on the sun's crown, one high and left |
| `props/tall-pine` | `props/coconut-palm-tall` | Hero, right edge |
| `props/near-branch` | `props/palm-frond` | Hero, top-left bough |
| `hero/lamppost-left` | `props/coconut-pair` | Origin, the left-edge anchor planted in the sand bank (a lit lantern at midday belonged to the other theme; `hero/lamppost-cebu` is deleted, not hidden) |
| `landscapes/far-treeline` | `landscapes/far-palms` | Origin's far shore |
| `atmosphere/mist-bank` | `atmosphere/sea-haze` | Origin's haze, and Games' fog and mist (one file, three slots) |
| `props/pine-row` | `props/palm-row` | Origin's near palms |
| `landscapes/snow-bank` | `landscapes/sand-bank` | Origin's beach. `skyline` mode, so its top edge is the dune's own ridge and the palm row behind it shows over the crest |
| `props/window-frost` | `props/capiz-window` | The walk's front stage. The frost is a vignette by construction and this file is not — its ink covers the whole canvas with a cross cut through it — so `Walk.css` masks the middle out and keeps the panes at the edges, at 0.66 rather than the frost's 0.92 |
| `landscapes/stone-footbridge` | `landscapes/beach-pier` | Tools' floor |
| `atmosphere/mist-bank` | `landscapes/sea-band` | Tools' floor, **the water the pier goes out over**. Light only: dark's floor is `.tools__road`, a synthwave grid running to a lit horizon, and light does not draw that composition at all (`Tools.css`). Opaque — water is an object |
| `props/bushes-reeds` | `props/pandan-clump` | Tools' floor |
| `props/fence-rail` | `props/bamboo-rail` | Tools' floor |
| `props/boulder-cluster` | `props/coral-rocks` | Tools' floor |
| `props/wayfinding-post` | `props/beach-signpost` | Games, crossing up into Tools |
| `atmosphere/fog-veil` | `landscapes/shallow-water` | The waterline, crossing up out of Games into Tools' floor — the join between the sea above and the sand below |
| `atmosphere/fog-veil` | `landscapes/beach-terrace-plain` | Games' floor. The plate is `beach-terrace` cropped in the pipeline to its bottom 22%, the one band with no shell or pebble on it, so the crop can sit anywhere. Opaque, and `--band-games` is matched to it |
| `props/pine-faceted-pair` (both stands) | `props/palm-row` | Games. An aspect change as well as a file change: a 3:1 row does not fit the 2:3 hole a pine pair leaves, so `Games.css` gives light its own box — a band across the floor at each stand's own clearance |
| `transitions/stone-stair` | `transitions/beach-steps` | Outro's seam with Faith — **dark only**. In light the flight has no ground above or below it and reads as slabs floating in an empty sky, so `Outro.css` hides the clip; the join is carried by `landscapes/headland` instead |
| `landscapes/far-range-soft` | `landscapes/headland` | Outro, the far shore, standing at `--outro-horizon` with its foot 34px under the lagoon's fading top edge |
| `atmosphere/mist-bank` | `landscapes/sea-band` | Outro, **the lagoon**. Light only, opaque; the section's `padding-bottom` is derived from its top edge so the copy always clears the water |
| `atmosphere/mist-bank` | `landscapes/shallow-water` | Outro, the foam at the waterline, straddling the sand's top edge |
| `landscapes/snow-bank` | `landscapes/beach-terrace-plain` | Outro, the sand the arch and the lantern stand on |
| `props/lantern-post` | `props/capiz-lantern` | Outro |
| `props/garden-arch` | `props/coral-arch` | Outro |
| `transitions/stepping-stones` | `transitions/sand-stones` | Outro |
| — | `props/cumulus-near` / `-far` again | Faith, two clouds in the summit's gutters — never over the disc |
| — | `scene/lagoon-matte` | Not a slot: the painted lagoon `origin/CabinScene.tsx` stands far behind the hut, the one raster in the 3D scene. Feathered on all four edges now, because a quad with a hard rim showed its corners in the sky |

`landscapes/shore-foam` was in this table and is not in the kit any more. It sat
on the hero's drifting layer at the fog's altitude, which over open water is
empty air — the owner read it exactly as it rendered, "triangles by the sun that
move when you scroll". Surf is a thing that happens at a WATERLINE and this
composition has none it could stand on: tried along the sand bank's crest it
read as ice shards on a beach. An asset with no place to be is not kept for
later.

**The placement fractions are per file, and the Cebu ones are in the same
light-only blocks the winter light files used** — `Hero.css`'s
`[data-theme='light'] .hero__rear-drift` and its siblings, `Origin.css`'s
`--tops-head` / `--mist-eye` / `--snow-head`. Two of those blocks do more
than measure now: the two islands pin their `--art-rise` to the stage's
`--horizon` so they stand ON the sea rather than behind it, and the sea's
wrapper drops the `--art-far` haze opacity because water is not haze. Replace
a Cebu file and re-measure its ink the way the winter table above was.

**Guardrail 8 still holds.** One structural anchor per section: the pier, the
signpost, the arch. Nothing in this set is a scene; the scene is the 3D walk.

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
| `landscapes/` | Theme-paired ridges, treelines, snow-bank strips, valley fog, and stone footbridge cutouts | Layered terrain or a quiet lower-section seam. |
| `props/` | Theme-paired trees, fence/threshold/light props, foliage, clouds, frost, bench, wayfinding post, garden arch, and pine grove | Sparse section-edge decoration. |
| `transitions/` | Theme-paired stepping-stone paths and cut-stone stairs | A quiet cue between section beats. |
| `faith/` | Theme-paired hillside crosses | A small, reverent detail. **Not placed** — Faith authors its own terrain and cross; see the table below. |
| `atmosphere/` | Theme-paired fog veils and edge-free mist banks | A slow, quiet layer behind a landscape or prop. |
| `implementation-brief.md` | Implementation brief | The exact handoff prompt for Claude Code. |

Every art folder holds four files per piece: `-dark.png` / `-light.png`, and the
`-dark.webp` / `-light.webp` the site loads.

**`-dark` and `-light` are separate artwork.  Do not recolour one with a CSS
filter:** the pair already accounts for the different contrast ranges of TDG's
two worlds — and since 2.44.0 the light file a slot draws is usually a different
PIECE altogether; see [The Cebu set](#the-cebu-set-the-light-theme-since-2440).  This is a different axis from the PNG/WebP pair above and the two
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
| Mid mountain ridge | `landscapes/mountain-ridge-mid` | Not placed. | An optional third hero depth range between `mountain-ridge` and `mountain-ridge-rear`; its ragged lower silhouette avoids a ruled horizon. |
| Far treeline | `landscapes/far-treeline` | Not placed. | A very pale aerial-haze horizon, never a row of individual foreground tree props. |
| Far soft range | `landscapes/far-range-soft` | Not placed. | Ultra-distant smooth hills for a bright-disc composition. Keep it separate from Faith's authored SVG summit unless that section is deliberately revised. |
| Valley fog | `landscapes/valley-fog` | Not placed. | A free-floating valley weather layer; its alpha fades on all four sides so it needs no CSS mask. |
| Snow bank | `landscapes/snow-bank` | **Origin**, and it is that section's entire boundary treatment: the crest stands up into the hero and the body fills down into Origin. It replaced the `Seam` that used to sit there — two silhouettes on one boundary is mush. | A low foreground drift that runs beyond both section edges; a floor, not a scene. |
| Park lamppost | `hero/lamppost-left` | **Origin**, not the hero — and that is the trick. It is a child of `#origin`, so it paints over the hero's stage while its foot plants 30px inside Origin's snow; a pole living in a pinned hero is painted over the instant Origin rises. `display: none` below 1366px. | Far-left edge, below navigation, no closer than 30px to the wordmark. |
| Pine pair | `props/pine-pair` | **Origin**, the far tree layer. | A secondary edge prop, never adjacent to the lamppost. The faceted pair below is the default; this is the plainer variation. |
| Faceted pine pair | `props/pine-faceted-pair` | **Games, twice** — one stand at 27vw against the floor and a second at 14vw much further back, the same file at `--art-far` with the fog band drawn between them. Size, opacity and haze are the three things doing the distance, and none of them costs a byte. Also the Say2Quill app cover. | **Recommended tree pair.** Strong graphic facets with no realistic foliage. |
| Tall foreground pine | `props/tall-pine` | **Hero** (the near foreground, and the layer that answers the mouse most). It was also in **Apps** until that section's scenery moved into `Walk.tsx` this pass. | One oversized edge prop, cropped by the frame. Alone in its composition, not alongside another pine family — which is a rule about one section, not about the page. |
| Pine row | `props/pine-row` | Not placed. | A single wide foreground/midground treeline with varied trees. Use it instead of duplicating and mirroring the two-tree props. |
| Near branch | `props/near-branch` | Not placed. | A top-left through-frame foreground bough; its top and left crops are intentional. |
| Fence rail | `props/fence-rail` | Not placed. | A perspective cue beside a bench or path, running lower-left to upper-right and out of frame. |
| Moon cloud | `props/moon-cloud` | Not placed. | One thin alpha-feathered cloud wisp to cross the existing vector moon; it never replaces or contains a moon. |
| Reed clump, tall | `props/reed-clump-tall` | Not placed. | One vertical foliage accent, cropped through its bottom edge. |
| Gate-post pair | `props/gate-post-pair` | Not placed. | An open threshold before the garden arch. The central transparent gap is the point; never add a gate. |
| Lantern post | `props/lantern-post` | Not placed. | A small final-beat light source. Its painted glow is intentionally local and warm-neutral. |
| Window frost | `props/window-frost` | Not placed. | A cabin-window overlay with an open central reading area and low-poly corner crystals only. |
| Boulder cluster | `props/boulder-cluster` | **Tools**, on a pointer-sway wrapper. | A dark, chunky bottom-corner anchor; pair only with a quiet landscape layer. |
| Canopy tree | `props/canopy-tree` | Not placed. It was in **Apps** until that section's scenery moved this pass. | A distinct, softer silhouette for a later section. |
| Park bench | `props/park-bench` | Not placed. | Compact lower-corner accent opposite a tree or lamppost. |
| Bushes and reeds | `props/bushes-reeds` | Not placed. It was **Apps**' low floor cover until that section's scenery moved this pass. | A low foreground cover or section seam. |
| Fog veil | `atmosphere/fog-veil` | **Games, twice** — the far backdrop between its two stands of pines, and a shallow band cropped out of the same file at the section's top boundary. One URL, one request, two layers. It is no longer the only piece drawn twice inside one section: `props/pine-faceted-pair` is now as well, in the same one, for the same reason. | Far backdrop; place behind mountains and props. |
| Mist bank | `atmosphere/mist-bank` | Not placed. | An edge-free section-boundary atmosphere layer. It replaces neither the existing fog veil nor a CSS mask until a section measures better with it. |
| Wayfinding post | `props/wayfinding-post` | **Games**, its one structural anchor — the signpost on the far bank, in the band that crosses up into `#tools`. Not Origin, which this Intent column still says: a signpost belongs where a path arrives at somewhere, and Origin's far edge is a clearing with a cabin in it. | Origin's far edge; its boards must stay blank. |
| Stone footbridge | `landscapes/stone-footbridge` | **Tools** — not Origin, which this row used to say. Also the Music Everything app cover, where its repeating arches read as a bar line. | A low seam, used instead of—not with—the stepping stones. |
| Garden arch | `props/garden-arch` | **Outro**, the far-edge threshold. Also the Makullveny app cover. | A far-edge threshold, never a content container. |
| Stepping stones | `transitions/stepping-stones` | **Outro**, in the right gutter, mirrored so the path recedes toward the arch. Not Origin: that section's behind-the-timeline layer is `origin/CabinScene.tsx` now. It is not a second structural anchor beside the arch — it is a path on the ground, which is what guardrail 8's "plus optional low foliage" clause is for. | A subtle Origin transition, behind the timeline. |
| Stone stair | `transitions/stone-stair` | Not placed. | A left-descending cut-stone section join. Use as an alternative transition, not beside the stepping stones. |
| Hillside cross | `faith/hillside-cross` | **Not placed, and Faith is not the section to place it in — see below.** | It was drawn as a small Faith-only lower-corner detail below the verse. |
| Pine grove | `props/pine-grove` | **Origin**, the near tree layer, with `pine-pair` behind it. | A richer edge anchor for one later section; never beside the lamppost. The optional painterly variation — do not substitute it for the faceted pair. |

The **Faceted pine pair** is the default tree treatment for this kit: it has
clear illustrated facets and an expressive silhouette without naturalistic
foliage.  Keep the more painterly `pine-grove` files as an optional variation;
do not substitute them for the faceted pair by default and never remove either
family when adding further tree props.

The fourteen new checklisted pieces above are intentionally **not placed by this
asset pass**.  They exist so each owning section can adopt one after a measured
layout review; the kit does not authorise filling empty space just because art
is available.

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

Five of the six are placed today — `pine-grove` in Origin, `stone-footbridge`
in Tools, `wayfinding-post` in Games, and `garden-arch` plus
`stepping-stones` in the Outro.  It was two when this paragraph was written and
the ratio was called the guardrail working; read it again now and the guardrail
is still what it always was, which is **one structural anchor per SECTION** and
never a quota on the kit.  Every section named above has exactly one:
`stepping-stones` is a path lying on the Outro's floor, not a second threshold
beside the arch, and `pine-grove` is a tree.

The one that stays unplaced is `hillside-cross`, and the section it was drawn
for is the section that may not have it — see below.

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
