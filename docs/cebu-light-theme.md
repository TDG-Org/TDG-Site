# The Cebu light theme · what to make, what changes, and how it stays fast

Written 2026-09-01 from the live page, not from memory: every section of the
home page was captured in both themes at 1600×900 and 390×844, every art slot
was measured off the CSS, and every place the light theme differs from dark
was grepped. This is the brief for turning the light theme into Cebu. Nothing
here is implemented yet; the owner asked for the plan and the shopping list
first.

The short version:

> **The light theme is already a separate set of artwork, a separate palette,
> and a separate lighting rig for the 3D scene. It is just the wrong picture:
> the same winter valley painted in silver.** So Cebu is not a rebuild. It is
> 23 new cut-outs dropped into the slots the winter ones sit in, one new token
> palette, a daylight lighting rig for the 3D walk plus a beach house built
> the way the cabin was, and three small pieces of plumbing so the toggle
> cross-fades instead of popping. The layout, the copy, the point-cloud model,
> the camera walk, the cards, the nav and every interaction stay byte for
> byte.

---

## 1 · How the page is themed today, and what that buys us

Five mechanisms carry the theme. Knowing which one owns each pixel is what
makes the Cebu work small.

| Mechanism | What it owns | Cebu cost |
| --- | --- | --- |
| **Tokens** (`src/styles/tokens.css`, `[data-theme='light']` at line 687) | Every colour on the page: text, cards, nav, seams, the hero sky gradient, the moon's three colours, the lamp glow, the section bands, art opacity | A new light block. Nothing else. |
| **The art kit** (`public/assets/parallax/`, 32 pieces × `-dark`/`-light`) | Every mountain, tree, cloud, bridge, post, arch and frost on the page. `ThemedArt`/`StillArt` swap the `<img src>` on `data-theme` (`src/components/scene/ThemedArt.tsx:59`) | The 23 Cebu files below, plus a five-line change so a slot can name a *different* piece for light. |
| **Vector scenery** (`scene/Moon.tsx`, `faith/Summit.tsx`, `scene/Seam.tsx`, `CrossGlyph.tsx`) | The moon, the Faith hills, the section-edge silhouettes, the cross | Tokens only. The moon becomes the sun by changing three colours. |
| **Canvases** (`hero/Starfield.tsx`, `scene/Snow.tsx`, `hero/PointCloud.tsx`) | The hero dust, the falling snow, the point-cloud model | Tokens only. Each already re-reads its ink when the attribute flips. |
| **The 3D walk** (`origin/CabinScene.tsx`, 7,034 lines, procedural three.js) | The snowfield, the pines, the cabin, the room, the fire, the in-scene snow | The one real build: a beach-house geometry set and a daylight `ROLES.light`. Same camera, same room box, same contract. |

Three things are already exactly what the owner asked for and need no work:

- **`.hero__model` is theme-independent.** A repo-wide grep finds no
  `[data-theme]` rule touching it; its box, position, breakpoints and opacity
  are byte-identical in both themes, and the only thing that differs is the
  caption ink `--obj-label`. The point cloud repaints in the theme's ink on the
  next frame.
- **The 3D scene already cross-fades its palette over the theme wave** rather
  than snapping (`CabinScene.tsx` `THEME_FADE`, honouring `--wave-delay`).
- **Structure never changes with theme.** Every breakpoint, every parallax
  rate, every seam mask and every `useParallax` factor is declared once,
  outside any theme block. The four light-only CSS rules in the hero and the
  four in Origin are *placement corrections* for where the ink sits inside a
  file (`--art-head`, `--tops-head`, `--mist-eye`, `--snow-head`, `--fog-top`),
  and the Cebu files will need the same measurements taken once.

What the captures showed about the light theme **as it stands** (the reason
this is worth doing, in one paragraph): at rest the hero's three ranges are
almost invisible against the pale sky, the lamppost is still *lit* at noon,
the snow falls as dark specks that read as dirt, the window frost is ice, and
the bridge, fence and signpost at the Tools/Building join are ghosts. It is a
faithful silver copy of a night scene, and it looks like one.

---

## 2 · The Cebu picture, beat by beat

The page is one walk: valley → snowfield → cabin door → the room → the west
window → out over the bridge → up the hill to the cross → the arch and the
steps. The Cebu walk keeps every beat and every camera move and changes what
is standing in it. The thread that ties the dark page together is the moon:
it rests on the horizon in the hero and arrives behind the cross in Faith. In
Cebu the thread is **the sun** — up over the Mactan channel in the hero,
setting behind the cross at the end.

**Time of day is a decision, not a mood.** Morning in the hero (a bright sun
low over the sea, sky deep blue at the top and pale at the horizon), full day
through the walk (the turquoise the references are made of), and late
afternoon in Faith, where the disc goes gold and low. That progression is what
lets one `Moon` component be the same object in both places and still read as
a sun at two hours.

| Beat | Dark (as captured) | Cebu |
| --- | --- | --- |
| **Home / Top** | Night valley: moon on the horizon bitten by a faceted ridge, two ridges behind, valley fog, wisps crossing the disc, tall pine right, snowy bough top-left, lamppost left, drifting dust, grain | **The coast at morning.** The sun on the sea horizon, its lower fifth behind the water. Far: a low island in haze (Bohol-shaped). Mid: the sea, turquoise near and deep blue far, wave crests, one *bangka* outrigger. Near: the white sand and the surf line. One cumulus band crossing the sun. A leaning coconut palm at the right edge, a palm frond entering top-left. The heritage lamppost stays, painted white, **unlit**. The dust becomes sun-sparkle. |
| **Origin band** (the hero→Origin seam) | Far treeline, mist, near pine row, snow bank standing up into the hero | Far palm line on a shore in haze, sea haze, a near row of coconut palms with beach scrub, a **sand bank** with a foam line. |
| **Origin → the walk** | Snowfield, pines in ranks, a log cabin at night, windows glowing, smoke, snow falling near and far | **A beach path across sand to a white villa** among palms with the sea behind them: white walls, dark slate hip roof, a deep veranda with square posts and a balustrade, capiz-shell windows, three steps down to the sand. Full day, house *unlit*. Footprints in the sand where the trodden path was; shells and coral stones where the weeds and rocks were. Falling snow becomes drifting **kalachuchi petals**. |
| **Apps** (inside, over the table) | Hearth burning, the room's only light, three sheets of paper on the big table | The same table (rattan-edged pale wood), the same three sheets. The hearth cavity becomes an **arched opening onto a pool terrace**; the pool's light is the room's light source and its **caustic ripple** is the room's one animated thing, exactly where the flames were. |
| **Tools** (the west window) | Frost crystals at the frame's corners, pines and snow outside | A **capiz-shell window** at the corners, sun glare where the frost's sheen was; outside, palms, the pool and the sea. |
| **Tools floor / Building top** | Stone footbridge over water, reeds, boulders, fence, signpost, fog, two stands of pines, dune seam | A **wooden pier on stilts over shallows**, pandan clumps, pale **limestone boulders**, a **bamboo rail**, a weathered **beach signpost** (boards blank), sea mist, two **coconut palm pairs**, the dune seam as *sand*. |
| **Faith** | Three smooth hills, the moon low behind the crest, the cross on it | **The same three hills, the same cross, the sun going down behind it.** The owner asked for this beat kept "very much like it", and it is: only the tokens move — the hills go green-to-dusk, the disc goes gold, the sky band warms. No art file. (Cebu is where the cross first stood in the Philippines, in 1521; the composition does not need to say so.) |
| **The Makers / Outro** | Stone stair, garden arch with ivy, stone lantern, stepping stones | **Coral-stone steps** down to the sand, a **coral-stone gateway arch** with bougainvillea, a **capiz lantern** on a post, flat **stepping stones in sand**. |
| **Cards, nav, cursor, footer, Store, About, account pages** | Tokens | Tokens. No art anywhere else on the site. |

Decisions taken in that table that the owner may overrule (each is one line
to change later, none blocks the art):

1. **Sun, not a daytime moon.** `Moon.tsx`'s header argued for a pale moon in
   light because the light theme was "the same scene by day". Cebu is a
   different scene, so the argument no longer holds.
2. **Petals, not rain and not invisible white snow.** The near flake layer is
   one colour token; soft pink-white dots read as kalachuchi at that size.
3. **The lamppost stays and goes out.** Cebu's Spanish-era iron lampposts are
   real, the slot is pole-shaped and left-edge, and a lamp lit at noon was the
   single wrongest thing in the current light hero.
4. **Pool light replaces fire.** The room's contract is "one light source,
   animated". Caustics are cheaper than flames and are the most Cebu thing a
   room can look out on.
5. **Faith gets no new art.** Its terrain is authored SVG on purpose
   (`Summit.tsx` header) and the kit's own README forbids a raster cross there.

---

## 3 · The inventory: every visual slot, what it is, where it paints, and what it becomes

Sizes are the **source PNG canvas** each slot was measured for. Draw the Cebu
piece on the same canvas so the placement variables stay near their current
values; where the ink's head or foot lands differently, one measurement per
file fixes it (that is what the eight light-only CSS rules already are).
"Paints at" is at 1600×900 from the live CSS. Opacity tokens are the kit's
`--art-far / --art-mid / --art-near` (light today 0.36 / 0.44 / 0.52 — the
Cebu block raises them, see §5). Every piece is a transparent cut-out,
decorative (`alt=""`, `aria-hidden`, `pointer-events: none`), and is loaded
as `.webp` only.

### Hero (`src/components/Hero.tsx`, `Hero.css`) — pinned stage, back to front

| # | Slot (class) | Dark piece | Canvas | Paints at (1600×900) | Motion | Cebu piece → new file | Tier |
| --- | --- | --- | --- | --- | --- | --- | --- |
| H1 | `.hero__sky` | `--hero-sky` gradient + light-only `--hero-dusk` | — | full stage | none | **Token.** Deep blue at top-right → pale at the horizon | A |
| H2 | `.hero__shaft`, `.hero__shaft-core`, `.hero__bloom` | radial ellipses in `--hero-bloom`; gains `--hero-air-gain` `.62/.09`, `--hero-air-core-gain` `.9/.12`, `--hero-bloom-gain` `1/.3` | — | centred on the disc, 760–2400px wide | breathe 11s/17s/12s | **Token.** Warm sun glow, gains back up | A |
| H3 | `.hero__moon` (`Moon.tsx`) | disc `--moon-disc`, halo `--moon-halo`, maria `--moon-mare` | SVG | `clamp(230px,30vw,470px)` wide at 51% x, lower 18% bitten by the ridge | lifts 0.90vh & drifts 0.44vw on scroll, ±13/6px pointer | **The sun. Token:** disc `#fff8e1`, halo golden, maria transparent | A |
| H4 | `.hero__cloud`, `.hero__cloud--far` | `props/moon-cloud` ×2 (near 2.6× disc, far 3.4× mirrored) | 2172×724 | across the disc; opacity `--hero-cloud-veil` `.36/.46` | lift 0.66vh / 0.42vh | **Cumulus wisp** → `props/cumulus-wisp` — one flat-bottomed tropical cumulus band, alpha-feathered on all sides, shaped to cross a disc | A |
| H5 | `.hero__rear` (+ `.hero__rear-haze`) | `landscapes/mountain-ridge-rear` | 2172×724 | `max(124vw,138vh)` wide, sits on the horizon, `--art-far` | lift 0.045vh | **Far island** → `landscapes/far-island` — a long low island with a soft hill and a few palm dots, in aerial haze; its foot is where the sea meets it | A |
| H6 | `.hero__mid` | `landscapes/mountain-ridge-mid` | 2172×724 | `max(134vw,148vh)` wide, `--art-far` | lift 0.095vh | **The sea** → `landscapes/sea-band` — its top edge IS the horizon line (this is the layer that bites the sun), turquoise near / deep blue far, a few wave crests, one bangka silhouette | A |
| H7 | `.hero__valley` | gradient in `--terrain-haze` | — | basin between the ranges | lift 0.125vh | **Token.** Sea haze, pale aqua | A |
| H8 | `.hero__weather-art` | `landscapes/valley-fog` | 2172×724 | `max(124vw, art-rise×6.9)`, `--hero-weather-veil` `.34/.2` | 74s sideways drift + lift 0.155vh | **Surf line** → `landscapes/shore-foam` — a soft band of breaking foam, fades out on all four edges (no mask exists for it) | A |
| H9 | `.hero__ridge` (+ `.hero__ridge-haze`) | `landscapes/mountain-ridge` | 2172×724 | `max(146vw,160vh)` wide, `--art-far`, the nearest range | lift 0.22vh | **Near shore** → `landscapes/shore-near` — white sand foreground with the wet line and a strip of clear shallows at its top edge; runs off both sides | A |
| H10 | `.hero__stars` (`Starfield.tsx`) | dust in `--hero-dust` (light = ink) | canvas | full stage, lit within 5.6 disc radii of the disc | 24 Hz drift | **Token.** Sun-sparkle: warm white, gain 1 | A |
| H11 | `.hero__pine` | `props/tall-pine` | 1024×1536 | `min(40vw,580px)` wide, right edge, cropped right & bottom, `--art-near`; hidden < 1100px | ±48/21px pointer, lift 0.88vh | **Coconut palm** → `props/coconut-palm-tall` — one tall palm leaning in from bottom-right, crown at the top of the canvas | A |
| H12 | `.hero__branch` | `props/near-branch` | 1536×1024 | `min(52vw,60vh,700px)`, top-left, cropped top & left, `--art-near`; hidden < 1100px | moves DOWN 0.12vh | **Palm frond** → `props/palm-frond` — a single coconut frond entering from the top-left corner | A |
| H13 | `.hero__grain`, `.hero__vignette` | noise film, corner gradient | — | full stage | — | **Token.** Keep, vignette warm-tinted | A |
| H14 | `.origin__lamp` (+ `-pool/-halo/-glow/-core`) | `hero/lamppost-left` + 4 CSS glows in `--lamp-*` | 1024×1536 | far-left, ≥ 1366px only, foot 30px inside Origin's ground | ±10px pointer, rises 48px | **Heritage lamppost, unlit** → `hero/lamppost-cebu` — white/cream painted iron, day; `--lamp-*` → transparent in light | A |

### Origin band (`src/components/Origin.tsx`, `Origin.css`) — the hero→Origin seam

| # | Slot | Dark piece | Canvas | Paints at | Motion | Cebu piece → new file | Tier |
| --- | --- | --- | --- | --- | --- | --- | --- |
| O1 | `.origin__tops-art` | `landscapes/far-treeline` | 2172×724 | `max(118vw,112svh)` wide, crossing the seam, `--art-far`; hidden ≤ 700px | parallax +0.06 | **Far palm shore** → `landscapes/far-palms` — a distant shoreline with a line of palms and a hut or two, pale aerial haze | A |
| O2 | `.origin__mist-art` | `atmosphere/mist-bank` | 2172×724 | `min(max(112vw,128svh),202svh)`, `--art-far` | +0.02 | **Sea haze** → `atmosphere/sea-haze` — an edge-free band of bright warm haze (also serves B2) | A |
| O3 | `.origin__pines` | `props/pine-row` | 2172×724 | `max(128vw,118svh)`, `--art-near`, masked at its top | −0.13 (nearest) | **Palm row** → `props/palm-row` — a wide row of coconut palms of varied height and lean with low beach scrub, cropped at the bottom | A |
| O4 | `.origin__snow` | `landscapes/snow-bank` | 2172×724 | `max(126vw,132vh)`, `--art-mid`, masked from `--snow-solid` down | rises with the lamp | **Sand bank** → `landscapes/sand-bank` — a low white-sand berm with a foam line along its top, runs off both sides | A |
| O5 | `.origin__grid`, `.origin__blob`, `--origin-glow-warm` | CSS | — | — | — | **Token.** | A |

### The walk (`src/components/Walk.tsx`, `origin/CabinScene.tsx`)

| # | Slot | Dark | Cebu | Tier |
| --- | --- | --- | --- | --- |
| W1 | `CabinScene` — the whole 3D shot behind Origin, Apps and Tools | Snowfield, ranks of pines, log cabin, hearth, in-scene snow, chimney smoke. Palette from seven tokens via `ROLES` | **The beach villa scene** — §4. Same `WalkProgress`, same camera stations, same room box (the paper behind the cards and the west window are measured against the live DOM and must not move). New geometry set, `ROLES.light` re-pointed at Cebu tokens, pool caustics for fire, petals for snow, no smoke | B |
| W2 | `.walk__flakes-canvas` (`Snow.tsx`, density 0.3) | ink `--glow`, opacity `--art-near` | **Petals.** One new token `--flake-ink` (white in dark, `#ffd9d3` in light) read instead of `--glow`; same component | A |
| W3 | `.walk__frost-art` | `props/window-frost` | 1536×1024, full-frame cover, middle 60% clear, opacity .92 × JS ramp | **Capiz window** → `props/capiz-window` — the corners of a capiz-shell window grid (mother-of-pearl squares in a dark wood lattice) with a soft sun glare, the middle 60% empty | B |

### Tools floor (`src/components/Tools.tsx`, `Tools.css`)

| # | Slot | Dark piece | Canvas | Paints at | Motion | Cebu piece → new file | Tier |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | `.tools__bridge` | `landscapes/stone-footbridge` | 1672×941 | `clamp(360px,78vw,1240px)` wide, left, `--art-mid` | −0.05 | **Beach pier** → `landscapes/beach-pier` — a low plank pier on wooden stilts over shallows, water ripples at its feet | B |
| T2 | `.tools__reeds` | `props/bushes-reeds` | 1672×941 | `clamp(180px,22vw,380px)`, `--art-mid`; hidden ≤ 640px | still | **Pandan clump** → `props/pandan-clump` | B |
| T3 | `.tools__fence` | `props/fence-rail` | 1891×831 | `clamp(300px,46vw,740px)`, right, `--art-near`; hidden ≤ 640px | still | **Bamboo rail** → `props/bamboo-rail` — lashed bamboo, running lower-left to upper-right and out of frame | B |
| T4 | `.tools__rocks` | `props/boulder-cluster` | 1448×1086 | `clamp(200px,27vw,480px)`, right, `--art-near`; hidden ≤ 640px | −0.15 + pointer sway 12/7px | **Coral rocks** → `props/coral-rocks` — chunky pale limestone karst boulders, a little green in the cracks | B |
| T5 | road grid, horizon line, spray, shore | CSS in `--border`, `--warm`, `--glow`, bands | — | — | 7s grid run | **Token.** Keep the grid; horizon line in sun gold | B |

### Building (`src/components/Building.tsx`, `Building.css`)

| # | Slot | Dark piece | Canvas | Paints at | Motion | Cebu piece → new file | Tier |
| --- | --- | --- | --- | --- | --- | --- | --- |
| B1 | `.building__post` | `props/wayfinding-post` | 1024×1536 | `clamp(150px,15vw,270px)`, left, crossing up into Tools, `--art-mid`; hidden ≤ 640px | −0.05 | **Beach signpost** → `props/beach-signpost` — weathered driftwood post with two or three **blank** boards | B |
| B2 | `.building__fog`, `.building__mist` | `atmosphere/fog-veil` (drawn twice) | 2172×724 | full width, `--art-far` | +0.015 / −0.12 | **Sea mist** → reuse `atmosphere/sea-haze` (O2) unless it measures wrong under Building's masks; then `atmosphere/sea-mist` | B |
| B3 | `.building__pines`, `.building__pines-far` | `props/pine-faceted-pair` (drawn twice) | 1024×1536 | right `clamp(220px,27vw,480px)` `--art-mid`; left far `clamp(120px,14vw,250px)` `--art-far`; hidden ≤ 640px | −0.1 / +0.03 | **Coconut pair** → `props/coconut-pair` — two palms, one taller, faceted fronds | B |
| B4 | dune `Seam`, `.building__scan`, `.building__bank`, `.building__haze`, `.building__dusk` | SVG + CSS | — | — | seam +0.022 | **Token.** The dune reads as sand once `--seam-fill` is sand; keep the scan texture | B |

### Faith (`src/components/Faith.tsx`, `faith/Summit.tsx`)

| # | Slot | Dark | Cebu | Tier |
| --- | --- | --- | --- | --- |
| F1 | `.faith__ridge--far/--crest/--near` | authored SVG in `--summit-stop-*`, `--seam-fill` | **Token.** Green hills going dusk-blue with distance | C |
| F2 | `.faith__moon-disc` + `.faith__moon-sky` | `Moon.tsx` + light-only sky pool | **Token, section-scoped.** The disc gold, the halo amber, the sky band warm; redeclare the moon tokens on `.faith__moon` the way `Summit.css` already redeclares `--summit-stop-*` | C |
| F3 | `.faith__dusk`, `.faith__field`, `.faith__rays`, `.faith__blob`, the two seams | CSS + SVG | **Token.** | C |
| F4 | the cross (`CrossGlyph` summit variant) | `--summit-stop-*` | **Token.** Stays a dark silhouette against the disc | C |

### Outro (`src/components/Outro.tsx`, `Outro.css`)

| # | Slot | Dark piece | Canvas | Paints at | Motion | Cebu piece → new file | Tier |
| --- | --- | --- | --- | --- | --- | --- | --- |
| X1 | `.outro__stair` | `transitions/stone-stair` (dark 2172×724, light 2060×763 — the kit's one mismatched pair) | 2172×724 | `clamp(150px,17vw,260px)` tall, left, crossing up into Faith, `--art-far` | +0.03 | **Coral-stone steps** → `transitions/beach-steps` — drawn at **2172×724** so the light-only aspect override can go | C |
| X2 | `.outro__lantern` | `props/lantern-post` | 1024×1536 | 0.3× the arch's width, `--art-mid`; hidden ≤ 839px | still | **Capiz lantern** → `props/capiz-lantern` — a short post with a capiz-shell lantern, softly lit or unlit | C |
| X3 | `.outro__arch` | `props/garden-arch` | 1024×1536 | `min(clamp(230px,29vw,420px), cap)`, right gutter, `--art-near`; hidden ≤ 839px | −0.09 | **Coral-stone arch** → `props/coral-arch` — a Spanish-colonial coral-stone gateway (Fort San Pedro's language) with bougainvillea climbing one pier, open in the middle | C |
| X4 | `.outro__stones` | `transitions/stepping-stones` | 1672×941 | `min(clamp(220px,34vw,580px), cap)`, mirrored, `--art-near`; hidden ≤ 839px | −0.13 | **Sand stones** → `transitions/sand-stones` — flat pale stones set in sand, receding | C |
| X5 | `.outro__air`, `.outro__afterglow`, `.outro__ground` | CSS | — | — | +0.015 | **Token.** | C |

### Not in scope, on purpose

- **`KeyArt.tsx`'s five drawn app covers** always draw the `-dark` file over a
  fixed palette (`KeyArt.css:34-83`); AGENTS.md §4 lists that as not up for
  redesign. They stay.
- **The 18 unplaced spares in the kit** (`far-range-soft`, `pine-grove`,
  `park-bench`, `gate-post-pair`, `hillside-cross`, …) get no Cebu twin. A
  piece nothing draws needs no second file.
- **The auth modal** is always dark by design.
- **Store, About, Account, People, Developer** carry no art; they are tokens.

**Count: 23 files.** Tier A (hero + Origin band, 12 pieces) is the whole
first impression and should be made first; B (walk window, Tools, Building,
7 pieces) next; C (Outro, 4 pieces) last. Faith needs none.

---

## 4 · The 3D scene: what it is, and why there is no model to hand over

**The cabin is not a model file.** There is no `.glb`, no loader, and no
generated mesh; `CabinScene.tsx` builds every wall, log, flame and tree out of
triangles in code, colours them per vertex from the page's own tokens, and
cross-fades that palette on the theme wave. Its header says why, and every
reason still holds for a beach house: it has to sit beside a flat low-poly art
kit and look drawn by the same hand; an imported mesh would read as a
different site; the room's box is measured against the live card grid so the
paper sits behind the cards at every width; and vertex colours from tokens
are what make a theme change a cross-fade rather than a texture swap.

So the input this needs is the same input the cabin had: **reference
paintings**, from which the implementing session builds the geometry. The
owner supplied two for the cabin ("a log cabin in a snowy wood at night").
Cebu wants three, because the walk goes indoors and the room changes more.

What must stay identical, because the page around it depends on it:

- the camera path and every station (`LEGS`, `B_ORBIT` … the shot is solved
  from a speed curve and the owner's floor plan);
- the room's box — the south wall with the door, the big table in the
  south-west with three sheets on it at `T_PAPER`, the west window the shot
  ends on, the east window, the desk, the chair;
- the fact that the room has one light source, that it is animated, and that
  it BAKES light onto the walls, table and floor.

What changes:

| Cabin | Beach villa |
| --- | --- |
| Snowfield with drifts, a trodden path, weeds, small stones | Sand with gentle ridges, a line of **footprints** where the path was, shells and coral pebbles, a wet tide line far back |
| Ranks of pines going paler and bluer with distance, a treeline on the horizon | Coconut palms in ranks, then the **sea** as the horizon band (a flat turquoise plane going deep blue, one bangka far out), sky above |
| Log walls, stone chimney, smoke, porch, warm windows at night | **White plaster / coral-stone walls, dark slate hip roof, a deep veranda with square white posts and a balustrade, capiz-shell windows with wooden shutters, three steps to the sand.** Day. House unlit (`halo 0`, `core` a faint interior tint — the same two numbers the light rig already uses) |
| Fireplace in the north wall, logs, flames, embers, sparks | An **arched opening in the north wall onto a pool terrace**: turquoise pool, white deck, one palm; the pool's light is the room's light and its **caustic ripple** is the animated thing (`FIRE_HZ` becomes the ripple rate; the ember fan and sparks go) |
| Woodpile, kettle, blanket, dresser, shelf | Rattan chair, a woven mat, a shelf with two shells, a slowly turning **ceiling fan** under the ceiling slab (optional; a second animated thing is allowed if it is quiet) |
| Frost crystals at the glass | The capiz window overlay (W3), a DOM layer, not the scene |
| Snow points near and far, tone `flake` | **Petals**, fewer, larger, slower, tone from `--flake-ink` |
| `ROLES.light`: `pale --surface`, `deep --accent-2`, `warm --warm` | A Cebu rig: `pale` the sand-white, `deep` the sea ink, `sky` the Origin band, `skyOut` the Tools band, and the light-source pigment read from a new `--pool-light` token rather than `--warm`, because the room is lit by water, not fire |

### The three reference paintings to make

Ask for all three in **one consistent style**: flat low-poly, chunky faceted
planes, no outlines, soft vertex shading with one sun from the upper left,
clean colour blocks, no texture, no people. That is the cabin's language and
it is what will be built. Each is a 16:9 frame.

**R1 · The approach.** *"Flat low-poly illustration, 16:9. A path of
footprints crosses pale white sand toward a small white beach villa in the
middle distance: white plaster walls, a dark slate-blue hip roof, a deep front
veranda with four square white posts and a low balustrade, three wide steps
down to the sand, two capiz-shell windows with open wooden shutters either
side of a plain wooden front door. Coconut palms stand around and behind it in
ranks that go paler and bluer with distance; behind the palms a flat
turquoise sea runs to a deep blue horizon with one small white outrigger boat
far out; the sky above is bright morning blue with two flat-bottomed cumulus
clouds. Bright day, sun upper left, short shadows. A few white shells and pale
coral pebbles in the sand. Faceted geometry, no outlines, no texture, no
people, restrained palette: sand white, turquoise, deep sea blue, palm green,
slate blue, plaster white."*

**R2 · The threshold.** *"Same style and same house. The camera is at the top
of the veranda steps looking straight at the open front door: dark hardwood
door frame, the door standing open inward; through it the room is visible —
pale white walls, a dark narra-wood floor, a big pale wooden table with a
rattan edge in the left corner carrying three sheets of paper, and at the far
wall an arched opening through which a turquoise pool and a white terrace are
lit by full sun. The veranda's posts frame the left and right edges. Faceted,
no outlines, no people."*

**R3 · The room.** *"Same style and same house, interior. Eye height, standing
by the big table. Left: the table's top with three sheets of paper, a rattan
chair pulled out. Ahead: the north wall, white plaster, with a wide arched
opening in it showing the pool — turquoise water with a soft ripple pattern of
light, a white deck, one palm — and the pool's light spilling onto the floor
and the near wall. Right: the west wall with a capiz-shell window (a grid of
small mother-of-pearl squares in a dark wood lattice) through which coconut
palms and the sea are visible. Dark narra floor, a woven mat, a shelf with
two shells, a ceiling fan under a pale ceiling. No fireplace anywhere.
Faceted, no outlines, no people."*

---

## 5 · The Cebu palette (a starting block for `[data-theme='light']`)

Starting values, chosen against the eight references and the contrast the
page already needs (text over `--bg` at 11:1 or better). Implementation tunes
them; what is fixed is the *roles*: a sand-white page, sea-ink text, deep-teal
accent, sun-gold warm, and bands that go sky → sea → sand → dusk down the page.

| Token | Today (light) | Cebu | Role |
| --- | --- | --- | --- |
| `--bg` / `--bg2` | `#f6f6f8` / `#ececed` | `#f7f4ec` / `#efe9dc` | sand-white page, dry-sand footer |
| `--surface` | `#ffffff` | `#ffffff` | cards |
| `--text` | `#141419` | `#0f2a3a` | sea ink |
| `--accent` / `--accent-2` | `#1b1b22` / `#4a4a55` | `#0f5f6b` / `#2a7d8a` | deep teal, the one accent |
| `--accent-soft` | ink 5.5% | `rgba(20,120,130,.08)` | |
| `--glow` | ink 16% | `rgba(38,178,190,.18)` | blobs, dot shadows |
| `--warm` | `#b8763a` | `#e8a33b` | sun gold: the Tools horizon line, chips |
| `--pool-light` *(new)* | — | `#7fe3e8` | the beach-house room's light |
| `--flake-ink` *(new)* | — (dark: `#ffffff`) | `#ffd9d3` | petals |
| `--hero-bg` | `#fbfbfc` | `#eaf6f8` | |
| `--hero-sky` | grey radial | `radial-gradient(118% 96% at 74% 6%, #3f9be0 0%, #86c6ee 30%, #c6e6f4 62%, #eaf6f8 100%)` | deep at the top-right, pale at the horizon |
| `--moon-disc` / `--moon-halo` / `--moon-mare` | white / white 86% / grey 22% | `#fff8e1` / `rgba(255,214,120,.9)` / `transparent` | the sun |
| `--hero-dust` / `--hero-dust-gain` | ink / .85 | `rgb(255,250,235)` / 1 | sun-sparkle |
| `--terrain-haze` / `--terrain-haze-rear` | `#3c485a` / `#98aec0` | `#5fbdd2` / `#b9e3ec` | sea haze near / far |
| `--art-far` / `--art-mid` / `--art-near` | .36 / .44 / .52 | **.62 / .74 / .86** | the winter art was pale on pale; the Cebu art is colour on sky and can carry it |
| `--band-origin` / `-apps` / `-tools` / `-building` / `-faith` | pale greys | `#cfeaf3` / `#f8f6f0` / `#dcefef` / `#f3ead9` / `#f6e7d3` | sky → paper → sea → sand → dusk |
| `--summit-stop-0/1/2` | slate greys | `#2f5a3a` / `#3f7449` / `#5d8f5f` | Faith's hills |
| `--lamp-core/glow/spill/pool` | warm 95/36/13/20% | all `transparent` | the lamp is off by day |
| `--seam-fade` | .4 | .5 | |
| `--nav-veil-*` | `245,243,251` | `247,244,236` at the same three alphas | |
| `--card-bg` | white 88% | white 90% | |

Section-scoped, not global: on `.faith__moon` redeclare `--moon-disc:
#ffd36b` and `--moon-halo: rgba(255,170,80,.85)` so the Faith disc is the
low sun; on `.origin__lamp-*` nothing — the four `--lamp-*` above already
turn it off.

### The art kit's own palette (for the 23 files)

Eight to ten named colours across the whole set, so every piece agrees with
every other and with the tokens above:

`sea-deep #0d6f8a · sea #1fb6c9 · shallows #7fe0e6 · foam #ffffff · sand
#f6efe0 · sand-shade #e9dcc3 · palm #2f8f5b · palm-deep #1f6b45 · palm-light
#5cb07a · trunk #8a6a4a · slate #3a4c5e · plaster #ffffff · bougainvillea
#f28b9b · sun #ffd36b`

Shade every facet from these; do not invent a twelfth colour for one piece.

---

## 6 · How the toggle stays smooth, and what it costs

What the theme wave can and cannot animate today, from `tokens.css:864` and
`base.css`: **it cross-fades** `background-color`, `color`, `border-color`,
`box-shadow`, `fill` and SVG `stop-color`, plus the three registered
`--tint-*` band colours. **It snaps** `background-image` (the hero sky, the
haze gradients, the bloom), `opacity` (every `--art-*`), `filter` (the three
air gains), every `<canvas>`, and — the one that matters most for Cebu —
**every `<img src>` swap**. A resource swap has no interpolable value; the
winter art already hard-cuts to silver at the flip, and nothing preloads the
other theme's files, so **the first toggle shows empty slots until 23 files
arrive**. With Cebu that would be night mountains cutting to nothing cutting
to a beach. Three small pieces of plumbing fix all of it, and none of them
adds steady-state cost.

> **Built and landed on 2026-09-02, ahead of the artwork, in v2.43.0.** The
> three items below are how the site behaves now; the paragraph above describes
> what it did before. Doing it first was deliberate — the toggle had to stop
> cutting before there was a second picture worth cutting between, and fixing
> it against the winter art means the Cebu work inherits a wave that already
> crosses. Each item carries the correction the build made to it.

1. **Prefetch the inactive theme's art at idle** — `src/theme/artPrefetch.ts`.
   After `load`, on `requestIdleCallback`, at `fetchPriority: 'low'`, and not
   at all on `saveData` or a 2G `effectiveType`. **Two corrections.** The file
   list is read off the DOM (`img.scene__art`, theme suffix swapped) rather
   than written down, because counts in this repo have gone stale twice
   already. And it goes in **batches of four**: one file per idle slot measured
   too slow — a cold load, four seconds of idle, and a toggle still sent nine
   requests. It runs again after each toggle, held past the wave, because the
   first pass can only warm twins of slots whose own file has loaded, and
   everything below the fold is `loading="lazy"`.
2. **Cross-fade the art on the wave** — `crossArt` in `ThemeProvider.tsx`, and
   **not in `ThemedArt` as proposed here.** Doing it in React means re-keying
   each `<img>`, and `useParallax` captures its element in an effect keyed on
   `factor` alone: replace the node under it and the hook writes `translate` to
   something no longer in the document, killing that slot's drift for the rest
   of the session. So the wave *clones* each on-screen element, freezes the
   clone's position and its computed `opacity`, and cross-fades the pair with
   `filter: opacity()` over `--t-art`. A filter and not `opacity`, because the
   caller's own class already owns that property. At rest: one image per slot,
   no filter, no clone.
3. **Register the hero sky's stops as `@property <color>`** the way
   `--tint-top/mid/bot` already are — done, plus the two stop positions as
   `<percentage>` (the themes place them differently) and the daylight haze as
   one further registered colour, which also removes the `--hero-dusk`
   `none`-to-gradient snap this section had not counted. **`opacity` was NOT
   added to `.scene__art`'s wave, and should not be:** `--hero-sink` is written
   to the hero every frame and multiplies the same property, so a 0.6 s
   transition on it would make the terrain's scroll fade lag. The cross-fade
   covers what that was for — the incoming element takes the new `--art-*`
   while it is still at filter-opacity 0, and the frozen ghost keeps the old.

**What it measures now.** Headless Chrome on the built site with Pages' cache
headers, at 1440x900 and 375x812, from both themes, at the top of the page and
parked on the bridge and at the cross. The before column is the same harness on
the same page one commit earlier.

| | Before | After |
| --- | --- | --- |
| Worst single composited frame, mean abs dRGB over the viewport | 149 of 255 | 19–39 |
| Frames the change is spread across | 1–3 | 40–64 |
| Time from 10% to 90% of the change | 0–24 ms | 500–800 ms |
| Scenery bytes fetched during a toggle | 13 files | 0 |
| Overshoot past the settled value, which is what a blank slot looks like | large | under 0.6% |

Everything else already does the right thing: the 3D scene lerps its palette
over `THEME_FADE`; the dust, the snow and the point cloud repaint on the
attribute change; the moon, the cross and the Faith hills ride the wave
through `<stop>`s.

**Budget.** Same number of layers in every section, same canvas sizes, the
same WebP encode (`≤1000px` props, `≤1600px` landscapes and atmosphere,
`q 84`, `libwebp`), so scroll cost is what it is today, and the measurement
that proves it is the one the repo already uses: main-thread ms per second
parked mid-page (the reference figure is 0.1 ms/s), long tasks during a
toggle, and the network panel during the first toggle after load.

---

## 7 · What to make, and how to prompt for it

### The master prompt for the 23 cut-outs

Every piece in the kit is: **flat 2D low-poly illustration, chunky faceted
planes, clean cut-out silhouette on a fully transparent background, no
outline strokes, no texture, no drop shadow, no ground plane beyond the
object, one light from the upper left, no text, no people, no animals.**
That is what the winter set is (look at `props/tall-pine-dark.png` and
`landscapes/stone-footbridge-dark.png` before generating anything) and the
Cebu set has to be drawn by the same hand.

Use this as the fixed head of every generation, then append the piece line:

> *Flat 2D low-poly vector-style illustration, chunky faceted planes with
> soft flat shading, clean crisp edges, no outline strokes, no texture, no
> noise, no drop shadow, single light source from the upper left, isolated
> subject on a fully transparent background (PNG with alpha), nothing else in
> frame, no text, no people, no animals, no watermark. Palette limited to:
> sea-deep #0d6f8a, sea #1fb6c9, shallows #7fe0e6, foam #ffffff, sand
> #f6efe0, sand-shade #e9dcc3, palm #2f8f5b, palm-deep #1f6b45, palm-light
> #5cb07a, trunk #8a6a4a, slate #3a4c5e, plaster #ffffff, bougainvillea
> #f28b9b, sun #ffd36b. Canvas exactly W×H. SUBJECT:*

If the tool cannot output alpha, generate on **pure white** (never a
gradient) and cut the background out afterwards; the winter kit's soft alpha
edges are the thing that makes a cut-out sit on a sky, so keep the edge
feathering at 1–2 px and never JPEG a source. Deliver `.png` at the canvas
size; the `.webp` the site loads is generated from it with the exact ffmpeg
line in `public/assets/parallax/README.md`.

### The 23 piece lines

Landscapes and atmosphere, **2172×724** (3:1), ink low in the frame, running
off both sides so the piece never ends mid-air:

1. `landscapes/far-island` — *a long low island seen across water at the
   horizon: a soft rounded hill, a few tiny palm silhouettes on its ridge,
   pale and desaturated as if seen through miles of humid air; its bottom
   edge is a straight waterline; occupies the lower 40% of the canvas.*
2. `landscapes/sea-band` — *the open sea from a beach: a straight horizon
   line across the canvas at 45% height, deep blue at the horizon grading to
   bright turquoise at the bottom edge, three or four low faceted wave crests
   with white foam tips, one small white outrigger boat (bangka) far out at
   the right third; bottom edge feathers to transparent.*
3. `landscapes/shore-near` — *the foreground shore: white sand from the
   bottom edge up to a gently curving wet line, a strip of clear turquoise
   shallows with a foam edge along its top at about 30% height, above that
   transparent; a few pale shells; runs off both sides.*
4. `landscapes/shore-foam` — *a soft horizontal band of breaking surf foam,
   white with the faintest turquoise, torn and feathered on all four edges so
   it fades to nothing everywhere; centred, filling the middle 50% of the
   height.*
5. `landscapes/far-palms` — *a distant shoreline seen across water: a low
   line of coconut palms and two nipa huts along a thin sand strip, everything
   pale and hazy, in the lower third; flat waterline at the bottom.*
6. `landscapes/sand-bank` — *a low drift of white sand rising from the bottom
   edge to a soft irregular crest at about 45% height, a thin foam line lying
   along the crest, faceted like dunes, running off both sides.*
7. `atmosphere/sea-haze` — *an edge-free band of bright warm haze, white into
   the palest turquoise, feathering to transparent on all four sides, like
   heat shimmer over water; no shape, no edges.*
8. `props/cumulus-wisp` — *one flat-bottomed tropical cumulus cloud band,
   white with a slate-blue underside, faceted, long and low, feathered edges,
   shaped so a circle behind it would show above and below; centred.*
9. `props/palm-row` — *a wide row of coconut palms of varied heights and
   leans, trunks meeting low beach scrub and pandan at the bottom edge which
   crops them; crowns in the upper half; faceted fronds, no two trees the same.*

Vertical props, **1024×1536** (2:3):

10. `props/coconut-palm-tall` — *one tall coconut palm leaning to the left,
    trunk entering from the bottom-right corner and curving up, crown of
    faceted fronds filling the top third, two coconut clusters; the right edge
    of the canvas crops part of the crown.*
11. `hero/lamppost-cebu` — *a Spanish-era heritage street lamppost: fluted
    cast-iron column painted cream-white, a hexagonal glass lantern with a
    small finial, a stepped octagonal base; DAYLIGHT, the lantern unlit and
    its glass pale; centred, filling the height.*
12. `props/coconut-pair` — *two coconut palms side by side, one taller and
    straight, one shorter leaning away, faceted fronds, trunks meeting at the
    bottom edge.*
13. `props/beach-signpost` — *a weathered driftwood signpost with three blank
    arrow boards pointing different ways, grey-brown wood, a small pile of sand
    and one shell at its foot; the boards carry NO text.*
14. `props/capiz-lantern` — *a short stone post carrying a square capiz-shell
    lantern (translucent mother-of-pearl panes in a dark wood lattice), a small
    pitched cap; faintly lit from within with warm white.*
15. `props/coral-arch` — *a Spanish-colonial coral-stone gateway arch, pale
    weathered coral limestone blocks, a semicircular arch on two square piers,
    the opening empty, bougainvillea with pink blooms climbing the left pier.*

Wide props, **1672×941** (16:9):

16. `landscapes/beach-pier` — *a low wooden plank pier on timber stilts,
    seen from the side and slightly above, running from the left edge into the
    middle distance, over clear turquoise shallows drawn as flat faceted ripples
    around its posts.*
17. `props/pandan-clump` — *a clump of beach pandan and coarse beach grass,
    faceted blade leaves, green with pale tips, cropped through its bottom
    edge.*
18. `props/beach-stones` → `transitions/sand-stones` — *five flat pale stones
    set in white sand, receding from lower-left to upper-right and getting
    smaller, each with a thin sand shadow; sand drawn only as a soft patch
    under each stone.*

Others at their slot's canvas:

19. `props/bamboo-rail` — **1891×831** — *a lashed bamboo fence rail: two
    horizontal bamboo poles on three bamboo posts, running from lower-left to
    upper-right and out of frame at the right, golden-tan bamboo with dark
    joints and jute lashings.*
20. `props/coral-rocks` — **1448×1086** — *a cluster of three chunky pale
    limestone karst boulders, sharp faceted faces, cream and grey, a little
    green moss in two cracks, sitting on a hint of sand at the bottom edge.*
21. `props/palm-frond` — **1536×1024** — *a single coconut frond entering
    from the top-left corner and reaching toward the centre, faceted leaflets,
    cropped by the top and left edges; nothing else.*
22. `props/capiz-window` — **1536×1024** — *the four corners of a capiz-shell
    window seen from inside: a dark wood lattice holding small translucent
    mother-of-pearl squares, with a soft white sun glare across the upper-left
    corner; the middle 60% of the canvas completely empty and transparent.*
23. `transitions/beach-steps` — **2172×724** — *four wide shallow steps of
    pale coral stone descending from the upper-left toward the lower-right,
    edges chipped, sand collecting on the treads, fading out at the right.*

### Naming

The theme suffix stays the suffix (`-light.png` / `-light.webp`), because
`ThemedArt` builds the path from it. What changes is that a slot may name a
*different piece* for light: `<StillArt art="props/tall-pine"
light="props/coconut-palm-tall" />`. That keeps every winter call site valid,
gives every Cebu file an honest name, and the kit README gains a "Cebu set"
column. A palm saved as `pine-row-light.webp` would be a lie the next reader
has to discover.

---

## 8 · What the owner provides, in order

1. **The concept calls in §2** — say which of the five decisions to change,
   if any. Nothing below waits on this except the sun.
2. **Tier A art first (12 files)** — the hero and the Origin band are the
   whole first impression and can ship on their own with the token block.
3. **Tier B (7) and Tier C (4).**
4. **The three reference paintings (§4)** — these gate the 3D build, which is
   the longest single piece of work.
5. Optionally, **one or two more Cebu photos of a white beach villa with a
   veranda** (the references have hotels and huts, not a small house), so the
   villa's proportions come from a real one.

Deliver as PNG at the stated canvases into a folder anywhere; the
implementing session moves them in and generates the WebPs.

---

## 9 · The brief for the session that builds it

Paste this into a fresh Claude session in this repository once the Tier A
files and the three references exist. It is written for a strong model: it
says what is wanted and how to tell, and leaves the how to whoever opens the
files.

---

Make the light theme of this site Cebu. The design brief is
`docs/cebu-light-theme.md` — read it first; it carries the inventory of every
art slot, the mapping from each winter piece to its Cebu piece, the token
palette to start from, and the toggle plumbing. The Cebu PNGs are in
`<folder>`; the three reference paintings for the beach house are in
`<folder>`.

**What I want.** Toggle to light anywhere on the home page and it is a bright
Cebu morning: the sun on the sea in the hero, a white beach villa among palms
in the walk, the pool lighting the room where the fire was, palms and a pier
at the Tools floor, the sun going down behind the same cross in Faith. Toggle
back and it is the winter night it is now, untouched. Nothing but colour and
artwork changes: the layout, the copy, the point-cloud model, the camera walk,
every breakpoint and every interaction are the same in both themes. And the
toggle itself is smooth — the page crosses from night to day the way it
crosses now, with no slot going blank, no art popping in late, and nothing
jumping.

**Context.** The winter light theme is the same scene in silver; the captures
that show it, and every measurement, are in the brief. The 3D scene is built
in code, not loaded, and its header explains why that stays true; the beach
house is built the same way, from the references, keeping the camera path and
the room box the cards and the west window are measured against. The kit's
`-light` files are being replaced by different pieces with different names,
and the brief says how a slot names its light piece. Today nothing preloads
the inactive theme's art, so the first toggle shows empty slots while files
arrive; the brief has the three-part fix. The KeyArt covers and the auth modal
stay dark by an existing decision. I cannot tell from the captures how the
Cebu art will sit inside the same placement variables — expect to re-measure
each file's head and foot the way the winter light files were.

**The bar.**
- Both themes read as finished scenes at 375, 1440 and 1600×900 and on a
  phone, at every beat of the walk, because the light theme is the one half of
  visitors will see first.
- Every colour comes from a token and both themes declare it, because a
  literal is right in exactly one theme.
- The 3D room's paper stays behind the cards and the west window stays where
  the shot ends, measured off the live DOM, because the cards are unreadable
  otherwise.
- Steady-state cost is unchanged: same layer count, same file sizes, the
  parked main thread still near zero; the toggle adds nothing that outlives
  the wave.
- Reduced motion leaves every layer composed and still, in both themes.
- No `.png` is ever requested and nothing 404s, because a missing decorative
  file fails silently.

**Done when.** I load the page cold in each theme and walk it end to end at
1600×900 and on a phone, then toggle at the top, in the room, on the bridge
and at the cross: each time the page crosses smoothly with no blank slot and
no pop-in, the network panel shows no request during the toggle, the
`.hero__model` box measures the same in both themes, and typecheck and build
are green.

---

*Doc-only change; the version is unchanged by AGENTS.md §6's exemption.*
