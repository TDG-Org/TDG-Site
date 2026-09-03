import { useEffect, useRef } from 'react'
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Fog,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Scene,
  SRGBColorSpace,
  TextureLoader,
  WebGLRenderer,
} from 'three'
import { clamp01, onFrame, settle, wake } from '../../lib/motion'
import { MAX_DPR, onDprChange } from '../../lib/dpr'
import { asset } from '../../lib/asset'
import type { WalkProgress } from '../Walk'

/**
 * One continuous 3D shot behind THREE sections: the reader crosses a snowfield
 * to a cabin while they read Origin, walks in through its door, turns into the
 * room and creeps across the big table while they read the project cards, and
 * finishes dollying into the west window while they read the small tools. It is
 * also a nod to Makullveny's own flagship theme, "Cozy Cabin".
 *
 * **The camera never stops and it never jolts.** That is this pass's whole
 * structural change and it is the site owner's note: "it jolts too quickly and
 * fast to pan down at the table", and "have the camera always, always be
 * moving, but faster in some areas and slower in some areas". There is no hold
 * anywhere on the walk now — every leg is linear in scroll and every station is
 * rounded so the speed is continuous across it. The argument, the arithmetic
 * and the measured speed curve are all in the header of "The shot" below.
 *
 * ## The walk, and where its progress comes from
 *
 * This component does NOT measure a section any more. `Walk.tsx` owns the
 * container that wraps Origin, Apps and Tools, computes the sticky pin's own
 * travel, and hands it down as `progress` — see `WalkProgress`, and
 * `internal/checklists/cabin-interior-spec.md`, which is the transcription of
 * the owner's hand-drawn floor plan and camera path and is the authority for
 * the shot.
 *
 * Two of the three numbers in that object are marks rather than progress:
 * `apps` and `tools` are the `p` at which each section's top reaches the top of
 * the viewport. **Every beat below is expressed against those marks rather than
 * against a literal**, so the two anchored beats land exactly as a heading
 * arrives and stay aligned when anybody changes a section's height.
 *
 * ```
 *   p 0         -> 0.33A   THE ORBIT     the loved swing in across the snow
 *   p 0.33A     -> 0.53A   THE RUN-IN    straight on to the door
 *   p 0.53A     -> 0.60A   THE MOUTH     in to the doorway, which swallows the frame
 *   p 0.60A     -> 0.74A   THE THRESHOLD on through it; the room opens
 *   p 0.74A     -> A       THE TURN      left, on to the table, at a person's eye
 *   p A         -> +0.25dT THE SETTLE    down over the paper as the grid climbs
 *   p ...       -> +0.72dT THE DRIFT     the slowest leg in the shot
 *   p ...       -> T       THE LIFT      off the table, round to the west window
 *   p T         -> 1       THE DOLLY     in to the window, and the wash-out
 * ```
 *
 * `A = progress.apps`, `T = progress.tools`, `dT = T - A`. The knot fractions
 * are `B_ORBIT` and its neighbours, the stations are `LEGS`, and the
 * interpolation is `shotAt`; all three carry their own numbers. **The fractions
 * are solved from the speed curve rather than chosen** — `B_ORBIT`'s note has
 * the table of metres, spans and rates that produced them.
 *
 * ## What is in the picture, and where it came from
 *
 * The composition answers two reference paintings the site owner supplied — a
 * log cabin in a snowy wood at night — and their contents are the spec:
 *
 * - a deep blue night sky, never black, with a soft LIGHTER band closing the
 *   horizon (the outermost rank of `RANK_R`, and the tone ladder above
 *   `T_TREE`). That band was a range of HILLS until this pass, and the site
 *   owner replaced it: "trees in the foreground like in an actual forest
 *   instead of boring mountains". It is a treeline now, and everything below
 *   is the same request answered at the other depths.
 * - a real forest in ranks: wall trunks close enough to the lens that the
 *   frame cuts their tops off (`TRUNKS`), near pines almost black with visible
 *   bare trunks, and behind them ranks that go paler and bluer with distance
 *   (`TREES`, `RANKS`, `RANK_R`)
 * - the cabin in the middle distance, log-built, stone chimney, smoke rising,
 *   a porch, windows glowing warm — at night. In light the house is dark and
 *   it is daytime; see `ROLES`.
 * - the window light POOLING on the snow and falling off fast, which is the
 *   emotional centre of both paintings and of this scene (`pool`, `halo`)
 * - ground that has been walked on: drifts, a footpath trodden to the door,
 *   the shade of the trees lying across it, bare weeds and small rocks
 *   (`driftAt`, `snowTone`, `PATH`, `WEEDS`, `STONES`)
 * - and an eye at a standing person's height by the end of the walk, so the
 *   walls have height and the roofline is against the sky (`Y_NEAR`)
 *
 * And, since the walk goes indoors, a ROOM — transcribed from the owner's floor
 * plan, plan view with north at the top and the camera entering from the south:
 *
 * | where | what | built by |
 * | --- | --- | --- |
 * | south wall | the front door the camera comes through | `buildWorld` |
 * | north wall, centre-left | the fireplace, set into the wall | `hearth` |
 * | west wall, middle | the window the camera ends on, and its casing | `SW_*` |
 * | east wall, middle | a second window, background only | `EW_*` |
 * | south-west corner | the big table, and three sheets on it | `TABLE_*` `PAPER_*` |
 * | south-east corner | a small desk, against the east wall | `DESK_*` |
 * | centre-south | a chair, pulled out, facing the desk | `chair` |
 * | north-west | the woodpile beside the hearth, two split logs on it | `interior` |
 * | north-east | a dresser under the east window | `interior` |
 * | north wall, east of the fire | a shelf, and two things on it | `interior` |
 * | in the firebox | three logs, burning | `hearth` |
 * | on the hearth slab | a kettle | `interior` |
 * | over the chair back | a blanket | `chair` |
 * | under the west window | a sill and an apron, proud of the wall | `interior` |
 * | round the front door | a casing: two jambs and a head | `buildWorld` |
 * | overhead | the room's own ceiling, under the roof slab | `interior` |
 *
 * **A room the camera is inside has no outline, and that is a CONTRACT rather
 * than a look.** Three critics rendered the walk independently and all three
 * led with the same sentence: the camera is not inside the cabin, it is outside
 * a room-shaped box. They were right and the cause was not a hole in the shell
 * — the shell is closed — it was that the shot lingered on the porch with the
 * doorway framing the room. `B_MOUTH` has that measurement and the fix.
 *
 * What has to stay true, and how to check it rather than look at it: at every
 * station from the door mouth inward, every ray through the four edges of the
 * frame must end on a surface of the room. Two probes settle it, and both were
 * run against the live page rather than reasoned about.
 *
 * - **Geometry.** Cast 33 rays along each frame edge, intersect them against
 *   the merged world buffer, and classify the nearest hit: inside the room's
 *   own box, out through a window, out through the doorway, or a HOLE. Over
 *   eleven positions from the mouth (2400px) to the settled window (5300px) at
 *   1440x900 — 1452 samples — the tally is 1409 room, 43 window, 0 door, 0
 *   hole, 0 miss. The 43 are the turn and the pan, where the frame's top edge
 *   crosses the west window because the camera is turning toward it; a window
 *   at the frame edge reads as a window, and at both SETTLED beats the wall
 *   carries all four corners with nothing through it.
 * - **Pixels.** Re-render into the live context and `readPixels` 48 samples
 *   along each edge. Over the seven beats, every sample comes back at alpha
 *   255 — the canvas draws opaque geometry on every edge everywhere — and no
 *   edge is FLAT: the narrowest luminance range on any edge at any beat is 10.5
 *   values. That second half is the one that matters, because the frame this
 *   was all written for had left and right edges that were rgb (50,57,68) at
 *   every one of 48 samples, which is a wall that a reader files under "page".
 *
 * Both probes also pass at 390x780, 320x800 and 1440x600.
 *
 * Two things on that table are a legibility requirement rather than
 * decoration, and the owner asked for both by name. **The paper** is a large
 * flat low-contrast field filling the frame behind where the project cards sit,
 * with no high-contrast edge crossing them — see `T_PAPER`, `PAPER_X0` and the
 * framing measurements on `ST_ROOM`. It is three sheets now rather than one
 * quad, with a curled rim, a shadow on the two edges the light is behind, and
 * the table's own edge and the floor beyond it in the frame's right margin.
 * Every one of those is placed against the card grid's box as MEASURED off the
 * live DOM at this beat — 130..1310 by -53..1093 at 1440x900 — and `TABLE_Z1`'s
 * note carries that box unprojected onto the table top, which is the
 * coordinate system anything moved here has to be solved in.
 *
 * **The fire** is the room's light source and the only animated thing in it:
 * layered emissive geometry, vertex-animated off the same `onFrame` dt
 * everything else here runs on, no texture and no new dependency. Five tongues
 * of four rows, each row split at its own spine so the middle can be hot and
 * opaque inside a soft cool edge; a billboarded ember fan under them; seven
 * one-triangle sparks; and a bed of three logs in the geometry beneath. It is
 * warmer than everything else in frame because it is the one thing drawn in
 * `--warm` rather than on the tone ramp, its hot core is that same pigment
 * scaled past what the framebuffer can hold (`HEAT_CORE`), and its light
 * reaches the walls, the table, the floor and the ceiling through `hearthAt`,
 * which BAKES it per vertex.
 *
 * **And the room has a RANGE, which is the thing this pass was sent to fix.**
 * The brief was "inside the cabin MUST be cozy" and the render it was written
 * against was a low-contrast grey fog with a small pale fire in it. Three
 * things were wrong and all three are in the tone ladder's own note: the
 * interior tones sat within nine values of each other, the hearth's falloff was
 * so flat it was a tint rather than a light, and the north wall had never been
 * cut round the firebox — so the flames were burning in front of a lit WALL
 * instead of a black cavity. In dark the same room now runs rgb green 15 in the
 * firebox to 78 on the hearth stone to 234 in the fire's own core; in light it
 * is a pale room at 129 to 190 against a page at 235.
 *
 * **Two things in the references are deliberately NOT here.** The aurora,
 * because it would be the loudest thing on a page whose whole palette is
 * restrained blues and greys, and the Christmas string lights, because they
 * date the section to one month a year. Both were the site owner's calls.
 *
 * A third is this file's: **there are no stars.** The sky is `--band-origin`,
 * which this component does not own and does not paint — and the snow already
 * fills that sky with drifting white points, from this scene's own field and
 * from the second `Snow` layer `Origin.tsx` mounts in front of it. Static
 * points behind moving ones at the same size read as noise, not as a night
 * sky. If they are ever wanted they belong in the section, not in here.
 *
 * ## Why the cabin is BUILT here rather than loaded
 *
 * There is no `.glb`, no `GLTFLoader`, no generated mesh, and that is a
 * decision rather than a shortcut.
 *
 * - **It has to belong beside the art kit.** `public/assets/parallax/` is flat,
 *   chunky, low-poly work — see `props/pine-faceted-pair-dark.webp` and
 *   `landscapes/mountain-ridge-dark.webp`: three or four tone steps of one cool
 *   blue per object, hard facet edges, no texture, no gradient. A photoscanned
 *   or AI-generated mesh would read as an import from a different site. Hitting
 *   that language by hand is *easy* — it is boxes, slanted quads and cones with
 *   one baked tone per face — and hitting it with a downloaded model is not.
 * - **It weighs nothing over the three.js chunk.** No download, no CDN, no
 *   licence to carry, no loader to import, and nothing to 404 after deploy.
 * - **It is editable by the next person.** Every dimension below is a named
 *   constant in a file git can diff. A binary mesh is not.
 *
 * The scene is **six draw calls for about 250px of scroll and three for every
 * frame the reader is indoors**, and its triangle count is a range rather than
 * a number, because the tier decides it. `low` is not an edge case — it is
 * every viewport under 760px and every machine with four cores or fewer, which
 * is most phones — so a single figure quoted from `high` describes the scene
 * most visitors never get. Counted per section as it is emitted, by building
 * all three tiers at mount and reading the buffer lengths back:
 *
 * ```
 *                        low     mid    high
 *   ground + drifts      128     262     386
 *   THE ROOM             504     600     600
 *   everything else
 *     outdoors           786    1173    1582
 *   window + door glow    60      60      60
 *   THE FIRE             146     146     146
 *   chimney smoke         15      20      25
 *                       ----    ----    ----
 *   total               1639    2261    2799
 *   snow points          200     420     640
 * ```
 *
 * The draw calls are not a tier's business at all — every tier draws the same
 * objects — and they were counted on the live page rather than reasoned about,
 * by patching `drawArrays` and bucketing every submission by its vertex count
 * (on `high` the world is 7704 verts, the snow 640, the fire 438, the wall glow
 * 156, the smoke 75, the lit openings 24). Over two seconds at each place:
 *
 * ```
 *   far approach       world snow glow smoke openings ....... 5, at 30Hz
 *   the last 6m in     all six of them, about 250px of scroll  6, at 30Hz
 *   through the door   world snow fire ...................... 3, at 30Hz
 *   the room           world snow fire ...................... 3, at 15Hz
 *   the window         world snow fire ...................... 3, at 15Hz
 *   past the walk      nothing at all ....................... 0
 * ```
 *
 * **The six-call window MOVED in this pass and it did not grow.** It used to be
 * at the door, where the outdoor warm layer and the fire were both up at once;
 * it is now on the approach, because `openAir` takes the outdoor layer out
 * three metres before the door mouth and `hearthLit` brings the fire up six
 * metres before that. The overlap is `camZ` 8.6 down to 2.46 — measured from
 * the two ramps and their own 0.002 visibility gates — and everything from the
 * threshold inward is now THREE calls rather than six, because the smoke, the
 * window glow and the door pool are all off by the time the reader is through.
 *
 * The same measurement once found a real bug: the fire's buffer was being
 * submitted TWICE per frame, because a transparent `DoubleSide` material is two
 * passes in three.js unless it is told otherwise. See `forceSinglePass`.
 *
 * It was 1249 / 1830 / 2363 before the cozy pass, 1513 / 2118 / 2651 after it,
 * and 902 / 1371 / 1884 before the room existed at all. So the cozy pass cost
 * 264 / 288 / 288 triangles and **the PLACE pass — the one that answered "the
 * room is a floating box" and "the room beat has no table and no paper" —
 * costs 126 / 143 / 148, which is 8.3% / 6.8% / 5.6%.**
 *
 * Where those go, and none of them is detail for its own sake. The room's own
 * 66 / 78 / 78 is the sheets (the single paper quad became a curled sheet at
 * 18 triangles, plus two more sheets and two shadow bands) and the west
 * window's casing (a head board with its own underside and two jambs, plus an
 * apron above `low`). The outdoor 60 / 65 / 70 is the door casing and one more
 * rank-3 trunk, which is the window beat's own subject and is therefore bought
 * at every tier rather than out of `tier.trunks`. Every one of them was added
 * to answer a measurement, and each of their notes carries the one it answers.
 *
 * The room and the fire together now cost 677 / 825 / 845 over the bare
 * exterior. What that buys, and why the shape of the spend is what it is:
 *
 * **Two thirds of it is SUBDIVISION, not detail.** The floor is 5 by 6 where it
 * was one quad, the ceiling is new, and the walls the fire actually reaches are
 * cut into strips. Not one of those cells adds a facet the eye can find — the
 * sky term gives every cell of a flat floor the identical value. They exist
 * because `hearthAt` is evaluated per VERTEX now, and a point source two metres
 * off a six-metre floor sampled at four corners is a flat wedge with the bright
 * end in the wrong place. `field` has the argument in full.
 *
 * **The reader is in the room for three fifths of the walk.** The two settled
 * beats in it are the frames the project cards and the small tools are read
 * against. 600 triangles for the entire interior — walls, ceiling, fireplace,
 * firebox, log bed, table, paper, desk, chair, blanket, beams, woodpile,
 * dresser, shelf, sill, kettle, rug — is still a third of what the forest
 * costs outdoors.
 *
 * **Nothing here is vertex-bound and nothing ever was.** The world is ONE
 * static non-indexed buffer with a per-vertex tone, built once at mount and
 * uploaded once — which is also why nothing in the room is an InstancedMesh:
 * instancing buys one draw call for N copies of one geometry, and the merge
 * already has one draw call for every triangle in the scene. The per-frame work
 * is a damped scalar, one `lookAt`, `flakes` positions, five billboarded puffs
 * and the fire's 92 moving triangles, and only the last of those is new.
 *
 * **What actually costs per frame is FILL, and indoors this pass spends far
 * less of it.** Outside, the transparent warm layer covers a third of the frame
 * across the approach and the snow fills the sky. Inside, `openAir` takes the
 * window glow, the door pool and the smoke to zero — they are all on the
 * outside faces of walls the reader is now behind — the snow drops to a third
 * and parks every flake that would fall indoors under the floor, and what is
 * left is the world, the flames and the fire's own wash. Three draw calls and a nearly empty
 * blend, at 15Hz rather than 30 once the camera is inside. **The room beat is
 * cheaper to draw than the approach it came from.**
 *
 * All of it is still deliberate: this is a silhouette with warm windows, not
 * an architectural render, and it sits behind seven chapters of prose that
 * have to stay the thing you read.
 *
 * ## The mount this expects
 *
 * `CabinScene` takes a `className` and lets the caller place it. The framing it
 * was composed for is **a viewport-sized box**, and on this site that box has a
 * name: `scene/Stage`, the sticky-backdrop primitive built in this same pass
 * for exactly this problem.
 *
 * **Use it. Do not hand-roll a sticky layer beside it.** A rebuilt one loses
 * `Stage`'s `data-covered` paint guard (a full-viewport backdrop goes on
 * painting all the way to the footer without it), its `aria-hidden`, and the
 * `.stage-host` line the SECTION needs — `.section` is `overflow: hidden`, an
 * `overflow: hidden` ancestor is a scroll container, and a scroll container
 * that never scrolls stops `sticky` dead. `Stage.tsx`'s header has that
 * measurement and the rest of the traps.
 *
 * `Walk.tsx` is the live mount, and it is a WRAPPER round three sections rather
 * than a section — which is the whole reason it exists. A `Stage` inside
 * `#origin` pins for `#origin`'s height and cannot paint behind Apps or Tools,
 * so the pin has to belong to a box that contains all three:
 *
 * ```tsx
 * const CabinScene = lazy(() =>
 *   import('./origin/CabinScene').then((m) => ({ default: m.CabinScene })),
 * )
 * // ...inside <div className="walk stage-host">
 * <Stage className="walk__stage">
 *   {cabin ? (
 *     <Suspense fallback={null}>
 *       <CabinScene className="walk__cabin" progress={progress} />
 *     </Suspense>
 *   ) : null}
 * </Stage>
 * <Origin /> <Apps /> <Tools />
 * ```
 *
 * `.walk__cabin` is `position: absolute; inset: 0; width:
 * 100%; height: 100%; display: block`, and that is all it has to be:
 * `.stage__pin` is already sticky and one viewport tall. There is no
 * `margin-bottom: -100svh` anywhere and there must not be — `Stage`'s outer
 * box is `position: absolute; inset: 0`, so it takes no flow space and there is
 * nothing to cancel. (An earlier version of this header prescribed exactly that
 * negative margin, on a `.origin__scene` class that has never existed anywhere
 * in this repo. It was wrong before `Stage` was written and it is wronger now.)
 *
 * `cabin` is the Walk's own deferred-mount flag and not part of this
 * component's contract: `React.lazy` splits the chunk but fires the import the
 * moment the component renders, so the flag is what stops a visitor who reads
 * the hero and leaves from downloading three.js. The IntersectionObserver
 * behind it moved out of `Origin.tsx` unchanged and watches `.walk` now.
 *
 * **The className lands on a container `<div>`, not on the canvas.** The canvas
 * is created inside the effect and appended to that container, so every mount
 * gets a brand new element — the note where it is created says what that is
 * worth. It is stretched over the container inline, so a caller rule that gives
 * the container a box gives the canvas the same one, and `clientWidth` /
 * `clientHeight` are unchanged. A caller whose class sized the element
 * INTRINSICALLY would now be sizing a div, which collapses to nothing; give the
 * container a box, the way `.origin__cabin` does.
 *
 * It does not *require* a viewport-sized box. A canvas stretched over the whole
 * section (the `inset: 0` shape `OriginField` used) is several times taller
 * than the viewport, and a 3D composition painted once across a box like that
 * would scroll away from the reader instead of staying in front of them. So the
 * camera composes for the SLICE of itself that is currently on screen, via an
 * off-centre frustum (`setViewOffset`, see `frameSlice`), and the scene stays
 * put in the viewport either way. The cost of the tall mount is real, though —
 * every frame fills the whole canvas, most of which nobody can see — so the
 * backing store is capped by area as well as by dpr, and `Stage` is still the
 * one to give it.
 *
 * ## Rules this is holding to (AGENTS.md §2)
 *
 * - **Rule 9, all motion through the one loop.** One `onFrame` subscriber. No
 *   `requestAnimationFrame`, no `THREE.Clock`, no `setAnimationLoop`. It holds
 *   the loop only while the damped camera is still converging, while
 *   something time-based is visibly moving — snow in the air, smoke over the
 *   chimney, the fire on the hearth — or while a theme cross-fade is running,
 *   and it returns
 *   before drawing *and* before holding whenever the section is off screen,
 *   because `useOffscreenPause` stamps `data-live` for CSS animations and
 *   cannot see an `onFrame` subscriber.
 * - **Rule 2, never write a colour.** Every pigment is resolved from a computed
 *   custom property on the section. There is not one literal colour in this
 *   file; if a token fails to parse the scene is not drawn at all, which is a
 *   better failure than inventing a palette.
 * - **Rule 3, both themes, as a design problem.** Dark is the night scene the
 *   brief describes. Light is NOT that scene dimmed: it is the same geometry as
 *   a bright overcast day, with a compressed tonal range, snow that all but
 *   merges with the sky, and — since this pass — **a house whose lights are
 *   off**, because a lit window at midday is a mistake and not atmosphere.
 *   See `ROLES`. Everything the art pass added goes through the same ramp,
 *   which is why the forest recedes correctly in both: dark's sky sits at the
 *   BOTTOM of that ramp and light's near the top, so one fog mix lifts a
 *   distant rank off the one and sinks it toward the other.
 * - **Rule 5, every state gets a face.** No WebGL, a refused context, a lost
 *   context and an unreadable palette all resolve to the same face: an empty
 *   transparent canvas. The section keeps its own gradients, its art kit and
 *   its prose and simply has no cabin. It is never a black rectangle. The
 *   READER's face is silence; the DEVELOPER's is not. Every one of those paths
 *   logs before it returns, in `lib/motion.ts`'s voice, because a bare
 *   `catch { return }` around the renderer is exactly what turned a hard crash
 *   into an invisible blank that survived a whole build-and-review pass.
 *
 * **The caller must lazy-load this.** three.js is the heaviest thing that could
 * be on this page. `Hero.tsx` splits `hero/PointCloud.tsx` the same way —
 * `React.lazy` + `<Suspense fallback={null}>` — and that is the pattern to
 * copy, but not the reason: `PointCloud` is a **2D canvas**
 * (`getContext('2d')`), and its chunk imports nothing from three at all. Hero
 * splits it because its twelve form definitions in `hero/shapes.ts` are the
 * largest thing on that section and none of it is needed to paint the hero.
 * Here the weight really is three.js. Nothing in this file runs at import time
 * beyond the three.js module itself. Measured two passes ago: the lazy chunk
 * was **527 kB raw / 136.8 kB gzipped**, and `npm run build` puts three.js and
 * this file in it and neither in the entry bundle. It is a separate file only
 * because of the dynamic import — pull this in statically and all of that
 * lands in the entry bundle, which is already flagged at 500 kB. (The forest
 * and the ground detail cost 8 kB raw and 3.8 kB gzipped of that, over the
 * 519 / 133 it was before them. Geometry built from named constants
 * compresses; a mesh would not have.)
 *
 * **That pair has NOT been re-measured since**, and the honest thing is to say
 * so rather than to let a stale number read as a current one. What this pass
 * added to the source is ten rows of a coordinate table, one more rank, four
 * trunks and a great deal of prose; comments do not survive minification and
 * number tables compress, so the expectation is under a kilobyte gzipped —
 * but an expectation is not a measurement. Re-run `npm run build` and replace
 * both figures the next time somebody is in here with the tree to themselves.
 */
export function CabinScene({
  className,
  progress,
}: {
  className?: string
  progress: WalkProgress
}) {
  const host = useRef<HTMLDivElement | null>(null)
  /*
   * The prop is read from inside `onFrame`, and `progress` is a FROZEN ACCESSOR
   * over a ref rather than a value — the same shape `useSectionProgress` and
   * `usePointer` hand back, so nothing re-renders sixty times a second. The
   * object identity is therefore stable for the life of the mount and the ref
   * below is only here so the effect's `[]` deps stay honest: an effect that
   * closed over the first `progress` and never saw a second one would be a
   * silent bug the day somebody makes Walk hand back a fresh object.
   */
  const walkRef = useRef(progress)
  walkRef.current = progress

  useEffect(() => {
    const mount = host.current
    if (!mount) return
    /*
     * The palette is read off the MOUNT, not off a section, and that is the
     * walk's doing rather than a preference. `Stage` is a sibling of the three
     * sections inside `.walk`, so `mount.closest('section')` is null here and
     * the old read would have returned before drawing anything at all.
     *
     * Nothing is lost by moving it: every token this reads — `--text`,
     * `--surface`, `--accent-2`, `--warm` and the three `--band-*` — is
     * declared on `:root` in `styles/tokens.css`, custom properties inherit,
     * and `base.css` sets only `--tint-*` and `--seam-fill` per section. So the
     * values resolve identically on any element in the document, and reading
     * them here rather than two ancestors up means this component no longer
     * cares what shape its caller's DOM is.
     */
    const section = mount

    // ── palette ───────────────────────────────────────────────────────────────
    /*
     * Read before anything is built: with no palette there is nothing to draw,
     * and an empty transparent canvas is this component's honest failure face.
     *
     * A failure here is terminal — the deps are `[]`, so nothing re-runs it —
     * and that is a position rather than an oversight. Every token this reads
     * comes from `styles/tokens.css`, which `main.tsx` imports before it
     * renders anything, plus `--band-origin`, which `Origin.css` sets on the
     * very section being measured and which is therefore in the document before
     * this element exists. There is no ordering in which the read fails now and
     * a later one succeeds, so a retry would be a loop with nothing to wait for.
     * What there IS is the log: without it this is a section that renders
     * perfectly, has no cabin, and says nothing anywhere about why.
     */
    const first = readPalette(section)
    if (!first) {
      console.error(
        '[cabin] palette unreadable, so nothing is drawn',
        document.documentElement.getAttribute('data-theme') ?? 'dark',
      )
      return
    }
    let target: Palette = first
    let shown: Palette = { ...first }

    // ── the canvas ────────────────────────────────────────────────────────────
    /*
     * This component creates its own canvas rather than rendering one in JSX,
     * and that is the whole fix for a bug that hid this scene from everybody
     * who ever worked on it.
     *
     * `main.tsx` wraps the app in `<StrictMode>`, which in development runs
     * every effect setup → cleanup → setup **on the same DOM node**. The
     * cleanup below calls `renderer.forceContextLoss()`, and it has to:
     * browsers cap the number of live WebGL contexts per page and start
     * dropping the oldest, which takes out whatever else on the page owned one.
     * But on the second setup `canvas.getContext('webgl2')` hands back THE
     * SAME, STILL-LOST context rather than null — measured against this repo's
     * own three, `sameObject: true, secondIsLost: true` — so three.js sails
     * straight past its own "Error creating WebGL context" guard and dies in
     * the capabilities probe instead, with `TypeError: Cannot read properties
     * of null (reading 'precision')`.
     *
     * Measured before the fix, through real React StrictMode on this tree: one
     * construction, one dispose, one forced loss, **zero renders**, no console
     * error and nothing in the network tab. The canvas was present, sized and
     * transparent and the cabin simply never existed — on every dev load and
     * every Fast Refresh. Production was safe only because StrictMode does not
     * double-invoke there, and `Origin.tsx`'s own header contemplates
     * unmounting on scroll-out, which would have made it permanent and silent
     * there too.
     *
     * A fresh element per mount is the fix that KEEPS `forceContextLoss()`.
     * Both alternatives give something real up. Dropping the forced loss leaks
     * a context per mount, which is the bug the cleanup was written for. And a
     * lost context cannot be un-lost on demand: `WEBGL_lose_context`'s
     * `restoreContext()` is asynchronous and applies only to a context the
     * extension itself lost, so "detect and recover" is a race in place of a
     * guarantee.
     */
    const cv = document.createElement('canvas')
    // Inline, because this component does not own a stylesheet and does not
    // want to depend on the caller having written one. The box comes from the
    // container, so `clientWidth` / `clientHeight` are the caller's box exactly.
    // `pointer-events: none` because a full-bleed canvas that can take a
    // pointer event is a canvas that can eat a click on the prose behind it.
    cv.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none'
    mount.appendChild(cv)
    // The canvas is absolutely positioned, so the container has to BE its
    // containing block. `.origin__cabin` already is; a caller whose class left
    // it `static` would size this against whatever ancestor happened to be
    // positioned instead, which is a bug that shows up only on that caller's
    // layout. One computed read, once, at mount.
    if (getComputedStyle(mount).position === 'static') mount.style.position = 'relative'

    // ── renderer ──────────────────────────────────────────────────────────
    // WebGL is a thing that can be refused — a blocklisted driver, a machine
    // out of contexts, a browser with it switched off. Nothing here is content,
    // so the answer is to draw nothing and let the section be what it already
    // was. `alpha` with a zero clear alpha is what makes that true even for a
    // context that comes up and then dies: an un-cleared canvas is transparent,
    // never black.
    const tier = TIERS[tierOf()]
    let renderer: WebGLRenderer
    try {
      renderer = new WebGLRenderer({
        canvas: cv,
        alpha: true,
        antialias: tier.aa,
        // A backdrop has no business asking for the discrete GPU on a laptop.
        powerPreference: 'low-power',
        // Nothing reads this canvas back, and not preserving it lets the driver
        // pick the cheaper path.
        preserveDrawingBuffer: false,
      })
    } catch (err) {
      // The reader's face is the empty transparent canvas above. The DEVELOPER
      // does not get silence: this is `lib/motion.ts`'s voice for a subscriber
      // that threw, and it is here because `catch { return }` is what made the
      // StrictMode failure above invisible for a whole pass.
      console.error('[cabin] renderer construction failed', err)
      cv.remove()
      return
    }
    renderer.setClearAlpha(0)

    // ── the scene ─────────────────────────────────────────────────────────
    const scene = new Scene()
    // `new Color()` is white and is overwritten by `applyPalette` before the
    // first render; Fog's constructor simply requires something here.
    const fog = new Fog(new Color(), FOG_NEAR, FOG_FAR)
    scene.fog = fog

    /*
     * The near plane is 0.14 and was 0.6, and the doorway is why.
     *
     * The camera goes THROUGH a 1.2m opening with a door leaf standing in most
     * of it, and at the moment it passes the wall the near plane is a rectangle
     * 0.61 wide floating 60cm ahead of the lens. Measured on the entry line at
     * x = 0.34: that rectangle reaches x = 0.645 and the jamb is at 0.6, so the
     * wall would be sliced open at the right of the frame for the whole
     * threshold beat. At 0.14 the near rectangle is 0.14 wide and the closest
     * anything comes to it is the door leaf's free edge at 0.15.
     *
     * It costs depth precision and the scene can afford it: with a 24-bit
     * buffer, near 0.14 and far 220, the resolvable step at the treeline's 45m
     * is about a millimetre and at the cabin's 12m about a tenth of one.
     * Nothing here is coplanar by accident — the path sits PATH_LIFT above the
     * snow, the pools sit above the path, the window bars sit 1cm proud of the
     * panes — and every one of those offsets is centimetres, not microns.
     */
    const camera = new PerspectiveCamera(FOV_MIN, 1, 0.14, 220)

    const geometries: BufferGeometry[] = []
    const materials: (MeshBasicMaterial | PointsMaterial)[] = []

    // The world: ground, cabin, trees. One merged non-indexed geometry with a
    // per-vertex tone, so the whole thing is one draw call and the facet steps
    // that make it read as low-poly art are baked in rather than lit at
    // runtime. `bodyTone` is kept because a theme change re-derives the colour
    // buffer from it — the shape never changes, only the two ends of the ramp.
    /*
     * ── two worlds, one mesh ────────────────────────────────────────────
     * The geometry is the THEME's now: the cabin at night, the nipa hut by
     * day. One is built at mount for the theme on the page; the other is built
     * at idle, once the loop has parked, so a toggle is a buffer swap and
     * never a rebuild on the wave. `swapWorld` below runs at the palette
     * cross-fade's midpoint, under the bloom ThemeProvider paints, which is
     * the one frame where a cut is invisible; if the spare has not arrived by
     * then (a toggle inside the first seconds) it builds synchronously, once.
     */
    let hut = document.documentElement.getAttribute('data-theme') === 'light'
    let world = buildWorld(tier, hut)
    let bodyTone = new Float32Array(world.tone)
    let bodyPig = new Uint8Array(world.pig)
    let bodyGeo = new BufferGeometry()
    bodyGeo.setAttribute('position', new BufferAttribute(new Float32Array(world.pos), 3))
    let bodyColor = new BufferAttribute(new Float32Array(bodyTone.length * 3), 3)
    bodyGeo.setAttribute('color', bodyColor)
    const bodyMat = new MeshBasicMaterial({ vertexColors: true })
    const body = new Mesh(bodyGeo, bodyMat)
    scene.add(body)
    geometries.push(bodyGeo)
    materials.push(bodyMat)
    let spare: { hut: boolean; solid: Solid } | null = null
    let spareTimer = 0
    const prebuild = () => {
      spareTimer = 0
      if (spare?.hut === !hut) return
      spare = { hut: !hut, solid: buildWorld(tier, !hut) }
    }
    // Rule 9's exemption: one-shot, not animation, ends by itself.
    const scheduleSpare = () => {
      if (spareTimer) return
      spareTimer =
        typeof requestIdleCallback === 'function'
          ? requestIdleCallback(prebuild, { timeout: 8000 })
          : window.setTimeout(prebuild, 2500)
    }
    scheduleSpare()

    /* The lagoon beyond the palms: a painted plate standing far out, the one
       raster in this scene and only in the hut's world. Unfogged (it is past
       the fog's reach) and drawn at 0.72 so the page's own sky shows through
       it — which is the aerial perspective the fog gives everything else. */
    const matteGeo = new BufferGeometry()
    {
      const MW = 150
      const MH = MW * (784 / 1168)
      const my0 = 4 - MH * 0.55
      const mz = -72
      matteGeo.setAttribute(
        'position',
        new BufferAttribute(
          new Float32Array([
            -MW / 2, my0, mz, MW / 2, my0, mz, MW / 2, my0 + MH, mz,
            -MW / 2, my0, mz, MW / 2, my0 + MH, mz, -MW / 2, my0 + MH, mz,
          ]),
          3,
        ),
      )
      matteGeo.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]), 2))
    }
    const matteMat = new MeshBasicMaterial({ transparent: true, opacity: 0.72, fog: false, depthWrite: false })
    const matte = new Mesh(matteGeo, matteMat)
    matte.visible = false
    matte.renderOrder = 0
    scene.add(matte)
    geometries.push(matteGeo)
    materials.push(matteMat)
    let matteAsked = false
    const askMatte = () => {
      if (matteAsked) return
      matteAsked = true
      new TextureLoader().load(asset('assets/parallax/scene/lagoon-matte.webp'), (tex) => {
        tex.colorSpace = SRGBColorSpace
        matteMat.map = tex
        matteMat.needsUpdate = true
        matte.visible = hut
        invalidate()
      })
    }
    if (hut) askMatte()

    let pendingHut: boolean | null = null
    const swapWorld = (toHut: boolean) => {
      if (toHut === hut) return
      const solid = spare?.hut === toHut ? spare.solid : buildWorld(tier, toHut)
      spare = null
      hut = toHut
      const geo = new BufferGeometry()
      geo.setAttribute('position', new BufferAttribute(new Float32Array(solid.pos), 3))
      bodyTone = new Float32Array(solid.tone)
      bodyPig = new Uint8Array(solid.pig)
      const col = new BufferAttribute(new Float32Array(bodyTone.length * 3), 3)
      geo.setAttribute('color', col)
      body.geometry = geo
      const at = geometries.indexOf(bodyGeo)
      if (at >= 0) geometries.splice(at, 1)
      bodyGeo.dispose()
      bodyGeo = geo
      bodyColor = col
      geometries.push(geo)
      if (toHut) askMatte()
      matte.visible = toHut && matteMat.map !== null
      dirty = true
      scheduleSpare()
    }

    // The lit openings, and their bloom. Two meshes rather than one because
    // their brightness curves differ per theme: a halo that reads as bloom on a
    // near-black night reads as a smudge on a pale day, so it needs its own
    // opacity. Both take their hue from `material.color` and their shape from
    // vertex alpha, which means a theme change is a colour assignment and not a
    // buffer rewrite.
    //
    // NormalBlending in BOTH themes, deliberately. Additive is the prettier
    // choice on the dark scene and does nothing at all over a near-white one,
    // so a per-theme blend mode would be a hard switch in the middle of a
    // 600ms cross-fade — the one place on this site a colour change is not
    // allowed to snap. Warm over dark reads as a lit window; warm over pale
    // reads as warm haze. One code path, no snap.
    const core = buildGlowCore()
    const coreGeo = new BufferGeometry()
    coreGeo.setAttribute('position', new BufferAttribute(new Float32Array(core.pos), 3))
    const coreMat = new MeshBasicMaterial({ transparent: true, depthWrite: false })
    const coreMesh = new Mesh(coreGeo, coreMat)
    coreMesh.renderOrder = 2
    scene.add(coreMesh)
    geometries.push(coreGeo)
    materials.push(coreMat)

    const soft = buildGlowSoft()
    const softGeo = new BufferGeometry()
    softGeo.setAttribute('position', new BufferAttribute(new Float32Array(soft.pos), 3))
    // itemSize 4: the alpha channel is the falloff. three.js reads an RGBA
    // colour attribute as USE_COLOR_ALPHA and multiplies it into the material's
    // own colour and opacity, which is exactly the split wanted here.
    softGeo.setAttribute('color', new BufferAttribute(new Float32Array(soft.rgba), 4))
    const softMat = new MeshBasicMaterial({ transparent: true, depthWrite: false, vertexColors: true })
    const softMesh = new Mesh(softGeo, softMat)
    softMesh.renderOrder = 1
    scene.add(softMesh)
    geometries.push(softGeo)
    materials.push(softMat)

    // ── smoke ─────────────────────────────────────────────────────────────
    /*
     * A handful of soft quads leaving the chimney, and it is the cheapest
     * thing in this file per unit of meaning: a cabin with smoke is lived in,
     * and the identical cabin without it is a model of a cabin.
     *
     * Quads rather than points, for two reasons. A `PointsMaterial` has ONE
     * size for the whole object, and the shape of smoke is entirely in the
     * fact that it starts tight and opens out. And these have to be soft,
     * which without a texture means a per-vertex alpha ramp — which points
     * cannot carry and a quad can.
     *
     * They are billboarded against the camera's own azimuth every frame. That
     * is affordable here and nowhere else in this scene: it is five quads,
     * against the merged world mesh's thousand-odd static triangles, and the
     * camera swings 24 degrees across the walk so a fixed facing would go
     * visibly edge-on. `VIEW_FROM`'s note is the other half of this decision —
     * everything that could take a fixed facing did.
     *
     * The tint is its own palette entry rather than the warm one. Smoke is not
     * lit by the fire, it is lit by the sky, and in light it has to come out
     * DARKER than the sky it sits on while in dark it comes out lighter. See
     * ROLES.
     */
    const puffs = tier.puffs
    const smokePos = new Float32Array(puffs * SMOKE_TRIS * 9)
    const smokeRgba = new Float32Array(puffs * SMOKE_TRIS * 12)
    const smokeGeo = new BufferGeometry()
    const smokePosAttr = new BufferAttribute(smokePos, 3)
    const smokeColAttr = new BufferAttribute(smokeRgba, 4)
    smokePosAttr.setUsage(DynamicDrawUsage)
    smokeColAttr.setUsage(DynamicDrawUsage)
    smokeGeo.setAttribute('position', smokePosAttr)
    smokeGeo.setAttribute('color', smokeColAttr)
    const smokeMat = new MeshBasicMaterial({ transparent: true, depthWrite: false, vertexColors: true })
    const smokeMesh = new Mesh(smokeGeo, smokeMat)
    smokeMesh.frustumCulled = false
    smokeMesh.renderOrder = 2
    scene.add(smokeMesh)
    geometries.push(smokeGeo)
    materials.push(smokeMat)
    /** Seconds of smoke that have been drawn. Frozen at 0 under reduced motion. */
    let smokeT = 0
    /**
     * Seconds of snow that have been drawn — the sway's clock, on the same
     * rule as `smokeT` and as `scene/Snow.tsx`'s `elapsed`: advanced only by
     * the `step` of a frame that is actually drawn, never read off the wall.
     * It used to be `now * 0.001`, and a wall clock keeps running through a
     * tab switch, a background pause or a long frame; when the loop came back
     * the fall moved by a clamped 50ms but the sway re-evaluated seconds
     * later, and every flake in view jumped sideways by up to twice its sway
     * in one frame. Frozen at 0 under reduced motion, so the rest frame is
     * the same picture it always was.
     */
    let swayT = 0

    /**
     * Lay the puffs out for the current clock and camera facing.
     *
     * Called on every frame that draws, including the single frame a
     * reduced-motion visitor gets — which is why the rest pose has to be a
     * real picture rather than an empty buffer. At `smokeT === 0` the puffs
     * are already spread along their column, because their phases are spaced
     * by index and not accumulated from zero.
     */
    const layoutSmoke = (rx: number, rz: number) => {
      for (let i = 0; i < puffs; i++) {
        const q = ((smokeT * SMOKE_RATE + i / puffs) % 1 + 1) % 1
        const rise = q * SMOKE_RISE
        const cx = CHIM_X + q * q * SMOKE_WIND_X + Math.sin(q * 5.1 + i) * 0.22 * q
        const cy = CHIM_Y + 0.35 + rise
        const cz = CHIM_Z + q * q * SMOKE_WIND_Z + Math.cos(q * 4.3 + i) * 0.18 * q
        const r = SMOKE_R0 + q * (SMOKE_R1 - SMOKE_R0)
        // in fast, out slow: a puff that faded in as gently as it fades out
        // would be born as a ghost hovering off the chimney rather than
        // leaving it.
        const a = Math.min(1, q * 7) * (1 - q) * (1 - q)
        let at = i * SMOKE_TRIS * 9
        let ct = i * SMOKE_TRIS * 12
        /*
         * A fan, not a quad, and the difference is the whole look of it.
         *
         * A quad has four corners and they are ALL on its outline, so however
         * the alpha is ramped across it there is a hard edge somewhere.
         * Rendered, that is exactly what it was: a rectangular card hanging
         * over the roof. A fan puts the only bright vertex in the MIDDLE and
         * takes every rim vertex to zero, so the shape has no edge at all —
         * the same trick `halo` uses on the wall, in the round.
         */
        const spin = i * 1.31
        for (let t = 0; t < SMOKE_TRIS; t++) {
          const a0 = spin + (t / SMOKE_TRIS) * Math.PI * 2
          const a1 = spin + ((t + 1) / SMOKE_TRIS) * Math.PI * 2
          const pts: [number, number, number][] = [
            [0, 0, a],
            [Math.cos(a0), Math.sin(a0), 0],
            [Math.cos(a1), Math.sin(a1), 0],
          ]
          for (const [ox, oy, al] of pts) {
            smokePos[at++] = cx + rx * r * ox
            smokePos[at++] = cy + r * oy
            smokePos[at++] = cz + rz * r * ox
            smokeRgba[ct++] = 1
            smokeRgba[ct++] = 1
            smokeRgba[ct++] = 1
            smokeRgba[ct++] = al
          }
        }
      }
      smokePosAttr.needsUpdate = true
      smokeColAttr.needsUpdate = true
    }

    // ── the fire ──────────────────────────────────────────────────────────
    /*
     * The room's one light source, and the only animated thing inside it.
     *
     * "make sure the fire has good SVGs or however way you want to make it look
     * nice" — this is WebGL, so the WebGL answer: layered emissive geometry
     * whose vertices are rewritten every drawn frame. No texture file, no
     * sprite sheet, no new dependency, and nothing to 404 after deploy.
     *
     * **One buffer, two halves, and only the second half is ever rewritten.**
     * The first `fireStaticTris` triangles are what the fire DOES to the room —
     * the wash on the hearth face, the pool on the floor, the low warmth on
     * the table and the west wall, the two lanterns — and none of that changes
     * shape, only brightness, which is `fireMat.opacity`. The flames and the
     * ember bed are the moving half and start at `fireBase`. Splitting them
     * into two meshes would be a sixth draw call to save writing 200 floats.
     *
     * `DoubleSide`, and it is the one material in this file that has it. Every
     * other surface here is a facet of a solid whose back nobody may see, so
     * `pushQuad` and `tri` STATE their winding and `FrontSide` catches the
     * mistakes — `pushQuad`'s note has the four pools that were culled for a
     * whole pass because of it. A flame is not a solid: it is billboarded at
     * the camera every frame, so "which way is out" is not a property it has.
     * Backface culling on a shape with no back is a bug waiting for the day
     * the camera crosses its plane. It costs nothing — the same triangle is
     * rasterised once either way.
     */
    const fireStatic = buildFireStatic()
    const fireStaticTris = fireStatic.pos.length / 9
    // The moving half, and it is the whole of what the reader sees burning:
    // a soft fan of embers on the log bed (SMOKE_TRIS wedges, edgeless, the
    // same shape a smoke puff is), five tongues of four rows split into two
    // quads each, and seven sparks of one triangle apiece.
    const fireMoveTris = SMOKE_TRIS + FLAMES * FLAME_ROWS * 4 + EMBERS
    const fireTris = fireStaticTris + fireMoveTris
    const firePos = new Float32Array(fireTris * 9)
    const fireRgba = new Float32Array(fireTris * 12)
    firePos.set(fireStatic.pos)
    fireRgba.set(fireStatic.rgba)
    /** Where the moving half starts, in floats. */
    const fireBase = fireStaticTris * 9
    const fireBaseC = fireStaticTris * 12
    const fireGeo = new BufferGeometry()
    const firePosAttr = new BufferAttribute(firePos, 3)
    const fireColAttr = new BufferAttribute(fireRgba, 4)
    firePosAttr.setUsage(DynamicDrawUsage)
    fireColAttr.setUsage(DynamicDrawUsage)
    fireGeo.setAttribute('position', firePosAttr)
    fireGeo.setAttribute('color', fireColAttr)
    const fireMat = new MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      side: DoubleSide,
      // **`forceSinglePass` is not optional here and it was measured, not
      // assumed.** three.js renders a TRANSPARENT DoubleSide material in two
      // passes — back faces, then front — so that a closed transparent solid
      // sorts correctly against itself. Counted on the live page by patching
      // `drawArrays` and bucketing by vertex count: at the room beat
      // the fire buffer — 264 vertices at the time, 438 since the flames were
      // rebuilt — was submitted 58 times over 29 renders, exactly twice per
      // frame, while the world and the snow went once each.
      // Nothing in this buffer is a closed solid — they are flat tongues and
      // flat washes — so the second pass is a duplicate of the first and the
      // only thing it buys is a fourth draw call in the one beat this file
      // works hardest to keep cheap.
      forceSinglePass: true,
    })
    const fireMesh = new Mesh(fireGeo, fireMat)
    fireMesh.frustumCulled = false
    fireMesh.renderOrder = 2
    scene.add(fireMesh)
    geometries.push(fireGeo)
    materials.push(fireMat)
    /** Seconds of fire that have been drawn. Frozen at 0 under reduced motion. */
    let fireT = 0

    /**
     * The flicker, as one scalar in 0..1.
     *
     * Three sines at rates with no common period — 2.7, 4.31 and 0.93 Hz —
     * because two sines beat visibly and a single one is a pulse. Slow and
     * uneven is the brief; the fastest term here is a 230ms wobble, which is
     * about the rate a real log fire changes brightness at, and the 0.93 term
     * is what makes one flare-up in every few seconds bigger than the others.
     *
     * It never reaches 0. A fire that goes out and comes back is a fault
     * light; the floor is 0.48 and the ceiling is 1.
     *
     * At `fireT === 0` — the single frame a reduced-motion visitor gets — this
     * is 0.850 rather than some degenerate end of its range, because the two
     * offset terms are deliberately phased. The rest pose has to be a real
     * picture, exactly as `layoutSmoke`'s does.
     */
    const flicker = () =>
      0.74 +
      0.1 * Math.sin(fireT * 2.7) +
      0.08 * Math.sin(fireT * 4.31 + 1.7) +
      0.08 * Math.sin(fireT * 0.93 + 0.4)

    /**
     * Lay the ember bed, the flames and the sparks out for the current clock
     * and camera.
     *
     * `rx` / `rz` is the camera's own screen-right projected onto the ground,
     * the same billboard `layoutSmoke` takes. A flame is a flat tongue and the
     * camera swings about 70 degrees across the room, so a fixed facing would
     * go edge-on somewhere in the middle of the shot.
     *
     * Three layers, written in the order the eye finds them and therefore in
     * the order they have to draw — the buffer is one non-indexed run and
     * `depthWrite` is off, so back to front IS the write order:
     *
     * 1. **the ember bed**, a soft fan on the log bed, breathing on its own
     *    slow term so the base of the fire is never as dark as the gap between
     *    two tongues;
     * 2. **the tongues**, `FLAME_ROWS` rows each, every row split at the spine
     *    into two quads so the middle can be hot and opaque while the edges go
     *    cool and transparent — see `HEAT_CORE` for why one scalar does that;
     * 3. **the sparks**, one triangle each, rising and dying inside the flue.
     *
     * Each tongue narrows and fades to nothing at the tip, with the lateral
     * offset scaled by `k * k` so the root stays planted and only the top licks
     * about. A tongue whose base moved would read as a flag.
     */
    const layoutFire = (rx: number, rz: number) => {
      let at = fireBase
      let ct = fireBaseC
      const push = (x: number, y: number, z: number, a: number, h: number) => {
        firePos[at++] = x
        firePos[at++] = y
        firePos[at++] = z
        fireRgba[ct++] = h
        fireRgba[ct++] = h
        fireRgba[ct++] = h
        fireRgba[ct++] = a
      }
      /*
       * The ember bed. A FAN rather than the flat quad it used to be, and for
       * the reason `layoutSmoke`'s own fan gives: a quad's four corners are all
       * on its outline, so however its alpha is ramped there is a hard edge
       * somewhere — and the old one sat on the firebox floor as a visible
       * rectangle of pale, which is half of what made the hearth read as "a
       * dark rectangle with a pale wedge in it". The fan puts the only bright
       * vertex in the middle and takes every rim vertex to zero, so the glow
       * under the logs has no boundary at all.
       */
      const bed = 0.46 + 0.4 * (0.5 + 0.5 * Math.sin(fireT * 1.31 + 2.2))
      const spinB = fireT * 0.11
      const bedY = FIRE_Y + 0.11
      for (let t = 0; t < SMOKE_TRIS; t++) {
        const a0 = spinB + (t / SMOKE_TRIS) * Math.PI * 2
        const a1 = spinB + ((t + 1) / SMOKE_TRIS) * Math.PI * 2
        push(FIRE_X, bedY, FIRE_Z, bed, HEAT_BED)
        for (const a of [a0, a1]) {
          const u = Math.cos(a) * EMBER_HW
          push(FIRE_X + rx * u, bedY + Math.sin(a) * EMBER_HY, FIRE_Z + rz * u, 0, HEAT_TIP)
        }
      }
      const mid = (FLAMES - 1) / 2
      for (let i = 0; i < FLAMES; i++) {
        const ph = i * 2.13
        const bx = (i - mid) * FLAME_GAP
        // The outer tongues are shorter, and it is the cheapest thing that
        // stops five of them reading as a comb: a fire is tallest where the
        // fuel is deepest, which is the middle of the bed.
        const taper = 1 - FLAME_TAPER * (Math.abs(i - mid) / mid)
        // Per-tongue height pulse. Out of phase with its neighbours, so the
        // five never rise and fall together — which is the single tell that
        // separates a fire from a flag.
        const tall = (0.72 + 0.4 * (0.5 + 0.5 * Math.sin(fireT * 1.7 + ph))) * taper
        const row = (r: number): [number, number, number] => {
          const k = r / FLAME_ROWS
          const y = FIRE_Y + FLAME_H * tall * Math.pow(k, 0.85)
          const w = FLAME_W * tall * Math.pow(1 - k, 0.7)
          const u = bx + FLAME_SWAY * Math.sin(fireT * 2.2 + ph + k * 2.4) * k * k
          return [u, y, w]
        }
        const px = (u: number) => FIRE_X + rx * u
        const pz = (u: number) => FIRE_Z + rz * u
        for (let r = 0; r < FLAME_ROWS; r++) {
          const [u0, y0, w0] = row(r)
          const [u1, y1, w1] = row(r + 1)
          const k0 = r / FLAME_ROWS
          const k1 = (r + 1) / FLAME_ROWS
          const a0 = Math.pow(1 - Math.pow(k0, FLAME_ALPHA_K), FLAME_ALPHA_P)
          const a1 = Math.pow(1 - Math.pow(k1, FLAME_ALPHA_K), FLAME_ALPHA_P)
          const h0 = HEAT_CORE + (HEAT_TIP - HEAT_CORE) * k0
          const h1 = HEAT_CORE + (HEAT_TIP - HEAT_CORE) * k1
          // Spine first, then each flank out to its own transparent edge. The
          // two quads share the spine's vertices exactly, so there is no seam
          // down the middle of a tongue however wide it gets.
          for (const sign of [-1, 1]) {
            const A: [number, number, number, number, number] = [px(u0), y0, pz(u0), a0, h0]
            const B: [number, number, number, number, number] = [px(u0 + sign * w0), y0, pz(u0 + sign * w0), a0 * FLAME_EDGE_A, h0 * HEAT_EDGE]
            const C: [number, number, number, number, number] = [px(u1 + sign * w1), y1, pz(u1 + sign * w1), a1 * FLAME_EDGE_A, h1 * HEAT_EDGE]
            const D: [number, number, number, number, number] = [px(u1), y1, pz(u1), a1, h1]
            for (const q of [A, B, C, A, C, D]) push(q[0], q[1], q[2], q[3], q[4])
          }
        }
      }
      /*
       * The sparks. One triangle each, standing on its own base and pointing
       * up, billboarded on the same `rx`/`rz` as everything else here.
       *
       * `EMBER_RISE` is 0.5 off a bed at 0.60, so the highest a spark reaches
       * is 1.10 against the firebox lintel at 1.52. They die inside the box —
       * a spark crossing the mantel would be a spark in the room, which is a
       * house fire rather than a hearth.
       *
       * The lateral seed is `sin(i * 12.9898)` rather than an rng: this runs in
       * the frame loop and the loop is not allowed to make garbage or to carry
       * state that a resize could resample. It is the same trick every hash in
       * a shader uses and it is deterministic across mounts.
       */
      for (let i = 0; i < EMBERS; i++) {
        const q = (((fireT * EMBER_RATE + i / EMBERS) % 1) + 1) % 1
        const seed = Math.sin(i * 12.9898) * 0.5
        const u = seed * 0.44 + Math.sin(fireT * 1.1 + i * 2.7) * 0.1 * q
        const y = FIRE_Y + 0.1 + q * EMBER_RISE
        const sz = EMBER_SIZE * (1 - q * 0.45)
        // in fast, out slow, exactly like a smoke puff: a spark that faded in
        // as gently as it dies would be born hovering rather than thrown.
        const a = Math.min(1, q * 6) * (1 - q) * (1 - q)
        const h = HEAT_CORE + (HEAT_TIP - HEAT_CORE) * q
        push(FIRE_X + rx * (u - sz), y, FIRE_Z + rz * (u - sz), a, h)
        push(FIRE_X + rx * (u + sz), y, FIRE_Z + rz * (u + sz), a, h)
        push(FIRE_X + rx * u, y + sz * 2.4, FIRE_Z + rz * u, 0, h)
      }
      firePosAttr.needsUpdate = true
      fireColAttr.needsUpdate = true
    }

    // ── snow ──────────────────────────────────────────────────────────────
    // One Points object over one buffer that is mutated in place. No per-flake
    // object, no texture: square flakes are what a `PointsMaterial` with no map
    // draws, and in a scene made entirely of hard facets that is the right
    // shape anyway — it also means there is no texture to upload or dispose.
    //
    // The flakes live in a box that follows the camera, and the camera's own
    // per-frame displacement is subtracted from their local positions and
    // wrapped. That is what makes them world-static — they have real parallax
    // against the cabin instead of riding along with the viewer — while still
    // always filling the frame, at a count that would be far too sparse spread
    // over the whole length of the walk.
    const flakes = tier.flakes
    const snowSeed = rng(0x5e11)
    const lx = new Float32Array(flakes)
    const ly = new Float32Array(flakes)
    const lz = new Float32Array(flakes)
    const fall = new Float32Array(flakes)
    const sway = new Float32Array(flakes)
    const phase = new Float32Array(flakes)
    for (let i = 0; i < flakes; i++) {
      lx[i] = (snowSeed() * 2 - 1) * SNOW_HX
      ly[i] = snowSeed() * SNOW_HY
      lz[i] = (snowSeed() * 2 - 1) * SNOW_HZ
      fall[i] = 0.75 + snowSeed() * 1.25
      sway[i] = 0.1 + snowSeed() * 0.28
      phase[i] = snowSeed() * Math.PI * 2
    }
    const snowPos = new Float32Array(flakes * 3)
    const snowGeo = new BufferGeometry()
    const snowAttr = new BufferAttribute(snowPos, 3)
    snowAttr.setUsage(DynamicDrawUsage)
    snowGeo.setAttribute('position', snowAttr)
    // The bounding sphere would be recomputed from a buffer that changes every
    // frame; the box is known and fixed, so frustum culling is simply off. One
    // Points object either way. `snow.frustumCulled = false` below is the whole
    // mechanism: there was a `snowGeo.boundingSphere = null` here as well and it
    // did nothing at all, because null is a BufferGeometry's own default and the
    // field is only ever filled in lazily by the culling test this object never
    // takes.
    const snowMat = new PointsMaterial({
      size: SNOW_SIZE,
      sizeAttenuation: true,
      transparent: true,
      depthWrite: false,
    })
    const snow = new Points(snowGeo, snowMat)
    snow.frustumCulled = false
    snow.renderOrder = 3
    scene.add(snow)
    geometries.push(snowGeo)
    materials.push(snowMat)

    // ── invalidation ──────────────────────────────────────────────────────
    /*
     * Why anything that changes what is on the canvas has to ask for a frame.
     *
     * At `motionIntensity() === 0` this subscriber renders exactly one frame
     * and then returns before rendering on every frame after it — which is the
     * point: a visitor who asked for less motion gets a still scene and the
     * loop gets to park.
     *
     * The cost is that `settled` is a claim about what is currently ON the
     * canvas, and three things falsify it without the loop being able to see
     * any of them. A resize rewrites the drawing buffer, which blanks it. A
     * scaling change (`onDprChange`) is the same thing arriving without a
     * layout change. A theme swap re-reads the palette and nothing has painted
     * with it. `OriginField` learned each of these the hard way; the fix is the
     * same one, and `wake()` in lib/motion.ts exists for it.
     */
    let settled = false
    /** The colour buffer no longer matches `shown` and has to be rebuilt. */
    let dirty = true
    /**
     * The canvas is showing something that is wrong RIGHT NOW — a drawing
     * buffer a resize blanked, a context that just came back, a camera that
     * snapped — so the next frame draws without waiting out SCENE_HZ.
     *
     * Deliberately NOT what a theme cross-fade sets. A fade is smooth motion
     * and belongs under the cap with everything else that moves; treating it as
     * urgent is what used to run the whole 600ms at display refresh.
     */
    let urgent = true
    const invalidate = () => {
      settled = false
      dirty = true
      urgent = true
      wake()
    }

    // ── theme ─────────────────────────────────────────────────────────────
    /*
     * `ThemeProvider` owns the theme and publishes it as `data-theme` on the
     * document element; this watches that attribute rather than consuming the
     * context, and the reason is ordering, not preference. The palette here is
     * resolved from computed custom properties, and those only carry the new
     * theme once the attribute has landed. `ThemeProvider` sets it inside its
     * own `useEffect` — and it is an ancestor of this component, so React runs
     * its effect AFTER this one's. A `useEffect(..., [theme])` here would read
     * the palette one theme late, every time. The attribute cannot.
     *
     * The site's theme change is a 600ms wave, not a cut, so the scene
     * cross-fades between the two palettes instead of swapping them. It also
     * honours the per-element delay `ThemeProvider` stages on every themed
     * element — this canvas is one of them — so the cabin recolours as the wave
     * reaches it rather than ahead of the section around it.
     */
    let fadeK = 1
    let fadeFrom: Palette | null = null
    const themes = new MutationObserver(() => {
      const next = readPalette(section)
      // An unreadable palette mid-session keeps the one already on screen. The
      // alternative is inventing a colour, which rule 2 does not allow.
      if (!next) return
      fadeFrom = { ...shown }
      target = next
      fadeK = -waveDelay(cv) / THEME_FADE
      // the geometry follows at the fade's midpoint; see swapWorld
      pendingHut = document.documentElement.getAttribute('data-theme') === 'light'
      invalidate()
    })
    themes.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

    /** Scratch for the golden `--warm`. One per mount, never per frame. */
    const gold: RGB = [0, 0, 0]
    const applyPalette = (p: Palette) => {
      const span = p.ceil - p.floor
      const arr = bodyColor.array as Float32Array
      for (let i = 0; i < bodyTone.length; i++) {
        const t = p.floor + bodyTone[i] * span
        const ramp = p.ramps[bodyPig[i]] ?? p.ramps[0]
        const at = i * 3
        arr[at] = toLinear(ramp.deep[0] + (ramp.pale[0] - ramp.deep[0]) * t)
        arr[at + 1] = toLinear(ramp.deep[1] + (ramp.pale[1] - ramp.deep[1]) * t)
        arr[at + 2] = toLinear(ramp.deep[2] + (ramp.pale[2] - ramp.deep[2]) * t)
      }
      bodyColor.needsUpdate = true
      // The one warm on this site, made golden on the way in. `WARM_CHROMA`
      // is the site owner's "more golden and fresher light" and it is a
      // saturation on the token, never a second colour.
      goldenWarm(p.warm, gold)
      setLinear(coreMat.color, gold)
      setLinear(softMat.color, gold)
      // The fire is drawn in the same pigment as the windows, and that is the
      // point: --warm is the ONE warm thing on this site, so the hearth, the
      // lanterns and the light coming out of the windows are the same source
      // seen from two sides. Its brightness is a per-theme palette entry
      // (`fire`) and its flicker is the material's opacity; see `flicker`.
      setLinear(fireMat.color, gold)
      // Falling snow has to be seen against BOTH the sky and the cabin. On the
      // night scene that is near-white. On the day scene near-white snow over a
      // near-white sky is invisible, so the flakes sit part way down the ramp:
      // clearly lighter than the walls, clearly darker than the sky.
      const f = p.flake
      if (p.flakeInk) setLinear(snowMat.color, p.flakeInk)
      else
        snowMat.color.setRGB(
          toLinear(p.deep[0] + (p.pale[0] - p.deep[0]) * f),
          toLinear(p.deep[1] + (p.pale[1] - p.deep[1]) * f),
          toLinear(p.deep[2] + (p.pale[2] - p.deep[2]) * f),
        )
      // The two ALPHAS that used to be set here — the snow's and the smoke's —
      // are written in the tick now, because both of them fade with the walk as
      // well as with the theme and this function only runs on a `dirty` frame.
      // Set in both places, the last writer would be whichever ran last, which
      // is `applyPalette` at the bottom of the tick: every theme change would
      // have snapped the snow back to full outdoor opacity for one frame.
      // Smoke, on the same ramp for the same reason and in the other
      // direction: in dark it has to sit clear of a near-black sky, in light
      // it has to sit clear of a near-white one, and one ramp position gives
      // both because the two themes put the sky at opposite ends of it.
      const k = p.smoke
      smokeMat.color.setRGB(
        toLinear(p.deep[0] + (p.pale[0] - p.deep[0]) * k),
        toLinear(p.deep[1] + (p.pale[1] - p.deep[1]) * k),
        toLinear(p.deep[2] + (p.pale[2] - p.deep[2]) * k),
      )
    }

    // ── size ──────────────────────────────────────────────────────────────
    let cssW = 0
    let cssH = 0
    // The BACKING store's size, which is what the same-size guard below
    // compares. Not the CSS box: a dpr change moves these two and leaves the
    // CSS box exactly where it was, so comparing the CSS box would let the one
    // resize that is not a resize through and stop the one that is. `Snow.tsx`'s
    // `fit` states the same pair for the same reason.
    let backW = 0
    let backH = 0
    // What `frameSlice` last handed the camera; see there. `resize` clears it,
    // because a new canvas size is a new answer.
    let framedW = -1
    let framedH = -1
    let framedX = -1
    let framedY = -1
    /**
     * How far the near end of the walk has to back off to keep the cabin in
     * the frame. 1 on anything as wide as the shot was composed for; see
     * `pullFor`.
     */
    let framePull = 1
    const resize = () => {
      const w = cv.clientWidth
      const h = cv.clientHeight
      if (!w || !h) return
      // MAX_DPR is this site's cap, imported from `lib/dpr.ts`, whose note
      // carries the reasoning. The AREA cap below is this component's own, and
      // it is what makes a canvas stretched over a whole tall section
      // survivable — see the mount note in the header.
      let dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
      const area = w * h * dpr * dpr
      // Never below one device pixel per CSS pixel. The floor used to be 0.75,
      // which let a 2560x1440 display at 1x render the room at 0.81 and an
      // ultrawide at 0.75 — facet edges, the window bars and the transom
      // softened on exactly the machines with fill to spare. The cap was
      // written for a canvas over a whole tall section (see MAX_PIXELS); the
      // shipped mount is one viewport, so on a 1x display the cap now only
      // ever stops a ratio ABOVE 1 from being spent, and a 1.5x laptop at
      // 1440x900 still comes down to 1.36 exactly as before.
      if (area > MAX_PIXELS) dpr = Math.max(Math.min(1, dpr), dpr * Math.sqrt(MAX_PIXELS / area))
      const bw = Math.round(w * dpr)
      const bh = Math.round(h * dpr)
      // `setSize` assigns canvas.width and canvas.height unconditionally, and
      // assigning either one BLANKS the drawing buffer whether or not the value
      // changed. A ResizeObserver fires once on observe and again for any box
      // change the layout happens to touch, and `onDprChange` fires for a ratio
      // that moved without the box moving at all — so without this guard a
      // resize that resized nothing throws the painted frame away, and a
      // reduced-motion visitor has no next frame coming to put it back.
      // `Snow.tsx`'s `fit` and `PointCloud.tsx`'s `resize` both hold this line.
      if (bw === backW && bh === backH) return
      backW = bw
      backH = bh
      cssW = w
      cssH = h
      framedW = -1
      renderer.setPixelRatio(dpr)
      renderer.setSize(cssW, cssH, false)
      invalidate()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(cv)
    // A window dragged between two displays with different scaling never moves
    // the canvas's CSS box, so the observer above cannot see it. See lib/dpr.ts.
    const unwatchDpr = onDprChange(resize)

    /**
     * Point the camera at the part of this canvas the reader can actually see.
     *
     * When the canvas is roughly viewport sized this is the identity and the
     * frustum is left alone. When it is much taller — a backdrop stretched over
     * a whole section — the visible slice is made the camera's design frame and
     * the rest of the canvas is rendered as that frustum extended outwards, so
     * the composition stays in front of the reader instead of scrolling off the
     * top of it.
     *
     * **Returns whether the projection actually moved, and that answer is
     * load-bearing.** This used to be called at the BOTTOM of the tick, after
     * the settle gate, on the reasoning that a rect should only be paid for on
     * frames that draw. That is true right up until the frustum is the only
     * thing that changed: on a tall mount a reduced-motion visitor settles, the
     * gate starts returning early, and the view offset is then never recomputed
     * again however far they scroll — the shot they are looking at is composed
     * for a slice they left behind. It never bit the shipped `Stage` mount,
     * because a pin exactly one viewport tall always takes the
     * `clearViewOffset()` branch, and that is precisely what made it invisible
     * and armed.
     *
     * So it runs before the gate now, and the return value keeps the cost
     * honest: a frame where nothing moved writes no projection matrix.
     *
     * The rect is read only when there is spare canvas for the offset to slide
     * along. Below that both spares are zero, the offsets clamp to zero whatever
     * the rect says, and the mount this actually ships with pays nothing for it.
     */
    const frameSlice = (vw: number, vh: number) => {
      const sliceW = Math.min(vw, cssW)
      const sliceH = Math.min(vh, cssH)
      const spareX = cssW - sliceW
      const spareY = cssH - sliceH
      let offX = 0
      let offY = 0
      if (spareX > 0.5 || spareY > 0.5) {
        const rect = cv.getBoundingClientRect()
        offX = Math.max(0, Math.min(spareX, -rect.left))
        offY = Math.max(0, Math.min(spareY, -rect.top))
      }
      if (sliceW === framedW && sliceH === framedH && offX === framedX && offY === framedY) {
        return false
      }
      framedW = sliceW
      framedH = sliceH
      framedX = offX
      framedY = offY
      const aspect = sliceW / Math.max(1, sliceH)
      camera.aspect = aspect
      camera.fov = fovFor(aspect)
      framePull = pullFor(camera.fov, aspect)
      if (offX < 0.5 && offY < 0.5 && spareX < 0.5 && spareY < 0.5) {
        camera.clearViewOffset()
      } else {
        // Negative offsets are the whole trick: they grow the frustum outwards
        // from the slice instead of cropping into it.
        camera.setViewOffset(sliceW, sliceH, -offX, -offY, cssW, cssH)
      }
      camera.updateProjectionMatrix()
      return true
    }


    // ── context loss ──────────────────────────────────────────────────────
    // three.js already prevents the default on `webglcontextlost` and rebuilds
    // its GL state on restore. What it cannot know is that this subscriber
    // should stop asking it to draw in between; without that every frame in the
    // gap is a render into a dead context.
    let alive = true
    const onLost = () => {
      alive = false
    }
    const onRestored = () => {
      alive = true
      invalidate()
    }
    cv.addEventListener('webglcontextlost', onLost)
    cv.addEventListener('webglcontextrestored', onRestored)

    // ── the walk ──────────────────────────────────────────────────────────
    let walk = -1 // < 0 means "not placed yet"; the first frame lands on target
    let prevBoxX = 0
    let prevBoxZ = 0
    let boxed = false
    let pending = 0
    // Scratch for the camera, filled by `shotAt` every drawn frame. Two arrays
    // reused rather than two literals per frame: `motion.ts` keeps one `Frame`
    // object alive for exactly this reason, and this runs in the same loop.
    const eye: V = [0, 0, 0]
    const aim: V = [0, 0, 0]

    const stop = onFrame(({ vh, mi, dt, hold }) => {
      if (!alive || !cssW || !cssH) return
      // The CANVAS's rect. It used to be the section's, and there is no section
      // any more — this is mounted in a `Stage` that is a SIBLING of the three
      // sections the walk wraps. It is also the honest box either way: the pin
      // is what paints, so the pin is what has to be on screen.
      const rect = cv.getBoundingClientRect()

      /*
       * The walk's own progress, handed down rather than measured.
       *
       * `Walk.tsx` computes `-rect.top / (height - vh)` on `.walk`, which is
       * the sticky pin's own travel and therefore exactly the run the camera
       * should follow. This component used to compute `(vh - rect.top) /
       * (vh + height)` on `#origin` — `useSectionProgress`'s measure — and that
       * is the wrong one now for a reason worth stating: it runs over
       * `vh + height` with the element off screen at BOTH ends, so recovering
       * "how far through the pin am I" out of it needs the height and the
       * viewport handed back as well. The pin's travel needs neither.
       */
      const marks = walkRef.current
      const wanted = mi === 0 ? restFor(marks) : clamp01(marks.p)

      // Off screen: no render, no hold. `useOffscreenPause` stamps `data-live`
      // for CSS animations and cannot see an onFrame subscriber, so this
      // subscriber checks for itself. The damped value is synced to its target
      // rather than frozen, exactly as useParallax does — a frozen value is
      // only correct for the scroll position it was frozen at, and re-entering
      // with hundreds of pixels of error means the camera visibly catches up on
      // the first frame anybody can see.
      if (rect.bottom <= 0 || rect.top >= vh) {
        walk = wanted
        boxed = false
        if (fadeFrom) {
          shown = { ...target }
          fadeFrom = null
          fadeK = 1
          dirty = true
        }
        if (pendingHut !== null) {
          swapWorld(pendingHut)
          pendingHut = null
        }
        return
      }
      if (pendingHut !== null && (fadeFrom === null || fadeK >= 0.5)) {
        swapWorld(pendingHut)
        pendingHut = null
      }

      /*
       * Reduced motion SNAPS to a composed rest frame. It does not ease to it.
       *
       * `wanted` is already `restFor(marks)` at mi 0, but the damped `walk`
       * below is not, and letting it converge is a camera gliding across the
       * room over about a second: `motion.ts` wakes the loop for a full second
       * on the media-query change and this tick holds it, so the whole move
       * plays out. The one moment that move would ever happen is the moment
       * somebody standing in the cabin turned "Reduce motion" ON.
       * `hooks/usePointer.ts` states the rule next door and it is the same rule
       * for the same reason: an eased return IS motion, and this is the one
       * time it would ever play.
       *
       * `walk < 0` is the other snap, and always was one: the first frame lands
       * on target rather than flying in from nowhere.
       *
       * Every other time-varying term in this tick already stops dead at mi 0
       * rather than easing. The snow's fall is `fall * step * mi`; its sway is
       * frozen by `t` below; the fire's and the smoke's clocks are held at 0;
       * the window opacities are pure functions of `walk`, so they arrive the
       * moment it does. The theme cross-fade is the single exception and it is
       * deliberate — the note on it says why.
       */
      if (walk < 0 || (mi === 0 && walk !== wanted)) {
        walk = wanted
        // The canvas is still showing where the camera used to be, and under
        // reduced motion there is no next frame coming to fix it.
        settled = false
        urgent = true
      }

      // Frame the slice of the canvas that is actually on screen. Before the
      // gates rather than after them; frameSlice says why, and what it costs on
      // the mount that ships.
      if (frameSlice(window.innerWidth || 1200, vh)) settled = false

      /*
       * Theme cross-fade. It runs under reduced motion too, because the page's
       * own colour transitions do — base.css pauses animations for a
       * reduced-motion visitor, never transitions.
       *
       * The CLOCK advances every frame, because it is measuring --t-theme's
       * 0.6s in real time. The PICTURE changes only on frames that draw, and
       * only once the wave has actually reached this canvas: `fadeK` starts at
       * -waveDelay / THEME_FADE and ThemeProvider's WAVE_SPREAD is 640ms, so
       * for up to that long the clamped mix is still 0 and every frame drawn
       * would be byte-identical to the one already on the canvas.
       *
       * This used to set `dirty` unconditionally for every frame of the fade,
       * which both bypassed SCENE_HZ and re-ran applyPalette's whole colour
       * buffer — 7704 vertices on `high` since the room went in — at display
       * refresh — and on a fast display most of those frames
       * were painting a mix that had not started moving. `holding` keeps the
       * loop alive across the wait without drawing into it; `fading` is what
       * says there is something new to draw.
       */
      const holding = fadeFrom !== null
      if (holding) fadeK += dt / THEME_FADE
      const fading = holding && fadeK > 0

      const converging = Math.abs(wanted - walk) > WALK_EPS
      // Something time-based is actually moving: snow in the air, smoke over
      // the chimney, or the fire on the hearth. These are last frame's flags
      // (they are set further down), which is right — a layer that has just
      // faded out gets one more frame to say so, and a layer that is about to
      // fade in does so on a frame the camera or the theme fade is already
      // holding, since those are the only two things that can change the
      // opacities that decide it. With none of the three visible and the
      // camera settled there is nothing left to draw, and the loop may park.
      const animating = mi > 0 && (snow.visible || smokeMesh.visible || fireMesh.visible)
      if (converging || animating || holding) hold()
      if (!converging && !animating && !fading && settled && !dirty) return

      // 30Hz outside, this section's existing number. A camera on a damped
      // scalar and snow drifting at about a metre a second are both well inside
      // what that reads as, and it is half the GPU work of an uncapped scene
      // sitting behind prose. A scroll that outruns it is absorbed by the
      // damping, which is the other half of why this does not judder on a
      // trackpad.
      //
      // **15Hz once the camera is inside and settled, and that is the one new
      // number in this gate.** Indoors the smoke is off and every flake in the
      // room is parked; what is left moving is the fire, whose fastest term is
      // a 230ms wobble — three and a half frames at 15Hz — and the snow still
      // falling past the two windows, at about a metre a second across a
      // 1.66m opening. Neither is legible at 30 in a way it is not at 15.
      //
      // It matters because indoors is where the reader SLOWS DOWN. The room's
      // creep is 1426px of cards to read over a backdrop that would otherwise
      // repaint thirty times a second for as long as they sit there, and
      // halving that is the difference between a backdrop and a screensaver.
      //
      // **The gate is `converging`, and the creep is now slow enough that it
      // holds.** `WALK_EPS` is 0.0006 of the walk, which is 2.6px of scroll at
      // 1440x900, so a reader who has stopped scrolling settles inside it in
      // about a second whatever leg the camera is on — and the creep's own
      // motion is 0.44mm of camera per pixel of scroll, which is not something
      // 15Hz can be told from 30. While the reader is actually SCROLLING the
      // full rate is back, because a camera move at 15Hz is a move you can
      // count.
      //
      // `urgent` is the bypass, and `dirty` is not. A blanked drawing buffer
      // has to be repainted now; a cross-fade is motion, and motion waits its
      // turn like the rest of the motion in here.
      knotsOf(marks)
      const hz = !converging && !fading && insideness(wanted) > 0.99 ? FIRE_HZ : SCENE_HZ
      pending += dt
      if (pending < 1 / hz && !urgent) return
      const step = pending
      pending = 0

      // The mix itself, on a frame that is actually going to draw it.
      if (fadeFrom && fadeK > 0) {
        if (fadeK >= 1) {
          shown = { ...target }
          fadeFrom = null
          fadeK = 1
        } else {
          const k = fadeK
          shown = lerpPalette(fadeFrom, target, k * k * (3 - 2 * k))
        }
        dirty = true
      }

      // The damped camera. `settle` is `lib/motion.ts`'s per-second lerp — the
      // one settle on this site, so a correction to the rate law cannot land in
      // one file and silently not the others. This comment used to name the
      // sharers ("useParallax and usePointer") and was two short; the count and
      // the list live in `settle`'s own header and nowhere else, because a list
      // kept in five places is the failure the export exists to prevent.
      // Damping is also what stops an opening chapter from snapping the
      // shot: a disclosure growing a section changes where the marks land,
      // which steps the target, and a welded camera would jump on the frame it
      // happens.
      walk += (wanted - walk) * settle(WALK_RATE, step)

      // ── the camera ──────────────────────────────────────────────────────
      // Eight legs, no holds and no stops, all of it in `shotAt`; the eye
      // and the aim come back in two scratch arrays so the tick allocates
      // nothing. TWO narrow-frame corrections are passed rather than read,
      // because they pull opposite ways: `framePull` stands the approach
      // further back so the cabin still fits, and `inPullFor(camera.fov)` moves
      // the interior closer so the paper still fills. See `IN_PULL_MIN`.
      shotAt(walk, framePull, inPullFor(camera.fov), eye, aim)
      const camX = eye[0]
      const camY = eye[1]
      const camZ = eye[2]
      camera.position.set(camX, camY, camZ)
      camera.lookAt(aim[0], aim[1], aim[2])

      // The camera's own screen-right, projected onto the ground. Everything
      // billboarded in this scene takes it: the smoke outside and the flames
      // inside. It used to be derived from the orbit's azimuth as
      // `(cos az, -sin az)`, which is the same vector for a camera that is
      // always aiming at the pivot and is simply wrong for one that turns in
      // a room. Taken from the look direction it is right for both.
      let fwdX = aim[0] - camX
      let fwdZ = aim[2] - camZ
      const fl = Math.hypot(fwdX, fwdZ) || 1
      fwdX /= fl
      fwdZ /= fl
      const rx = -fwdZ
      const rz = fwdX

      // How far in the room has closed round the camera. 0 at the door mouth,
      // 1 by the end of the threshold.
      //
      // It used to drive the fire's opacity as well and now drives only the
      // snow's indoor park below. That split is this pass's: the two things
      // that turn the outdoor half of the scene off and the indoor half on are
      // `openAir` and `hearthLit`, both keyed on the camera's own z, because
      // what a quad on the outside of a wall cares about is the WALL and not
      // the beat. `inside` stays keyed on the knots because the frame-rate gate
      // asks for it before the camera has been placed — see `insideness`.
      const inside = insideness(walk)
      /*
       * And how much OPEN AIR is still between the reader and the front wall,
       * which is a different question with a different answer.
       *
       * `inside` is keyed on the knots, because the frame-rate gate needs it
       * before the camera has been placed. This is keyed on the camera's own z,
       * because the thing it fades is every quad on the OUTSIDE of the front
       * wall and what matters to those is the wall, not the beat.
       *
       * **This layer is a SUBSTITUTE for the room, and a substitute has to be
       * gone before the thing it stands in for arrives.** Every quad in it is a
       * flat warm rectangle on the outside face of the front wall standing
       * where an opening is — and every one of those openings is a hole with
       * the real, lit room behind it. At 12m the substitute is the whole
       * picture: two glowing panes and a bright slot beside a dark leaf, which
       * is what the reference paintings are about and what `in-D-1600.png`
       * gets right. At 2m it is a flat orange sheet over the room it was
       * standing in for.
       *
       * The old ramp ran 0.4 to 3.0 in z, which put it at 0.92 at `ST_DOOR` and
       * still at 0.47 with the camera IN the doorway. Rendered at walk 0.276
       * that is the frame this pass was sent to fix: `r3-D-2400.png`, where the
       * door's own lit quad and its halo cover the right third of the frame in
       * flat tan with a hard vertical edge down each side, over a room that is
       * fully visible behind them. The same measurement finds the two front
       * windows as flat orange rectangles at the arrival, `in-D-2100.png`.
       *
       * 2.35 to 6.5. The whole layer is out by the time the reader is 2.35m off
       * the wall — three metres before the door mouth — and from there in the
       * doorway shows the ROOM, which is now lit well enough to carry it: the
       * fire's own layer takes over on `hearthLit` below, on the same z, in the
       * other direction. At `ST_DOOR` (z = 2.55) this is 0.006 and `hearthLit`
       * is 1.0, so the arrival is lit by the hearth through the opening rather
       * than by a rectangle painted on the wall.
       *
       * The approach is untouched where it matters: at walk 0.10, the frame the
       * owner called the best on the page, the camera is 16.5m out and this is
       * 1.0.
       */
      const openAir = smooth((camZ - 2.35) / 4.15)

      // The windows warm and brighten as the door gets closer, but the FLOOR
      // matters more than the ramp: at the far end of the walk the cabin is a
      // 100px shape in fog, and the one thing that says "somebody is in" is a
      // warm point of light. At 0.16 it was a smudge; at 0.4 it is a lit
      // window seen through weather. The halo keeps its low
      // floor, because a bloom on something that small is just a blur.
      //
      // `openAir` is the new factor on both, and it is not an optimisation
      // dressed as art: every quad in these two layers is on the OUTSIDE face
      // of a wall. From in the room they are back-facing and contribute
      // nothing, so fading them out across the threshold costs no pixel
      // anybody was going to see and takes two draw calls with it.
      const lit = approachLit(walk)
      coreMat.opacity = shown.core * (0.4 + 0.6 * lit) * openAir
      softMat.opacity = shown.halo * (0.12 + 0.88 * lit) * openAir
      // In light `halo` is 0, so this whole layer paints nothing — and a
      // transparent material at opacity 0 is NOT free: three.js still submits
      // it, and this layer is the largest fill in the scene, two pools and a
      // deck that between them cover a good third of the frame at the door,
      // blended per fragment. Skipping the object is one comparison a frame.
      // It cannot flicker on the theme wave either: the fade runs the opacity
      // smoothly to and from 0 and the mesh vanishes at the end of it, where
      // there is nothing left to see.
      softMesh.visible = softMat.opacity > 0.002
      coreMesh.visible = coreMat.opacity > 0.002

      /*
       * The fire, and the mirror image of `openAir`: it is every quad INSIDE
       * the room, and it comes UP on the same approach the window light goes
       * down on.
       *
       * **It is keyed on the camera's z now, not on `inside`.** `inside` is 0
       * at the door mouth and 1 at the end of the threshold, which was right
       * while the doorway had its own painted light: the substitute carried the
       * arrival and the fire took over once the reader was through. With that
       * substitute now gone by 2.35m (see `openAir`), a fire that only starts
       * at the door mouth leaves the last three metres of the approach walking
       * toward a black hole in a lit wall.
       *
       * So it ramps 9.0 to 2.6 in z — full before the reader reaches the porch,
       * out at the far end of the final push-in. Nothing is wasted on it: the
       * front wall is opaque, drawn first, and writes depth, so every fragment
       * of this layer that is not framed by the doorway or a window opening is
       * discarded. What the reader gets for the extra draw call is the fire
       * itself, seen through the door they are walking at.
       *
       * It costs a SIXTH draw call over the last stretch of the approach rather
       * than only across the threshold — about 300px of scroll either side of
       * the door instead of 300 in total. The header's table carries it.
       *
       * The flicker rides on top of the theme's own peak, so light theme turns
       * the hearth DOWN rather than out — see ROLES.
       */
      const hearthLit = 1 - smooth((camZ - 2.6) / 6.4)
      fireMat.opacity = shown.fire * hearthLit * flicker()
      fireMesh.visible = fireMat.opacity > 0.002

      // The fog is the section's own band, and the section under this canvas
      // changes twice across the walk. Ramped from --band-origin to
      // --band-tools over the room beat, which is the stretch where the only
      // exterior left in frame is what shows through a window: a wash that
      // lands on Tools' band is a wash the section below can be faded into,
      // and one that lands on Origin's is a hole. In dark the two bands are
      // #040c19 and #090b13 and in light #ebf0fb and #eceff6, so this is worth
      // about five values — but they are the five that decide the join.
      const bandK = smooth((walk - KNOT[5]) / Math.max(1e-4, KNOT[8] - KNOT[5]))
      const s0 = shown.sky
      const s1 = shown.skyOut
      // Written out rather than through `mixRGB`, which returns a fresh triple:
      // this runs on every drawn frame and the loop is not allowed to make
      // garbage. `applyPalette` can use it because it only runs when `dirty`.
      fog.color.setRGB(
        toLinear(s0[0] + (s1[0] - s0[0]) * bandK),
        toLinear(s0[1] + (s1[1] - s0[1]) * bandK),
        toLinear(s0[2] + (s1[2] - s0[2]) * bandK),
      )
      // And the wash-out, over the window dolly only. See FOG_OUT_NEAR: it is
      // what turns the last frame of the walk from a forest behind three cards
      // into a flat field of the band the next section opens on.
      const washR = KNOT[8] < 1 ? clamp01((walk - KNOT[8]) / (1 - KNOT[8])) : 0
      const washK = smooth((washR - WASH_FROM) / (1 - WASH_FROM))
      fog.near = FOG_NEAR + (FOG_OUT_NEAR - FOG_NEAR) * washK
      fog.far = FOG_FAR + (FOG_OUT_FAR - FOG_FAR) * washK

      // Snow. The box rides the camera; the camera's displacement is taken back
      // out of the flakes so they stay put in the world. It is pushed along the
      // LOOK direction rather than down -z: once the camera turns, "ahead" and
      // "-z" are up to 90 degrees apart, and a box pushed down -z would sit off
      // to one side of the shot with its near edge inside the frame.
      const boxX = camX + fwdX * SNOW_AHEAD
      const boxZ = camZ + fwdZ * SNOW_AHEAD
      const dx = boxed ? boxX - prevBoxX : 0
      const dz = boxed ? boxZ - prevBoxZ : 0
      snow.position.set(boxX, 0, boxZ)
      snowMat.opacity = shown.snowAlpha * (0.34 + 0.66 * openAir)
      snow.visible = snowMat.opacity > 0.002
      // The sway is frozen at mi 0 rather than merely slowed. Left running it
      // would move the flakes sideways on any frame something else forced a
      // redraw — a resize, a theme change — for a visitor who asked for no
      // motion at all. Integrated from drawn frames, not read off the wall
      // clock: see `swayT`.
      if (mi > 0) swayT += step
      else swayT = 0
      const t = swayT
      if (snow.visible) {
        // Only advanced on frames the flakes are actually stepped, so a layer
        // that was skipped cannot come back with a whole gap's worth of
        // displacement to take out of its positions in one frame.
        prevBoxX = boxX
        prevBoxZ = boxZ
        boxed = true
        for (let i = 0; i < flakes; i++) {
          let x = lx[i] - dx
          let z = lz[i] - dz
          if (x > SNOW_HX) x -= SNOW_HX * 2
          else if (x < -SNOW_HX) x += SNOW_HX * 2
          if (z > SNOW_HZ) z -= SNOW_HZ * 2
          else if (z < -SNOW_HZ) z += SNOW_HZ * 2
          lx[i] = x
          lz[i] = z
          let y = ly[i] - fall[i] * step * mi
          if (y < 0) y += SNOW_HY
          ly[i] = y
          const wx = boxX + x + Math.sin(t * 0.6 + phase[i]) * sway[i]
          const wz = boxZ + z + Math.cos(t * 0.45 + phase[i]) * sway[i] * 0.6
          const at = i * 3
          snowPos[at] = wx - boxX
          /*
           * Snow does not fall indoors, and the flake box does not know that.
           * It is 26m by 30m and it rides the camera, so once the camera is in
           * the room a third of the field is inside it — and `depthWrite:
           * false` with the depth TEST on means the walls hide the flakes
           * BEHIND them and not the ones in front.
           *
           * A flake in the room is parked six metres under the floor instead of
           * being skipped, because the buffer is a fixed length and there is no
           * "skip" — and under the floor is the one place in this world that is
           * always occluded: the ground plane is 280m by 230m at y = -0.02 and
           * the camera is always above it, so every ray to y = -6 crosses it
           * first. The flakes OUTSIDE the walls keep falling, which is the
           * whole reason this is a test rather than an opacity: snow going past
           * the west window while the reader is looking at it is most of what
           * makes that window read as a window.
           */
          snowPos[at + 1] = inside > 0.5 && inRoom(wx, wz) ? -6 : y
          snowPos[at + 2] = wz - boxZ
        }
        snowAttr.needsUpdate = true
      }

      // Smoke. The clock advances only while motion is wanted, exactly like
      // the snow's sway two lines up, and for the same reason: a frame forced
      // by a resize or a theme change must not move anything for a visitor who
      // asked for no motion. The layout still runs, because that ONE frame is
      // the whole picture they get.
      //
      // It rides the same `openAir` fade the window light does. The chimney is
      // on the roof and the reader is under it; a plume drawn from inside the
      // room is five transparent quads inside the ceiling.
      smokeMat.opacity = shown.smokeAlpha * openAir
      smokeMesh.visible = smokeMat.opacity > 0.002
      if (mi > 0) smokeT += step
      else smokeT = 0
      if (smokeMesh.visible) layoutSmoke(rx, rz)

      // The fire, on the same rule: one clock, advanced only on drawn frames
      // and only while motion is wanted, and a rest pose at zero that is a real
      // picture rather than an empty buffer. See `flicker`.
      if (mi > 0) fireT += step
      else fireT = 0
      if (fireMesh.visible) layoutFire(rx, rz)

      if (dirty) {
        applyPalette(shown)
        dirty = false
      }
      renderer.render(scene, camera)
      urgent = false
      settled = mi === 0 && !converging && !fading
    })

    return () => {
      stop()
      ro.disconnect()
      unwatchDpr()
      themes.disconnect()
      if (spareTimer) {
        if (typeof cancelIdleCallback === 'function') cancelIdleCallback(spareTimer)
        window.clearTimeout(spareTimer)
      }
      matteMat.map?.dispose()
      cv.removeEventListener('webglcontextlost', onLost)
      cv.removeEventListener('webglcontextrestored', onRestored)
      // A leaked WebGL context on a route change is a real bug: browsers cap
      // the number of live contexts per page and start dropping the oldest,
      // which takes out whatever else on the page happened to own one. So
      // everything goes — every geometry, every material, the renderer, and
      // then the context itself.
      for (const g of geometries) g.dispose()
      for (const m of materials) m.dispose()
      scene.clear()
      renderer.dispose()
      renderer.forceContextLoss()
      // And the element goes with it. A context this has just force-lost can
      // never be un-lost, and `getContext` on the same node hands the dead one
      // back rather than null — which is exactly what turned StrictMode's
      // second setup into a silent TypeError. See the note where it is created.
      cv.remove()
    }
  }, [])

  return (
    <div
      ref={host}
      className={className}
      aria-hidden="true"
      // Not in a stylesheet, because this component does not own one and does
      // not want to depend on the caller having written it: a full-bleed layer
      // that can take a pointer event is a layer that can eat a click on the
      // prose behind it. Decorative means decorative. The canvas inside carries
      // the same declaration; see where it is created.
      style={{ pointerEvents: 'none' }}
    />
  )
}

/* ────────────────────────────────────────────────────────────────────────────
   The walk
   ──────────────────────────────────────────────────────────────────────────*/

/**
 * The walk is an ORBIT, not a dolly. It has to be, because a cabin seen
 * square-on is an elevation drawing: one flat rectangle, no depth cue, and
 * nothing that says the thing is standing in a place rather than pasted on the
 * sky. Two faces is what makes it a solid.
 *
 * So the camera swings on an arc around `LOOK_Z` instead of sliding along a
 * line, and the two ends are stated as an ANGLE and a RADIUS rather than as x
 * and z. That is the whole reason the old `X_FAR` / `X_NEAR` are gone: they
 * described a camera that had drifted 8.5m off axis at 52m out, which is 9
 * degrees — visually square-on, and the reason the far shot read as flat.
 *
 * At AZ_FAR the front wall is foreshortened to 79% and the gable end shows at
 * 61%, which is a proper three-quarter view. At AZ_NEAR the front is 97% and
 * the side is 23% — still angled, never square-on, which is the brief.
 */
const Z_FAR = 52
const Z_NEAR = 13.4
/** Radians off the cabin's front axis; negative puts the camera to the left. */
const AZ_FAR = -0.66
const AZ_NEAR = -0.235
/**
 * The eye, and where it is pointed. These four are the "camera angle a bit
 * lower" the site owner asked for, and the reason the old ones read as a
 * diorama is worth stating, because it is not the number anybody looks at
 * first.
 *
 * Y_NEAR was 2.45 and LOOK_Y_NEAR was 2 — a 2.45m eye is only 70cm over a
 * standing person, so the pitch was fine. What put the reader above the house
 * was the arrival being **level**: at -1.9 degrees of pitch the ridge landed
 * at 0.81 of the frame's half-height, 20% of the frame from the top edge, and
 * the whole building sat in the lower two thirds with the snowfield running
 * up behind it. A roofline against the GROUND is what a model on a table
 * looks like; a roofline against the SKY is what a house looks like. And at
 * 2.45 the eye cleared the porch roof at 3.12, so dark-03-origin is looking
 * down onto its snow cap — the single clearest tell in that shot.
 *
 * So the near end drops to 1.72 (a standing person, measured off nothing more
 * exotic than where eyes are) and the aim goes UP to 2.30, which tilts the
 * camera 2.5 degrees above horizontal. Measured on a 1440x900 slice at the end
 * of the walk: the ridge sits at 0.75 of the half-frame with a quarter of the
 * frame of sky over it, the chimney at 0.77, the door top at 0.09 and its
 * threshold at -0.49 — the house standing in the upper two thirds with the
 * porch, the steps and the light on the snow filling the lower one. The eye
 * is now BELOW the eave at 2.72 for the last third of the walk, so the porch
 * roof is read from underneath, which is what gives the porch depth. That is
 * also what made two holes visible; see `box`'s `floor` and `interior`.
 *
 * The far end comes down with it, 7.4 to 6.2, because the descent has to stay
 * a descent — the reader drops 4.5m over the walk rather than 5, and the far
 * pitch eases from -4.9 degrees to -3.1. Any lower and the opening shot loses
 * the snowfield: at 6.2 the ground enters the frame 16.3m out and runs back to
 * the treeline, and at 4 it would enter at 10 and the bottom of the frame
 * would be sky-coloured fog.
 */
const Y_FAR = 6.2
const Y_NEAR = 1.72
const LOOK_Y_FAR = 3.35
const LOOK_Y_NEAR = 2.3
/**
 * The orbit's pivot, and the point the camera looks at. Between the front wall
 * (z = 0) and the cabin's own centre (z = -3): pivot on the centre and the
 * front wall swings across the frame as the camera comes round, pivot on the
 * wall and the swing reads as the cabin sliding sideways.
 */
const LOOK_Z = -2

/*
 * WALK_IN and WALK_OUT are gone with the section measurement they mapped.
 * `Walk.tsx` hands down the pin's own travel, which already starts where the
 * walk starts and ends where it ends: there is no sub-range left to carve out
 * of it, and a pair of constants that only ever multiplied by 1 would read as
 * a knob somebody could turn.
 */

/**
 * Where the APPROACH rests for a visitor who asked for less motion, in the
 * approach's own 0..1 rather than the walk's. `restFor` is what maps it.
 *
 * Not 0 and not 1. A still of the far end is a speck in fog — the section would
 * look like it failed to load. A still of the near end is a wall of cabin
 * behind seven chapters of prose. At 0.62 the cabin sits whole in the frame
 * with its windows already warm and snow on the ground in front of it: it is
 * the picture the section is about, held still, which is what reduced motion
 * asks for. It is a composition rather than a sample of the animation, and that
 * is the distinction — the identity state here is a *frame that works*, not
 * frame zero.
 *
 * The orbit did not move it, and that is worth a line, because a value tuned
 * against one camera path is exactly the kind of constant that silently stops
 * meaning anything when the path changes. Measured on the new one: 0.62 puts
 * the camera at 17.6m and 16.1 degrees off axis — still a three-quarter view,
 * so the still gets the two faces the move exists to show, rather than the
 * flat elevation the old path's rest pose (5.6 degrees) settled on.
 *
 * Lowering the eye did not move it either, and this time the check was the
 * FRAME rather than the angle, because that is what an eye height changes.
 * At 0.62 the reader stands 2.21m up; the ridge lands at 0.52 of the frame's
 * half-height, the chimney at 0.59 with its whole plume under the top edge,
 * and the cabin spans -0.42 to 0.54 across it. Square in the middle of the
 * shot with room on all four sides, which is the one thing a rest pose has to
 * be.
 */
const WALK_REST = 0.62

/**
 * How fast the camera converges on the scroll's target, as the per-second rate
 * `settle` takes. `settle` itself lives in `lib/motion.ts` beside `clamp01`:
 * there used to be a byte-identical copy of it here, and three more in
 * `useParallax`, `usePointer` and `Hero` — four copies of one rate law, whose
 * difference is only visible above 60Hz, which is to say on somebody else's
 * machine.
 */
const WALK_RATE = 0.14
/** Below this the camera has arrived and the loop is allowed to park. */
const WALK_EPS = 0.0006

const SCENE_HZ = 30
/**
 * The rate once the camera is inside AND has stopped converging — which is
 * the room and the window whenever the reader has stopped scrolling, and
 * therefore most of the time anybody spends looking at this canvas. The gate that picks between the two states its case; this is
 * the number. 15Hz is 66ms between frames and the fire's fastest term is a
 * 230ms wobble, so the flicker is sampled three and a half times per cycle,
 * which is above where a slow brightness change starts to step.
 */
const FIRE_HZ = 15

/* ────────────────────────────────────────────────────────────────────────────
   Framing
   ──────────────────────────────────────────────────────────────────────────*/

/**
 * The scene was composed at this HORIZONTAL field of view, and the vertical one
 * is derived from it. That way round because the cabin's width is what has to
 * stay framed: fix the vertical instead and a tall canvas crushes the shot
 * inwards until the roof leaves the sides of the frame.
 *
 * The clamp is the graceful failure. Past about 1:2 the derived vertical angle
 * runs away and the perspective starts to bend; at that point it stops growing
 * and the horizontal view narrows instead, which is a shot that is merely
 * tighter rather than a shot that is warped.
 */
const H_FOV = 54
const FOV_MIN = 26
const FOV_MAX = 60
function fovFor(aspect: number) {
  const t = Math.tan(((H_FOV * Math.PI) / 180) / 2) / Math.max(0.05, aspect)
  const v = ((2 * Math.atan(t)) * 180) / Math.PI
  return Math.min(FOV_MAX, Math.max(FOV_MIN, v))
}

/**
 * How much the near end of the walk has to back off on a narrow canvas, and
 * why the FOV clamp above is not enough on its own.
 *
 * `fovFor` derives the vertical angle from H_FOV and then CLAMPS it at
 * FOV_MAX. Past that clamp the vertical stops growing and the horizontal
 * narrows instead — which is stated up there as "a shot that is merely
 * tighter". It is, right until the subject fills the frame. Measured on a
 * 390x780 phone slice: the clamp leaves 16.1 degrees of horizontal half-angle
 * against the 27 the scene was composed at, and the cabin's front corners land
 * at +17.7 and -20.3 degrees at the end of the walk — both outside the frame.
 * The reader arrives at the door and the cabin's walls run off the sides.
 *
 * So the shot is framed by the CABIN's width rather than by a fixed distance:
 * a narrower frame stands further back by the ratio of the two half-angles.
 * The exponent is the judgement. At 1 the phone would sit at 23.7m — the
 * cabin fits perfectly and the arrival stops being an arrival. At 0.6 it sits
 * at 18.8m, the widest corner lands at 14.2 degrees inside a 16.1 degree
 * frame, and the shot is still noticeably closer than where it started.
 *
 * Only the NEAR end is scaled. Backing the far end off as well would push it
 * past FOG_FAR, where the cabin is not distant, it is absent.
 *
 * Never below 1: a frame WIDER than the composition (an ultrawide slice, where
 * the FOV_MIN clamp opens the horizontal to 30 degrees) does not get to shove
 * the camera through the porch.
 */
const FRAME_PULL = 0.6
function pullFor(fov: number, aspect: number) {
  const hHalf = Math.atan(Math.tan(((fov * Math.PI) / 180) / 2) * aspect)
  const ref = Math.tan(((H_FOV * Math.PI) / 180) / 2)
  return Math.max(1, Math.pow(ref / Math.max(0.01, Math.tan(hHalf)), FRAME_PULL))
}

/**
 * Fog does two jobs at once here, which is why it is linear and generous. It is
 * the "cold and distant" of the brief — at the far end the cabin is most of the
 * way to the sky colour and reads as a shape in weather — and it is also what
 * hides the far edge of the ground plane, so no geometry ever has to be big
 * enough to reach the horizon.
 *
 * Its colour is --band-origin, the section's own middle band. The section's
 * gradient runs from --band-hero at the top to --band-apps at the bottom, so
 * this is exact through the middle 40% of the section and off by a couple of
 * values at the ends — which is where the cabin never is.
 */
const FOG_NEAR = 12
/**
 * FOG_FAR was 74, and moving it is the one change in this pass that touches
 * the whole picture rather than a corner of it. It is here because a forest in
 * ranks cannot exist behind it.
 *
 * The visible lift of anything above the sky carries a `(1 - fog)` factor —
 * see the tone ladder above — and at 74 that factor is already 0.87 at 66m and
 * 1.0 at 74m. Every rank past the middle distance collapses onto the sky, and
 * the tone ceiling (a tone is clamped at 1) means no amount of pigment can
 * bring it back. Solved from the ladder: four ranks of forest — the far one
 * now standing where the hill band did — need the factor to still be worth
 * 0.45 at 60m, which is FOG_FAR ≈ 100.
 *
 * It also does the thing the owner asked for at the other end of the walk.
 * At 74 the cabin at the start of the approach was 63% dissolved — "a shape in
 * weather", which was the old intent, but it is not "showing the angle of the
 * house". At 100 it is 44% dissolved: still cold, still distant, and now
 * legibly a building seen from the corner.
 *
 * **The ground plane had to grow with it, in the same edit.** The fog's second
 * job is hiding the far edge of that plane, and at 100 the old edge at z = -54
 * would have shown 40% of its own colour from the near camera — a hard
 * horizon line across the shot where the world stops. The plane is one quad,
 * so the fix costs two triangles' worth of nothing: it now reaches 140m, where
 * the fog is total again.
 */
const FOG_FAR = 100
/**
 * ── the wash-out ─────────────────────────────────────────────────────────
 *
 * Where the fog goes over the LAST leg, and it is the other half of the site
 * owner's "getting closer with the scrolls slowly for the small tools section".
 * The dolly ends with the west window overflowing the frame on all four sides,
 * and what is behind it at that point is the forest — dark trunks on lit snow,
 * which is the highest-contrast field anywhere in this scene. Measured against
 * the tools grid's own box on the live DOM at 1440x900, the largest luminance
 * step inside it goes 108 at the arrival to 162 at the end of the push: the one
 * frame in the whole walk where the backdrop fights the cards.
 *
 * So the last leg brings the fog in with the camera. `FOG_NEAR` 12 to 0.35 and
 * `FOG_FAR` 100 to 3.2 puts every tree in the window past the far plane before
 * the pin releases, so the opening fills with flat `--band-tools` — which is
 * exactly the colour `#building` opens on. The frame the reader carries into
 * the next section has nothing in it to cut against, which is what
 * `ST_WINDOW_IN` was composed for and could not do on its own. Re-measured
 * with it, at the same three late samples: 109 at 0.90, 97 at 0.95 and 153 at
 * 0.99, against 109 / 109 / 162 without it. The far half of the outdoors is
 * what it takes; the near trunks a metre outside the glass are inside 3.2m and
 * keep most of their own value, which is why the tail is 153 rather than 24.
 *
 * The interior fogs too — 3.2m reaches the room's own walls — and that is
 * correct rather than collateral: by then the wall is a border a few pixels
 * wide round an opening that is the whole shot, and a border that dissolves
 * into the band is a border that cannot cut.
 */
const FOG_OUT_NEAR = 0.35
const FOG_OUT_FAR = 3.2
/**
 * And where in the dolly it starts. Not at the beginning: the reader spends the
 * whole of #tools looking out of that window, and a fog that begins the moment
 * the beat does would take the forest away over the very stretch it is the
 * subject of. It runs over the last 45% of the leg — about 310px of scroll at
 * 1440x900 — which is where the opening has already overflowed the frame and
 * there is nothing left in the picture that reads as a window anyway.
 *
 * `smooth` on the remapped parameter, so the onset still has zero slope and
 * there is no frame where the fog visibly starts.
 */
const WASH_FROM = 0.55

/**
 * Ceiling on the backing store, in device pixels. 1.5x on a 1440x900 viewport
 * is 2.9M, so the cap already binds there and brings the ratio down to 1.36
 * (an earlier version of this note said 2.9M "clears" 2.4M, which it does
 * not); a canvas stretched over a whole 2400px section would be far past it,
 * and this is what stops that mount from allocating a 40MB buffer and filling
 * it thirty times a second — SCENE_HZ, which is the rate this file actually
 * runs at. The cap never takes a 1x display below native: `resize` says why.
 */
const MAX_PIXELS = 2_400_000

/* ────────────────────────────────────────────────────────────────────────────
   Budget
   ──────────────────────────────────────────────────────────────────────────*/

type Quality = {
  /** How many of `TREES` get built, best composition first. */
  trees: number
  /** How many of `TRUNKS` — the near wall trees — get built. Same rule. */
  trunks: number
  /** Teeth in the nearest treeline rank; the outer ranks scale off it, RANK_N. */
  teeth: number
  /** How many of `RANK_R` are drawn at all. */
  ranks: number
  stones: number
  weeds: number
  /** Log butts per corner, and how many of the three visible corners get them. */
  logs: number
  corners: number
  /** Footprints down the path. Also sets how finely the path itself is cut. */
  prints: number
  flakes: number
  /** Chimney smoke puffs. */
  puffs: number
  patchX: number
  patchZ: number
  /** Nudges every tree rank's segment count together. See `RANKS`. */
  cone: number
  /**
   * How much of the OPTIONAL interior gets built. 0 is the room — floor,
   * ceiling, all four walls cut round their openings, the fireplace and its
   * firebox, the log bed, the table, the paper, the desk, the chair and its
   * blanket, the woodpile, the window sill, the kettle and the rug — everything
   * the shot is composed on and everything the fire lights, and `low` gets all
   * of it, because `low` is a phone and a phone spends the same five viewports
   * in that room as a desktop does. 1 adds the floorboards, the west window's
   * reveals, the second beam, the dresser, the shelf and what is on it, and the
   * books, and is what both other tiers get: `mid` and `high` differ in FOREST,
   * which is where the two of them differ in everything else too.
   *
   * 438 triangles against 522, so the gate is worth 84 — an eighth of the room
   * and 6% of `low`'s whole scene. It is deliberately the smallest gate in this
   * table: the room is the subject for three fifths of the walk, and the two
   * settled beats have a legibility requirement riding on them that does not
   * get cheaper on a phone.
   *
   * Nothing in the interior is a COUNT of something cheap the way the forest
   * is, so there is nothing here to scale smoothly. It is a subject rather
   * than a texture, and the budget note says what that costs.
   */
  room: number
  aa: boolean
}

/**
 * Same shape as PointCloud's `pointBudget`: cores and viewport width, because
 * those are the two things a browser will actually tell you about a machine.
 * The cabin barely changes — it is the thing being looked at, and only its log
 * corners scale — so what moves is the size of the forest, the resolution of
 * the snow field, how much is lying on the ground, and whether the driver is
 * asked for multisampling.
 *
 * The per-section counts and what this pass added to them are in the file
 * header, which is where the budget lives; this table is what each tier BUYS.
 *
 * The shape of it is the budget policy. Everything that scales is a COUNT of
 * something cheap rather than detail on something expensive — a far tree is one
 * triangle, a weed is one, a rock is four — and the two things that do NOT
 * scale are the cabin and the room, because both are the subject and a subject
 * cannot be cheap. `low` spends 29% of itself on the interior — 438 of 1513,
 * the same fraction it spent before the room was rebuilt — and gets every prop
 * the shot is composed on and every surface the fire lights; what it gives up
 * is `room: 0`, which is the floorboards, the west window's reveals, the second
 * beam, the dresser, the shelf and the books. See `Quality.room`.
 *
 * `patchX` / `patchZ` grew by about 20% in each axis in this pass and that is
 * the largest single line of the growth outdoors: the renders said the snow was
 * reading as a flat pale grey field, and half the fix was more facets on it.
 * The other half spends tone rather than triangles — see `snowTone`.
 */
const TIERS: Record<'low' | 'mid' | 'high', Quality> = {
  low: { trees: 11, trunks: 2, teeth: 16, ranks: 3, stones: 3, weeds: 4, logs: 4, corners: 2, prints: 5, puffs: 3, flakes: 200, patchX: 9, patchZ: 7, cone: 4, room: 0, aa: false },
  mid: { trees: 20, trunks: 3, teeth: 24, ranks: 3, stones: 5, weeds: 8, logs: 5, corners: 3, prints: 8, puffs: 4, flakes: 420, patchX: 13, patchZ: 10, cone: 5, room: 1, aa: true },
  high: { trees: 30, trunks: 4, teeth: 32, ranks: 3, stones: 8, weeds: 12, logs: 6, corners: 3, prints: 12, puffs: 5, flakes: 640, patchX: 16, patchZ: 12, cone: 6, room: 1, aa: true },
}

/**
 * No `typeof window === 'undefined'` guard. There was one, returning 'mid', and
 * it could not fire: this is called from inside the effect, effects do not run
 * on a server, and the module is only reached at all through Origin's
 * `React.lazy` behind a flag an IntersectionObserver sets in a browser. A branch
 * that cannot be taken is a claim the file makes about itself that is not true.
 * (`hero/PointCloud.tsx`'s `pointBudget` still carries the same unreachable
 * guard; it is not this file's to remove.)
 */
function tierOf(): 'low' | 'mid' | 'high' {
  const cores = navigator.hardwareConcurrency ?? 4
  if (cores <= 4 || window.innerWidth < 760) return 'low'
  if (cores <= 8) return 'mid'
  return 'high'
}

/* ────────────────────────────────────────────────────────────────────────────
   Palette
   ──────────────────────────────────────────────────────────────────────────*/

type RGB = [number, number, number]

type Palette = {
  /** The theme's near-white: fresh snow, and the top of the tone ramp. */
  pale: RGB
  /** The theme's shadow: the bottom of the tone ramp. */
  deep: RGB
  /** What distance dissolves into while the reader is outside: Origin's band. */
  sky: RGB
  /** And what it dissolves into by the end of the walk: Tools' band. */
  skyOut: RGB
  /** Window light, hearth light, lamplight. One warm on this site. */
  warm: RGB
  /** The ends of the tone ramp, per theme. See ROLES. */
  floor: number
  ceil: number
  /** How far up the ramp a falling flake sits. */
  flake: number
  snowAlpha: number
  /** Same, for chimney smoke, which is lit by the sky and not by the fire. */
  smoke: number
  smokeAlpha: number
  /** Peak opacity of the lit openings and of their bloom. */
  core: number
  halo: number
  /** Peak opacity of the hearth, its light in the room, and the two lanterns. */
  fire: number
  /** One two-token ramp per pigment class, indexed by PIG_*. In dark all six
   *  alias the base ramp; see the tokens' own note. */
  ramps: { deep: RGB; pale: RGB }[]
  /** The in-scene flakes' own ink, when the theme has one (petals, by day);
   *  null means "a step up the base ramp", which is snow. */
  flakeInk: RGB | null
}

/**
 * The two themes, and why they are not each other with the lights turned down.
 *
 * **Dark** is the scene the brief describes: night, a near-black sky, the cabin
 * a slate silhouette a few steps up from it, moonlit snow, and windows that are
 * the brightest thing on the screen. The ramp is capped at 0.55 rather than run
 * to the top — snow at full --text behind seven chapters of prose is a glare,
 * and moonlit snow is not white anyway.
 *
 * **Light is a different picture, not that one dimmed.** A dark snowy night on
 * a near-white page is simply wrong; the page around this section is #eef0f6.
 * So light is the same geometry as a bright overcast day. The ramp starts at
 * 0.26 instead of 0 — an overcast sky is a huge soft source and it fills every
 * shadow, so the tonal range compresses and nothing in the scene is ever
 * properly dark. Snow runs to --surface, which is barely a step off the sky it
 * sits under, and that is correct: on an overcast day a snowfield and the sky
 * are nearly the same value and the cabin and the trees carry all the contrast.
 * It is also exactly how the parallax kit's own light artwork is drawn, as
 * cut-outs on white.
 *
 * **And in light the house lights are OFF.** That is the site owner's call and
 * it is the right one: a lit pane, a spill through the door and two warm pools
 * on the snow are the picture of a house at NIGHT, and drawn over a daylit
 * scene they read as a mistake rather than as atmosphere — L-y1900.png caught
 * them as two orange rectangles on a grey building. `halo` at 0 takes the wall
 * bloom, the deck pool and every pool on the snow with it in one number,
 * because all of them live on `softMat` and its opacity IS `halo` times the
 * walk's ramp.
 *
 * `core` is deliberately not 0. At 0.15 over the interior's own T_DOOR the
 * panes come out a step warmer than the shadow behind them, which is what a
 * window with a room behind it looks like from outside on an overcast day.
 * Taking it to 0 leaves four flat dark holes in the wall, which is a different
 * wrong picture rather than no picture — see the brief's "or down to a faint
 * interior tint".
 *
 * **None of that is a switch.** Both numbers are palette entries, so
 * `lerpPalette` cross-fades them over THEME_FADE with every other pigment here,
 * behind the same `--wave-delay` the rest of the page rides: the lights go
 * DOWN as the theme wave crosses this canvas rather than snapping out in the
 * middle of a scene that is otherwise dissolving. The theme note in the effect
 * is the mechanism; this is the only place that decides what it fades TO.
 *
 * Every entry is a token name. There is no colour in this file.
 */
/** The six classes' token pairs, per theme. Order is PIG_BASE … PIG_SAND. */
const RAMP_TOKENS = {
  dark: [
    ['--scene-deep', '--scene-pale'],
    ['--scene-leaf-deep', '--scene-leaf-pale'],
    ['--scene-wood-deep', '--scene-wood-pale'],
    ['--scene-water-deep', '--scene-water-pale'],
    ['--scene-thatch-deep', '--scene-thatch-pale'],
    ['--scene-sand-deep', '--scene-sand-pale'],
  ],
  light: [
    ['--scene-deep', '--scene-pale'],
    ['--scene-leaf-deep', '--scene-leaf-pale'],
    ['--scene-wood-deep', '--scene-wood-pale'],
    ['--scene-water-deep', '--scene-water-pale'],
    ['--scene-thatch-deep', '--scene-thatch-pale'],
    ['--scene-sand-deep', '--scene-sand-pale'],
  ],
} as const

const ROLES = {
  dark: {
    pale: '--text',
    deep: '--band-origin',
    flakeInk: null as string | null,
    sky: '--band-origin',
    skyOut: '--band-tools',
    warm: '--warm',
    floor: 0.03,
    ceil: 0.55,
    flake: 1,
    snowAlpha: 0.8,
    smoke: 0.5,
    smokeAlpha: 0.42,
    core: 0.95,
    halo: 1,
    fire: 1,
  },
  light: {
    /*
     * Cebu. The base ramp is the hut's own tokens now (a sand-white and a
     * sea-shadow slate) rather than the page's surface and accent, because
     * the page's accent is a deep teal and a teal-shadowed room read as
     * underwater. The five other classes are read from RAMP_TOKENS.
     */
    pale: '--scene-pale',
    deep: '--scene-deep',
    /* petals, not snow: the near flakes share this token with scene/Snow.tsx */
    flakeInk: '--flake-ink' as string | null,
    sky: '--band-origin',
    skyOut: '--band-tools',
    warm: '--warm',
    /* ── 0.26 -> 0.06, and the ceiling down with it ─────────────────────
       `t = floor + tone * (ceil - floor)` is where every vertex lands on its
       own class's deep->pale ramp, so a floor of 0.26 means NOTHING in the
       scene is ever more than three quarters of the way from its shadow
       colour — the darkest facet of the thatch was already a quarter of the
       way to sunlight before the light hit it. Rendered, the whole hut came
       out as one pale wash with the roof, the walls, the deck and the sand
       within a few points of each other, which is the second half of the site
       owner's "the Hut's colors are wrong as well and are even grey": the
       first half was the base ramp (tokens.css), and this is why even the
       classes with warm ramps had no colour in them.

       0.06 gives the shadows their pigment back, and the ceiling comes off 1
       for the matching reason at the other end: at exactly 1 every lit facet
       resolves to the ramp's pale token and the sunlit side of the roof was
       the same near-white as the sand beside it. 0.94 keeps a step of thatch
       in the brightest facet.

       It stays a DAY: 0.06..0.94 of a ramp whose pale end is #f0cd82 for the
       roof and #fffaf0 for the sand is a bright scene with shading in it,
       which is what dark's own 0.03..0.55 is at the other end of the page. */
    floor: 0.06,
    ceil: 0.94,
    flake: 0.72,
    snowAlpha: 0.78,
    smoke: 0.72,
    /* no chimney on a nipa hut, so no smoke */
    smokeAlpha: 0,
    // Daytime. The house is not lit; see the note above for what each of these
    // two numbers switches off and why `core` is a tint rather than a zero.
    core: 0.15,
    halo: 0,
    /*
     * **The hearth goes DOWN in light, and it does not go out.** The rule that
     * takes `halo` to 0 above is about the house seen from OUTSIDE — a spill on
     * the snow and two lit panes at midday read as a mistake. Inside a cabin in
     * daylight there is still a fire, and a dead black hearth in the middle of
     * the shot reads as a mistake of the other kind. It goes quiet at 0.42 and
     * the two windows carry the light instead, which is what a room actually
     * looks like on an overcast morning: you can see the flames and you cannot
     * see what they are lighting.
     *
     * 0.42 rather than something lower because light's tone ramp starts at 0.26
     * and runs to 1 — the room is PALE in this theme, and warm over pale is a
     * far weaker read than warm over near-black. The same alpha does about a
     * third as much work here as it does in dark.
     */
    fire: 0.55,
  },
} as const

/**
 * Parse a token's computed value.
 *
 * Custom properties compute to their token stream, not to a resolved colour, so
 * this has to read both of the forms tokens.css actually writes: `#rrggbb` and
 * `rgba(r, g, b, a)`. Alpha is dropped on purpose — these are used as pigments
 * in a scene rather than as washes over a surface, and the one token whose
 * alpha matters (--surface, which is a 4.5% white wash in dark) is only ever
 * read in light, where it is opaque.
 *
 * Returns null rather than a fallback. A fallback is a colour, and rule 2 does
 * not have an exemption for the ones you only meant to use in an emergency; a
 * scene that declines to draw is a better answer than a scene drawn in colours
 * this site never chose.
 */
function parseColor(raw: string): RGB | null {
  const v = raw.trim()
  if (!v) return null
  const hex = v.match(/^#([0-9a-f]{3,8})$/i)
  if (hex) {
    const h = hex[1]
    if (h.length === 3 || h.length === 4) {
      return [
        parseInt(h[0] + h[0], 16) / 255,
        parseInt(h[1] + h[1], 16) / 255,
        parseInt(h[2] + h[2], 16) / 255,
      ]
    }
    if (h.length === 6 || h.length === 8) {
      return [
        parseInt(h.slice(0, 2), 16) / 255,
        parseInt(h.slice(2, 4), 16) / 255,
        parseInt(h.slice(4, 6), 16) / 255,
      ]
    }
    return null
  }
  const fn = v.match(/^rgba?\(\s*([\d.]+)[,\s/]+([\d.]+)[,\s/]+([\d.]+)/i)
  if (fn) return [Number(fn[1]) / 255, Number(fn[2]) / 255, Number(fn[3]) / 255]
  return null
}

function readPalette(section: Element): Palette | null {
  const light = document.documentElement.getAttribute('data-theme') === 'light'
  const role = light ? ROLES.light : ROLES.dark
  const cs = getComputedStyle(section)
  const pale = parseColor(cs.getPropertyValue(role.pale))
  const deep = parseColor(cs.getPropertyValue(role.deep))
  const sky = parseColor(cs.getPropertyValue(role.sky))
  const skyOut = parseColor(cs.getPropertyValue(role.skyOut))
  const warm = parseColor(cs.getPropertyValue(role.warm))
  if (!pale || !deep || !sky || !skyOut || !warm) return null
  const ramps: { deep: RGB; pale: RGB }[] = []
  for (const [deepName, paleName] of RAMP_TOKENS[light ? 'light' : 'dark']) {
    const d = parseColor(cs.getPropertyValue(deepName))
    const p = parseColor(cs.getPropertyValue(paleName))
    if (!d || !p) return null
    ramps.push({ deep: d, pale: p })
  }
  const flakeInk = role.flakeInk ? parseColor(cs.getPropertyValue(role.flakeInk)) : null
  return {
    pale,
    deep,
    sky,
    skyOut,
    warm,
    ramps,
    flakeInk,
    floor: role.floor,
    ceil: role.ceil,
    flake: role.flake,
    snowAlpha: role.snowAlpha,
    smoke: role.smoke,
    smokeAlpha: role.smokeAlpha,
    core: role.core,
    halo: role.halo,
    fire: role.fire,
  }
}

/**
 * `--warm`, pushed away from its own grey by `WARM_CHROMA` and written into a
 * caller's triple. See `WARM_CHROMA` for the whole argument and the numbers.
 *
 * The luma is computed from the pigment handed in rather than written down,
 * so this follows `--warm` if the token is ever re-chosen, and it follows the
 * THEME CROSS-FADE too: `lerpPalette` mixes the two themes' warms and this
 * runs on the result, so there is no frame where the fire is a hue neither
 * theme has. Clamped at 1 because gold is the warm pigment with its red
 * channel full, and the clamp is what puts it there.
 *
 * It writes into a caller's array because `applyPalette` is the only caller
 * and this file's loop is not allowed to make garbage — the same contract the
 * two camera scratch vectors have.
 */
function goldenWarm(c: RGB, out: RGB) {
  const l = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
  for (let i = 0; i < 3; i++) out[i] = Math.min(1, Math.max(0, l + (c[i] - l) * WARM_CHROMA))
}

const mixRGB = (a: RGB, b: RGB, k: number): RGB => [
  a[0] + (b[0] - a[0]) * k,
  a[1] + (b[1] - a[1]) * k,
  a[2] + (b[2] - a[2]) * k,
]

function lerpPalette(a: Palette, b: Palette, k: number): Palette {
  const n = (x: number, y: number) => x + (y - x) * k
  return {
    pale: mixRGB(a.pale, b.pale, k),
    deep: mixRGB(a.deep, b.deep, k),
    sky: mixRGB(a.sky, b.sky, k),
    skyOut: mixRGB(a.skyOut, b.skyOut, k),
    warm: mixRGB(a.warm, b.warm, k),
    floor: n(a.floor, b.floor),
    ceil: n(a.ceil, b.ceil),
    flake: n(a.flake, b.flake),
    snowAlpha: n(a.snowAlpha, b.snowAlpha),
    smoke: n(a.smoke, b.smoke),
    smokeAlpha: n(a.smokeAlpha, b.smokeAlpha),
    core: n(a.core, b.core),
    halo: n(a.halo, b.halo),
    fire: n(a.fire, b.fire),
    ramps: a.ramps.map((ra, i) => ({
      deep: mixRGB(ra.deep, b.ramps[i].deep, k),
      pale: mixRGB(ra.pale, b.ramps[i].pale, k),
    })),
    flakeInk: a.flakeInk && b.flakeInk ? mixRGB(a.flakeInk, b.flakeInk, k) : k < 0.5 ? a.flakeInk : b.flakeInk,
  }
}

/** How long the scene takes to cross-fade, matching --t-theme's 0.6s. */
const THEME_FADE = 0.6

/** The delay ThemeProvider staged on this element, in seconds. */
function waveDelay(el: Element): number {
  const raw = getComputedStyle(el).getPropertyValue('--wave-delay').trim()
  if (!raw) return 0
  const n = parseFloat(raw)
  if (!Number.isFinite(n)) return 0
  return raw.endsWith('ms') ? n / 1000 : n
}

/**
 * sRGB to linear. Every mix above happens in sRGB, on purpose: that is the
 * space `color-mix(in srgb, ...)` works in, and --seam-fill is the site's own
 * precedent for stepping a band toward its ink. Mixing here the way the
 * stylesheet mixes there means the two agree. The conversion happens once, on
 * the way into the buffer, because three.js's colour management expects vertex
 * colours and material colours in the linear working space.
 */
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
const setLinear = (target: Color, c: RGB) =>
  target.setRGB(toLinear(c[0]), toLinear(c[1]), toLinear(c[2]))

/* ────────────────────────────────────────────────────────────────────────────
   Geometry
   ──────────────────────────────────────────────────────────────────────────*/

type V = [number, number, number]
/**
 * The world under construction. `hearth` is a BUILD-TIME switch, not runtime
 * state: `buildWorld` turns it on around the block that emits the room and off
 * again afterwards, and every triangle emitted while it is on gets the fire's
 * baked contribution added to its tone. See `hearthAt`.
 *
 * It lives on the solid rather than in a module-level `let` because there is
 * exactly one solid being built at a time and this way that is enforced by the
 * shape of the thing instead of by nobody having made the mistake yet. It rides
 * as a seventh argument to `tri` in all but name, without threading a seventh
 * argument through `quad`, `box`, `panel`, `post`, `stone` and `tooth`.
 */
/*
 * ── pigment classes, and why a monochrome scene grew them ─────────────────
 * The cabin is one tone ramp between two tokens — moonlit snow does not need
 * more. The Cebu hut does: a palm is green, a thatch roof is straw, the sea
 * is the sea, and one ramp from sand-white to sea-ink cannot say any of it.
 * So every vertex carries a CLASS beside its tone, and `applyPalette` picks
 * that class's own two-token ramp. The winter world sets no class at all
 * (every vertex is PIG_BASE), and in dark every class's ramp aliases the base
 * ramp in tokens.css — so the night scene is byte-for-byte what it was.
 */
const PIG_BASE = 0
const PIG_LEAF = 1
const PIG_WOOD = 2
const PIG_WATER = 3
const PIG_THATCH = 4
const PIG_SAND = 5
type Solid = {
  pos: number[]
  tone: number[]
  pig: number[]
  hearth: boolean
  /** the class every triangle pushed from now on carries */
  pigment: number
  /** building the Cebu hut rather than the cabin */
  hut: boolean
}

/**
 * The one light this scene has, and it is baked.
 *
 * Nothing here is lit at runtime: every triangle carries a tone that was
 * decided when the geometry was built, from its own normal against this
 * direction. That is what makes it a flat, chunky, faceted object rather than a
 * smoothly shaded one — the same three-or-four-steps-of-one-colour look the
 * parallax kit's pines and ridges have — and it is also why the whole world is
 * a single MeshBasicMaterial with no lights in the scene at all.
 *
 * The floor is what an up-facing surface keeps when it is turned away: a night
 * scene under snow has a huge amount of bounce, so nothing goes to black.
 */
const LIGHT: V = norm([-0.42, 0.86, 0.3])
const SHADE_FLOOR = 0.55

/**
 * Base tones, before the theme's ramp. These are the scene's tone design.
 *
 * The four TREE tones are a rank ladder and they are the thing that carries
 * depth in this scene, so they are worth reading together. Fog alone cannot do
 * it: the sky is the DEEP end of the ramp in dark, so fog pulls a distant tree
 * DOWN toward near-black rather than up toward pale, which is the opposite of
 * what the reference paintings do. The ladder is what puts it back — a far
 * rank starts high enough up the ramp that it still lands above the near ranks
 * once the fog has had its share.
 *
 * T_TRACK and T_PRINT are trodden snow. Snow that has been walked on is packed
 * and shadowed and it is NOT the same value as the field beside it; a path
 * drawn at T_SNOW is a path you cannot see.
 */
const T_SNOW = 0.94
/**
 * Snow with something standing over it. Trees, and the cabin's own bulk, laid
 * on the patch as a per-cell tone rather than as geometry — see `snowTone`.
 *
 * 0.52 and was 0.62. A tree's shadow on snow is the strongest tonal event in a
 * winter landscape and at 0.62 it was 21 values below open snow in dark, which
 * is a stain rather than a shadow. At 0.52 it is 34.
 *
 * It is deliberately still well above `T_WALL` at 0.46. The deepest shade on
 * the ground must not reach the value of the building standing on it, or the
 * cabin stops being the darkest mass in the frame and the silhouette the whole
 * exterior is composed around goes soft.
 */
const T_SHADE = 0.52
const T_TRACK = 0.85
const T_PRINT = 0.68
const T_WALL = 0.46
const T_TRIM = 0.34
const T_STONE = 0.3
const T_ROOF = 0.24
const T_DOOR = 0.19
const T_WEED = 0.14
/**
 * ── the room's own ladder ─────────────────────────────────────────────────
 *
 * Everything indoors is read against the paper, and the paper is read against
 * the cards standing on it, so this ladder is solved from the top down rather
 * than from the bottom up like the forest's.
 *
 * `T_PAPER` is the only large flat field in the room and it has to be the
 * brightest thing in frame that is not the fire. Every up-facing surface takes
 * `tri`'s full lit tone (`LIGHT` is 0.855 of the way up-facing), so a paper at
 * 0.70 lands at an effective 0.654 — measured through the dark ramp, rgb
 * (92, 97, 106), against the table top's (37, 44, 55) underneath it.
 *
 * **It is 0.70 and not 0.78 because of the CARDS, not because of the room.**
 * At 0.78 the paper is rgb (101, 106, 115), and the fire's own wash lifts the
 * middle of the frame to (114, 115, 117) — where `--text` at #f2f2f5 lands at
 * 4.27:1, which is under the 4.5:1 floor. At 0.70 the same measurement is
 * (105, 106, 109) and 4.9:1, which clears it. **That is not a licence to skip
 * the scrims**: a heading over a backdrop is still a heading over a backdrop,
 * and the brief asks for them. It is the margin the scrims get to work with.
 *
 * `T_HEARTH` is nearly zero on purpose. The inside of a firebox is the darkest
 * thing in any room with a fire in it, and the flames have to be seen against
 * something — a firebox at wall tone is a warm rectangle rather than a fire.
 *
 * **Everything below the paper dropped by roughly half in this pass, and the
 * reason is that the fire had nowhere to fall to.** The old ladder put the
 * floor at 0.26, the walls at 0.30 and the table at 0.22, which through the
 * dark ramp is rgb green 39, 43 and 43 — a nine-value spread for the entire
 * room, with the hearth's near-constant old boost sitting flat on top of it.
 * Measured off `in-D-2700.png`, the floor in front of the fire was (28,34,46)
 * and the brightest thing that was not the fire was (67,64,63): a room made of
 * one value, which is what "the room is not cozy, it is grey" describes.
 *
 * The fix is a light source with a real falloff (see `HEARTH_FALL`) standing
 * over a ladder low enough that its far end is genuinely dark. Through the
 * dark ramp, where `g` is the green channel the buffer actually produces:
 *
 * ```
 *                       base   facet    +fire      g dark    g light
 *   ceiling             0.10    0.55   0 .. 0.30   26 .. 62  129 .. 169
 *   floor               0.11    0.93   0 .. 0.39   31 .. 78  135 .. 187
 *   wall, west          0.26    0.55   0 .. 0.33   36 .. 75  140 .. 184
 *   wall, north / east  0.26    0.68   0 .. 0.30   40 .. 76  145 .. 185
 *   table, rug          0.15    0.93   0 .. 0.20   36 .. 60  139 .. 166
 *   joinery             0.19    0.68   0 .. 0.34   34 .. 75  138 .. 184
 *   paper               0.70    0.93   0            97       208
 *   second sheet        0.645   0.93   0            90       202
 *   sheet's shadow      0.055   0.93   0            17       142
 *   firebox             0.04    0.55   exempt        22      124
 * ```
 *
 * The two new rows are the table beat's, and they are the only pair in this
 * ladder solved against something OUTSIDE the room: the second sheet has to be
 * far enough off the paper to read and near enough that its edge can cross a
 * card, and the shadow has to be below the table so a sheet lying on one is not
 * a sheet printed on one. `T_SHEET`'s own note has both arguments.
 *
 * Five separated fields where there was one, and the fire's own range across
 * each of them is wider than the whole room used to be. `T_LOG` is the log bed
 * IN the fire and it is the one solid allowed to sit between the firebox and
 * the flames; `T_TIMBER` is indoor joinery — the mantel, the reveals, the
 * shelf, the dresser, the woodpile — which used `T_TRIM` at 0.34 and came out
 * as the second brightest field in the room after the paper.
 *
 * None of these needs a second set for light. The ramp's two ends swap roles
 * between themes and everything indoors recedes correctly in both for the same
 * reason the forest does; see the note on `T_TREE`. The right-hand column
 * above is that claim checked rather than asserted: light is a PALE room with
 * the same shadows, 129 to 187 against a page at 235.
 */
const T_PAPER = 0.7
/**
 * The second sheet, and the shadow the sheets lie in.
 *
 * Both are here because the beat over this table rendered as one flat field and
 * the brief's answer to that is "the paper should read as paper — a sheet with
 * edges, a slight warp, a shadow under it, more than one sheet if that helps,
 * at very low contrast". The last four words are the constraint that sets these
 * two numbers, and they are set from the RENDER rather than from taste.
 *
 * `T_SHEET` is 0.055 under `T_PAPER`, which through the two ramps is 7 values
 * of green in dark (97 -> 90) and 6 in light (208 -> 202). That is a sheet edge
 * a reader sees and a card's text does not have to fight: the site's own
 * contrast floor is 4.5:1 against `--text`, and 7 values at this end of the
 * ramp move that ratio by 0.15. It is the one edge in this arrangement allowed
 * to cross the card area at all — see `sheet` for where every other one is put.
 *
 * `T_SHADOW` is BELOW the table it lies on, which nothing else in the room is.
 * A sheet whose edge meets the table at the table's own value is a sheet
 * printed on the table; the band is what puts it on top of one. 0.055 against
 * `T_TABLE`'s 0.15 is 19 values under the table in dark and 10 in light, and
 * every millimetre of it is outside the card box — it runs along the sheet's
 * north and east edges only, which is where `LIGHT` puts a shadow and which is
 * the frame's right margin and its bottom respectively.
 */
const T_SHEET = 0.645
const T_SHADOW = 0.055
const T_ROOM = 0.26
const T_FLOOR = 0.11
const T_CEIL = 0.1
const T_RUG = 0.3
const T_TABLE = 0.15
const T_TIMBER = 0.19
const T_BEAM = 0.09
const T_LOG = 0.055
const T_HEARTH = 0.04
/**
 * Near / mid / far / farthest / horizon, palest last, and the numbers are
 * derived rather than picked. `tri` scales each by its own facet's light, and
 * then the fog mixes the result back toward the sky, so what the eye finally
 * gets is
 *
 *     lift above the sky  =  (floor + toneEffective * span) * (pale - sky) * (1 - fog)
 *
 * A ladder that ignores the `(1 - fog)` term is not a ladder: at the old
 * spacing the mid rank came out at 20 against the near rank's 22 and the two
 * were indistinguishable. Measured on the dark theme's green channel at each
 * rank's typical distance from the near camera, these give 17 / 22 / 32 / 38,
 * with the top rung at 47 — five separations that hold.
 *
 * T_TREE_HAZE is that top rung, and it was called T_HILL until this pass. The
 * VALUE has not moved by a thousandth; what changed is what wears it. The hill
 * band it was named for is gone and the outermost tooth rank stands at its
 * radius instead, so the ladder is unchanged and the name is now true. See
 * RANK_R.
 *
 * The same numbers work in light for a reason that is worth stating, because
 * it looks like luck: light's sky sits near the PALE end of its own ramp, so
 * the identical fog mix that lifts a distant thing off a near-black sky sinks
 * it toward a near-white one. Recession comes out of the fog in both themes
 * without a second set of tones.
 */
const T_TREE = 0.13
const T_TREE_MID = 0.26
const T_TREE_FAR = 0.46
const T_TREE_RIM = 0.66
const T_TREE_HAZE = 0.85
const T_TRUNK = 0.1

/* The cabin, in metres. Front wall at z = 0, ground at y = 0. */
const CAB_HW = 3.2
const WALL_H = 3
const CAB_Z0 = 0
const CAB_Z1 = -6
const RIDGE_Y = 5
const EAVE_X = 3.9
const EAVE_Y = 2.72
const ROOF_T = 0.24
const ROOF_Z0 = 0.55
const ROOF_Z1 = -6.55
const DECK_Y = 0.44
const DECK_Z = 1.7
const DOOR_HW = 0.6
const DOOR_H = 2.1
const WIN_X = 1.72
const WIN_HW = 0.49
const WIN_Y0 = 1.74
const WIN_Y1 = 2.66
/**
 * The chimney, on the camera's side of the ridge and NOW OVER THE FIREPLACE.
 *
 * It was at (-1.95, -3.6), which is the middle of the roof — fine while the
 * only thing under that roof was a shell, and a plain contradiction now that
 * there is a hearth in the north wall with a breast rising off it. A stack that
 * comes out of the roof two and a half metres in front of the flue it is
 * supposed to be carrying is the kind of thing nobody sees and everybody who
 * reads the file has to work around.
 *
 * So it moves to sit on the breast: FIRE_X exactly, and far enough back that
 * its 0.78 footprint is inside the breast's own. What that costs is only ever
 * paid on the exterior, which is the only place it is seen. Measured at the
 * reduced-motion rest pose on a 1440x900 slice, as fractions of the frame's
 * half-width and half-height: the stack's top was at (-0.244, 0.591) and is at
 * (-0.202, 0.536) — 4% of a half-frame to the right and 6% down, against a
 * ridge that sits at 0.539. It is still on the near slope, still well clear of
 * the ridge line, and it now stands at almost exactly the ridge's own height on
 * screen rather than above it, which reads as a chimney at the back of a roof
 * instead of one in the middle of it.
 */
const CHIM_X = -1.25
const CHIM_Z = -5.25
const CHIM_Y = 5.8

/* ────────────────────────────────────────────────────────────────────────────
   The room, in metres. Plan view, north at -z; the camera enters from +z.
   ──────────────────────────────────────────────────────────────────────────*/

/**
 * How far inside the outer shell the room's own surfaces stand.
 *
 * It has to be SMALL, because the gap between the outer wall and this one is
 * exactly what a glancing sightline can escape along: at 6cm the flank window
 * is sealed until the ray runs 49 units of z per unit of x.
 */
const IN_T = 0.06
const IN_X = CAB_HW - IN_T
/** South (the door wall) and north (the fireplace wall). */
const IN_Z0 = CAB_Z0 - IN_T
const IN_Z1 = CAB_Z1 + IN_T
/**
 * The floor, a hair under the threshold, so the doorway shows a room and not a
 * 40cm drop into a cellar.
 */
const IN_Y = DECK_Y - 0.02

/**
 * The ceiling, which is not a surface this file draws: the roof's own underside
 * is already two slabs meeting watertight at the ridge over the whole footprint
 * and wound facing down. This is where it IS, so anything standing in the room
 * can stop against it.
 */
function ceilAt(x: number) {
  return RIDGE_Y - ROOF_T - (Math.abs(x) / EAVE_X) * (RIDGE_Y - EAVE_Y)
}

/**
 * The west window — the one the camera ends on, and the reason the last beat
 * has a subject at all.
 *
 * It grew in this pass, from 1.2 x 0.9 to 1.66 x 1.26, and moved 1.1m north.
 * As an exterior detail seen at 12m it only had to be a lit hole; as the
 * BACKDROP the small tools cards are read against it has to be a field, and a
 * field wants to be most of the frame. `SW_Z0` is its north edge and `SW_Z1`
 * its south one, which is the order the wall strips in `buildWorld` are
 * written in.
 *
 * The floor plan puts it in the west wall's "upper half" and the owner's own
 * words put it "right next to the table". Those disagree by about a metre, and
 * this is the owner's: its centre is at z = -3.03, the room's own midpoint, so
 * it starts 50cm past the table's far edge. A window in the north half would be
 * a pan across an empty wall to get to it.
 */
const SW_Y0 = 1.16
const SW_Y1 = 2.42
const SW_Z0 = -3.86
const SW_Z1 = -2.2

/**
 * The east window. Background only — the camera never settles on it — and it
 * exists for two reasons that are both about the other side of the room.
 *
 * It puts daylight on the desk in the south-east corner, which is otherwise the
 * one corner nothing lights; and it is what the reader sees BEHIND the table
 * during the turn, so the room reads as having two sides rather than one wall
 * and a void. It is smaller and higher than the west one because it is over a
 * desk rather than beside a table.
 *
 * **Cutting it means cutting the exterior east wall too.** That wall is a
 * single quad facing +x, so from inside it is back-facing and culled: a window
 * cut only in the inner skin would be a hole straight out of the cabin. Six
 * more triangles out there, on a wall no position on the walk can see.
 */
const EW_Y0 = 1.34
const EW_Y1 = 2.34
const EW_Z0 = -3.55
const EW_Z1 = -2.35

/**
 * The fireplace: north wall, centre-left, "about a third of the wall's width".
 *
 * The wall is 6.28 inside, so a third is 2.09 and `FP_HW` is 1.05. It is centre
 * LEFT — west of the middle — because that is the floor plan, and because it
 * puts the fire on the same side of the room as the table and the window, so
 * the one light source is behind everything the camera settles on rather than
 * across the room from it.
 *
 * The surround stands proud of the wall and the firebox is cut back THROUGH it
 * into the wall's own thickness and 26cm beyond, which is the only geometry in
 * this file that leaves the building. Nothing can see it: the exterior north
 * wall is a quad facing -z that occludes it from outside, and its own back
 * panel is back-facing from out there.
 */
const FIRE_X = -1.25
const FP_HW = 1.05
/** The surround's face, standing into the room from the north wall. */
const FP_FZ = IN_Z1 + 0.48
/** The firebox: opening, and how far back it goes. */
const FP_OPEN_HW = 0.62
const FP_OPEN_Y0 = IN_Y + 0.18
const FP_OPEN_Y1 = 1.52
const FP_BZ = IN_Z1 - 0.26
const MANTEL_Y = 1.72
const MANTEL_T = 0.17

/**
 * The fire itself, and the point the baked light comes from.
 *
 * `FIRE_Y` is the ember bed, 18cm up the firebox from the floor, and `FIRE_Z`
 * is far enough forward in the box that a tongue at full height is not clipped
 * by the opening's own lintel from a low angle.
 */
const FIRE_Y = FP_OPEN_Y0
const FIRE_Z = FP_BZ + 0.34
/**
 * The ember bed's glow, as a BILLBOARDED ellipse rather than a patch lying on
 * the firebox floor.
 *
 * It was flat, at y = FIRE_Y + 0.015, and the geometry says why that could not
 * work: the camera is never more than 20 degrees above the floor of the firebox
 * from anywhere on the walk, so a horizontal 0.92 by 0.48 disc presented about
 * 13cm of apparent height — a bright sliver under the logs, which is not what
 * "the base of the fire is never as dark as the gap between two tongues" needs.
 * Stood up and turned to face the lens with everything else in this buffer, the
 * same six triangles are a soft core the tongues rise out of, from every
 * station in the room.
 */
const EMBER_HW = 0.36
const EMBER_HY = 0.16
/**
 * ── the flames ────────────────────────────────────────────────────────────
 *
 * Five tongues, four rows each, and every row is TWO quads split down the
 * tongue's own centre line — 80 triangles where the old fire had 24.
 *
 * **The split is the whole difference between this and the shape the render
 * called "a flat shape: a dark rectangle with a pale wedge in it".** A quad has
 * four corners and a vertex colour can only be given at a corner, so a tongue
 * drawn as one quad per row has the same alpha and the same heat right across
 * its width. Whatever is done to it after that, it is a card. Split at the
 * spine, the two inner corners can be hot and opaque and the two outer ones
 * cool and transparent, and Gouraud does the rest: a bright core inside a soft
 * edge, which is what a flame is and what no amount of alpha on a single quad
 * can produce.
 *
 * `FLAME_GAP` is 0.155, so five tongues span 0.62 against a firebox opening
 * 1.24 wide — the fire fills the middle half of the hearth and the log bed
 * carries the rest. `FLAME_TAPER` makes the outer tongues shorter, which is the
 * cheapest thing that stops five tongues reading as a comb.
 */
const FLAMES = 5
const FLAME_ROWS = 4
const FLAME_H = 0.66
const FLAME_W = 0.155
const FLAME_GAP = 0.132
const FLAME_SWAY = 0.115
const FLAME_TAPER = 0.34
/**
 * The heat scale, written into the fire buffer's RGB and multiplied against
 * `--warm` on the material.
 *
 * **It is one scalar and it still gives a hot core and a cooler tip, and the
 * reason is the clamp rather than a second colour.** `--warm` is #f5c98a, which
 * in the linear space three.js blends in is (0.913, 0.590, 0.254). At
 * `HEAT_CORE` that is (1.55, 1.00, 0.43): red and green are both past 1 and
 * clip, blue does not, so what lands on the screen is rgb (255, 255, 180) — a
 * pale gold. At `HEAT_TIP` the same pigment is (0.50, 0.32, 0.14), which is
 * (188, 155, 105), a dull ember. One number, one token, no second pigment, and
 * rule 2 is untouched: this is a brightness on `--warm`, not a colour.
 *
 * That is also what a camera does to a real fire, which is where the reference
 * for "a hot core and a cooler tip" comes from in the first place: the middle
 * of a flame is not a different hue, it is the same hue past what the medium
 * can hold.
 */
const HEAT_CORE = 1.7
const HEAT_TIP = 0.62
const HEAT_EDGE = 0.72
const HEAT_BED = 1.3
/**
 * ── GOLDEN, AND FRESHER ───────────────────────────────────────────────────
 *
 * The site owner's note is "can you make the light coming from the cabin a
 * little bit more golden and fresher light", and that is a HUE-and-saturation
 * note rather than a brightness one. `HEAT_CORE` and the rest above are
 * brightnesses; multiplying a pigment moves it along its own ray toward white
 * or black and can never make it more golden. #f5c98a scaled is #f5c98a.
 *
 * **So this is a chroma gain about the token's OWN luma, and it is still one
 * token and one scalar.** `L + (c - L) * WARM_CHROMA` pushes each channel away
 * from `--warm`'s Rec.709 luma without moving the luma itself: the hue angle is
 * exactly `--warm`'s, the lightness is exactly `--warm`'s, and what changes is
 * how far from grey it sits. Rule 2 is untouched — there is no second pigment
 * here, and if `--warm` is ever re-chosen this follows it. A per-channel gain
 * triple WOULD have been a second colour wearing three numbers, which is why
 * it is not that.
 *
 * The arithmetic, in sRGB because that is the space every other mix in this
 * file happens in (see `toLinear`). `--warm` is #f5c98a = (0.961, 0.788,
 * 0.541) and its luma is 0.807:
 *
 * ```
 *                       r      g      b     as rgb        relative luminance
 *   --warm            0.961  0.788  0.541  245 201 138          0.6349
 *   x 1.32            1.000  0.782  0.456  255 199 116          0.6381
 * ```
 *
 * Red clips, which is the point: gold is the warm pigment with its red channel
 * full. Blue falls 22 values and green holds, so the fire stops being tan and
 * becomes amber. The relative luminance moves by half a percent, so **every
 * contrast measurement in this file still holds** — `T_PAPER`'s 4.9:1 against
 * `--text`, and the 0.15 ceiling on the table's wash, were both solved against
 * a luminance and neither of them moves.
 *
 * What it does to the fire, through the same clamp `HEAT_CORE` relies on:
 *
 * ```
 *                     was            is
 *   core  x 1.70   255 255 180   255 253 149     pale gold, not white
 *   tip   x 0.62   198 164 116   205 162  96     amber, not dusty brown
 *   edge  x 0.72   211 176 126   218 174 105
 * ```
 *
 * `HEAT_TIP` went 0.55 to 0.62 in the same edit and it is the "fresher" half:
 * at 0.55 the top of every tongue was (188, 155, 104), which is the value of
 * old wood, and the render read as smoky. The tips are the largest area of the
 * flame and they are what the eye calls the fire's colour.
 *
 * It reaches everything the fire's pigment reaches, which is the whole of what
 * the owner named: the flames and the ember bed, the wash on the hearth face
 * and the pool on the floor, the low warmth on the table and the west wall,
 * the two lit panes seen from the snow and the pool the doorway throws on it.
 * All of them are `--warm` on `coreMat`, `softMat` or `fireMat`, and all three
 * take this on the way in.
 *
 * **Light theme keeps the fire quiet and this does not change that.** `ROLES`
 * puts `halo` at 0 and `fire` at 0.42 there, so the house's outside lights stay
 * off and the hearth stays a tint; a tint with more chroma and the same
 * luminance is still a tint. Measured through light's ramp at the room beat,
 * the brightest pixel the hearth reaches is unchanged to the value.
 */
const WARM_CHROMA = 1.32
/**
 * How a tongue's opacity falls from its root to its tip, and how much of it is
 * left at the flank.
 *
 * `(1 - k^FLAME_ALPHA_K) ^ FLAME_ALPHA_P` rather than the `(1 - k)^1.1` this
 * had, and the render is the argument. That curve is 1.00 / 0.75 / 0.49 / 0.24
 * / 0 down the four rows, so everything above the first row was already half
 * gone — and the first row is the one behind the log bed. Measured on the
 * frame, the brightest pixel anywhere in the firebox was rgb (94, 87, 78) in a
 * room whose walls sit at 40: a fire dimmer than a lit window, in the one place
 * on this page that is supposed to be the brightest thing on the screen.
 *
 * At 1.8 / 0.8 the same four rows are 1.00 / 0.93 / 0.76 / 0.47, which is a
 * tongue that is solid for most of its height and gives out near the top —
 * what a flame does. The tip still reaches exactly zero, so nothing in this
 * layer has an edge.
 */
const FLAME_ALPHA_K = 1.8
const FLAME_ALPHA_P = 0.8
const FLAME_EDGE_A = 0.42
/**
 * The sparks. Seven triangles, one each, rising off the tongues and dying
 * before the lintel at 1.52 — they go up the flue, not into the room.
 *
 * "embers if they are cheap": one triangle apiece is as cheap as anything in
 * this file gets, and they are the only thing in the room that moves at a rate
 * the eye reads as a rate rather than as a breath. Their phases are spaced by
 * index like the smoke's, so the rest pose a reduced-motion visitor gets has
 * them already spread up the column instead of all seven sitting on the logs.
 */
const EMBERS = 7
const EMBER_RATE = 0.42
const EMBER_RISE = 0.5
const EMBER_SIZE = 0.016

/**
 * The big table, south-west corner, against the west wall, running back from
 * the south wall.
 *
 * **2.05 by 2.70, and it was 1.74 by 2.22 until the settled beat was actually
 * rendered.** The floor plan says the far edge is "roughly a third of the way
 * into the room", which is z = -2.0 of 5.88, and this reaches -2.80, which is
 * 47%. The frame is why, and it is the same argument the brief makes about
 * props: never scale a prop down to fit, move it so the frame crops it.
 * Measured on the first render of the table beat, at 1440x900: a 1.74 x 2.22 table
 * left the top right quarter of the frame showing floor and the table's own far
 * edge running diagonally through the middle of it — a hard tonal step
 * straight across where the project cards sit, which is precisely what the
 * paper exists to prevent. At 2.05 x 2.70 the paper alone covers 96% of the
 * frame's width at the aim and 74% at the top of it, and the step is off the
 * frame on three sides.
 *
 * It stays clear of the door by 37cm (the opening is x -0.6 to 0.6, the table's
 * east edge is -0.97) and its south edge touches the south wall, which is the
 * plan's "running back from the south wall".
 */
const TABLE_X0 = -IN_X + 0.12
const TABLE_X1 = -0.97
const TABLE_Z0 = -0.1
/**
 * The north edge, and it is where it is because it is what the reader sees over
 * the table's far side while the card grid is still low in the frame.
 *
 * The critics' reading of the old top-down beat was "a flat grey field with two
 * diagonal wedges at the right", and the wedges were this edge. It was not
 * that the edge was missing; it was that the sheet ran all the way to it, so
 * the only thing between the brightest field in the room and the floor was a
 * 12cm strip of table with no shadow and no lip on it. It carries four bands
 * instead: the sheet to -2.80, its shadow to -2.845, bare table to -2.88, and
 * the rug and the floor falling away past it.
 *
 * **The camera that measurement was taken against is gone and this note is
 * re-derived against the one that replaced it.** `ST_ROOM` looks WEST at a
 * person's eye, so the frame's horizontal axis is z with north at the RIGHT and
 * its vertical axis is x, with the table running AWAY from the reader. The
 * card grid's union at the arrival, read off the live DOM at 1440x900, is
 * 130..1310 by 464..1677 — so the only card-free picture at that beat is the
 * 464px band at the top and the outer 130px at each side. Unprojected onto the
 * table top at y = 1.182, the visible part of that grid box is the trapezoid
 * x -2.092 to -1.241 by z -0.430 to -2.071 — inside `PAPER_*` on all four
 * sides, by 87cm to the west, 24cm to the east, 17cm north and 73cm south.
 *
 * The card-free band ABOVE it is what this edge is for: the frame's own top
 * runs on past the table to the west wall, so at the arrival the top 262px of
 * a 900px frame is the table's far edge, the wall over it and the sill of the
 * west window at the right. 202px of clearance over the first card in the grid,
 * and `ST_ROOM`'s note has why that band closes at exactly the rate the grid
 * climbs into it.
 */
const TABLE_Z1 = -2.88
const TABLE_Y = IN_Y + 0.76
const TABLE_T = 0.07

/**
 * The paper, and it is a LEGIBILITY REQUIREMENT rather than a prop.
 *
 * The owner asked for it by name: "when the camera is facing down on the table,
 * you could add a big paper or something to be a solid background when the UI
 * is showing the project cards". So it is one flat sheet 1.80 by 2.44 covering
 * nearly the whole top, at one tone, with nothing drawn on it anywhere the
 * cards land. Nothing else stands on it; the note in `interior` has the render
 * that decided that.
 *
 * `T_PAPER` is the other half of it. It is the brightest large field in the
 * room by a clear margin in both themes, and it is FLAT: no facet steps, no
 * gradient, one quad, one tone. See the tone ladder.
 */
const PAPER_X0 = -2.96
const PAPER_X1 = -1.0
const PAPER_Z0 = -0.26
const PAPER_Z1 = -2.8
/**
 * The curled rim, and it is the only part of the sheet whose tone the reader
 * can actually see change.
 *
 * `tri` shades a facet from `LIGHT`, and `LIGHT` is 0.857 of the way up — so an
 * up-facing surface is already at 0.936 of full and tilting it a few degrees
 * moves the tone by under a value. Measured through the dark ramp: a 10-degree
 * tilt on a `T_PAPER` facet is 1.5 values of green, which is nothing. A slight
 * warp across the middle of the sheet is therefore not something this shading
 * model can draw, and pretending otherwise would be geometry that costs
 * triangles and shows nothing.
 *
 * A rim tilted 25 degrees over 7cm does show. The same arithmetic: a facet
 * leaning NORTH comes out at 0.590 against the flat 0.655, which is 8 values
 * darker in dark and 7 in light; leaning EAST, 10 and 9; leaning south or west
 * it goes 2 to 4 lighter. So a sheet curled up at its edges gets a soft dark
 * band along the two edges `LIGHT` is behind — north and east — and a faint
 * bright one along the other two, which is what a sheet of paper on a table
 * looks like and is under 4% of the range either way.
 *
 * 3.3cm of lift over 7cm is 25 degrees. It is a sheet that has been lying there
 * a while, not one that has just been dropped.
 */
const PAPER_RIM = 0.07
const PAPER_LIFT = 0.033

/** The small desk, south-east corner, against the east wall. Mirrored against
 *  the big table and smaller, which is the floor plan. */
const DESK_X0 = 1.42
const DESK_X1 = IN_X - 0.12
const DESK_Z0 = -0.4
const DESK_Z1 = -1.72
const DESK_Y = IN_Y + 0.74

function norm(v: V): V {
  const l = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}

function tri(s: Solid, a: V, b: V, c: V, base: number, out?: V) {
  const ux = b[0] - a[0]
  const uy = b[1] - a[1]
  const uz = b[2] - a[2]
  const vx = c[0] - a[0]
  const vy = c[1] - a[1]
  const vz = c[2] - a[2]
  let nx = uy * vz - uz * vy
  let ny = uz * vx - ux * vz
  let nz = ux * vy - uy * vx
  const len = Math.hypot(nx, ny, nz) || 1
  nx /= len
  ny /= len
  nz /= len
  // Winding is stated as "which way is out" rather than as vertex order,
  // because vertex order is the thing that is easy to get silently wrong on a
  // slanted quad and impossible to see afterwards — a back-face is simply not
  // drawn, and the hole it leaves looks like a modelling mistake.
  let p = [a, b, c]
  if (out && nx * out[0] + ny * out[1] + nz * out[2] < 0) {
    p = [c, b, a]
    nx = -nx
    ny = -ny
    nz = -nz
  }
  const d = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]
  const lit = base * (SHADE_FLOOR + (1 - SHADE_FLOOR) * Math.max(0, d))
  for (const q of p) s.pos.push(q[0], q[1], q[2])
  /*
   * The room's second light — and it is the ONE term in this file that is
   * per-VERTEX rather than per-facet. That split is the whole look of the room
   * and it is deliberate on both sides.
   *
   * `LIGHT` above is the sky, and it stays flat per triangle, because a hard
   * step from one facet to the next is what makes this scene read as the
   * parallax kit's chunky low-poly art rather than as a smooth render. Every
   * facet in the forest, the snow and the cabin's shell keeps it.
   *
   * The fire cannot. It is a POINT source standing in the middle of the thing
   * it lights, two metres from the wall beside it and six from the far corner,
   * so what it lays down is a radial falloff — and a radial falloff quantised
   * to one value per triangle is a staircase across the floor, which reads as
   * a modelling error rather than as light. Evaluated at the three corners and
   * left to interpolate, the same geometry gets a smooth pool for nothing: the
   * interpolation is free hardware and the extra cost is two more `hearthAt`
   * calls per triangle, at BUILD time, once.
   *
   * It is also why the floor, the walls and the ceiling are subdivided in
   * `interior` instead of being one quad each. Gouraud interpolation is
   * LINEAR, and an inverse-square falloff sampled at two points six metres
   * apart is a straight line through a curve — far too bright in the middle.
   * Four strips is where that error drops under a value on the dark ramp.
   */
  if (s.hearth) {
    for (const q of p) {
      s.tone.push(clamp01(lit + hearthAt(q[0], q[1], q[2], nx, ny, nz)))
    }
  } else {
    const t = clamp01(lit)
    s.tone.push(t, t, t)
  }
  s.pig.push(s.pigment, s.pigment, s.pigment)
}

function quad(s: Solid, a: V, b: V, c: V, d: V, base: number, out?: V) {
  tri(s, a, b, c, base, out)
  tri(s, a, c, d, base, out)
}

/**
 * A box standing on `yBase`. No bottom face by default: most things built with
 * this stand on the snow or on the deck, and their undersides are pressed
 * against something.
 *
 * That default used to be stated as "the camera never drops below y = 2.5, so
 * two triangles per box would pay for a surface nobody can reach", and lowering
 * the eye to 1.72 killed the claim rather than weakening it. The porch roof
 * sits at 2.94: from the door the reader is now looking UP at it, and what a
 * missing bottom face shows is not a dark underside but the inside of the box,
 * which is back-facing and culled — a rectangular hole with the sky in it,
 * straight over the door. `floor` is the two triangles for the boxes that
 * really can be seen from below, and it is passed at exactly two call sites:
 * the porch roof, and the chimney's footing course where it overhangs the
 * stack. Everything else is still standing on something.
 */
function box(s: Solid, x: number, yBase: number, z: number, w: number, h: number, d: number, base: number, floor?: boolean) {
  const x0 = x - w / 2
  const x1 = x + w / 2
  const y0 = yBase
  const y1 = yBase + h
  const z0 = z - d / 2
  const z1 = z + d / 2
  quad(s, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], base, [0, 1, 0])
  if (floor) quad(s, [x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0], base, [0, -1, 0])
  quad(s, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], base, [0, 0, 1])
  quad(s, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], base, [0, 0, -1])
  quad(s, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], base, [1, 0, 0])
  quad(s, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], base, [-1, 0, 0])
}

/** A quad on the front wall plane (or any plane facing +z). */
function panel(s: Solid, x0: number, x1: number, y0: number, y1: number, z: number, base: number) {
  quad(s, [x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], base, [0, 0, 1])
}

/**
 * A three-sided post. Six triangles where `box` costs ten, and for a tree
 * trunk or a porch post that is the whole difference: nobody can count a
 * trunk's faces at 12 metres, and this scene draws twenty of them.
 */
function post(s: Solid, x: number, yBase: number, z: number, r: number, h: number, base: number, rot: number) {
  const p: V[] = []
  for (let i = 0; i < 3; i++) {
    const a = rot + (i / 3) * Math.PI * 2
    p.push([x + Math.cos(a) * r, 0, z + Math.sin(a) * r])
  }
  for (let i = 0; i < 3; i++) {
    const a = p[i]
    const b = p[(i + 1) % 3]
    const mx = (a[0] + b[0]) / 2 - x
    const mz = (a[2] + b[2]) / 2 - z
    quad(
      s,
      [a[0], yBase, a[2]],
      [b[0], yBase, b[2]],
      [b[0], yBase + h, b[2]],
      [a[0], yBase + h, a[2]],
      base,
      [mx, 0, mz],
    )
  }
}

/**
 * Where everything flat-and-facing is pointed.
 *
 * A tooth in a treeline, a weed and a blade of dry grass are all ONE triangle,
 * which means each has exactly one side and is invisible from the other. The
 * camera moves 30 metres across this scene, so "face the camera" is not a
 * constant, and this is the single point everything flat is pointed at
 * instead: a position on the walk at about progress 0.35.
 *
 * **The number this note used to carry was 14 degrees of worst-case error and
 * it was wrong** — it survived the change from a straight dolly to an orbit
 * without being re-solved, and an orbit is exactly what breaks it. Measured
 * against the arc at 121 samples, on the arrangement BEFORE this pass: the
 * treeline's worst tooth was 63.4 degrees off face-on and the worst weed 80.8.
 * On the arrangement after it, with a rank added and the arc opened wider to
 * the right, the worst tooth is 59.1 and the worst weed is the same 80.8 —
 * both a little better than they were, neither anywhere near 14.
 *
 * **It is still the right trade, and the claim that matters is 90.** Under 90
 * degrees a single-sided triangle is foreshortened; at 90 it disappears. The
 * worst case in the scene is 80.8, which is one dry weed at (-14.5, 12) at one
 * end of one walk, squeezed to a sixth of its width — and a dry stalk seen
 * nearly edge-on looks like a dry stalk seen nearly edge-on. At 59 a distant
 * tooth is at half width, in a treeline whose whole job is to be a fringe of
 * varying widths. Nothing in here ever flips to its back face.
 *
 * Two better rules were solved and both came out WORSE at the maximum, which
 * is why this is still one constant: facing each prop at its own nearest point
 * on the arc gives 96.5 for the weeds (the camera swings hardest around
 * whatever it passes closest to), and facing each at the mean bearing over the
 * whole arc gives 75.0 for the weeds but 60.5 for the teeth. Neither is worth
 * a per-prop solve.
 *
 * Billboarding them per frame is the other alternative and it is the wrong
 * trade for a different reason: these live in the merged static world mesh,
 * and orienting them would mean rewriting a few hundred vertices every frame.
 */
const VIEW_FROM: [number, number] = [-12, 22]

/** A single triangle standing on the ground, facing `VIEW_FROM`. */
function tooth(s: Solid, cx: number, cz: number, y0: number, w: number, h: number, base: number) {
  let fx = VIEW_FROM[0] - cx
  let fz = VIEW_FROM[1] - cz
  const l = Math.hypot(fx, fz) || 1
  fx /= l
  fz /= l
  // perpendicular, so the triangle's width lies across the line of sight
  const px = -fz
  const pz = fx
  tri(
    s,
    [cx - px * w, y0, cz - pz * w],
    [cx + px * w, y0, cz + pz * w],
    [cx, y0 + h, cz],
    base,
    [fx, 0, fz],
  )
}

/**
 * A stone: a four-sided lump, off-centre so no two are the same shape. Four
 * triangles, no base, because it is sitting in snow.
 */
function stone(s: Solid, cx: number, cz: number, y0: number, r: number, h: number, base: number, rot: number) {
  const apex: V = [cx + r * 0.2, y0 + h, cz - r * 0.14]
  for (let i = 0; i < 4; i++) {
    const a0 = rot + (i / 4) * Math.PI * 2
    const a1 = rot + ((i + 1) / 4) * Math.PI * 2
    const r0 = r * (i % 2 ? 0.72 : 1)
    const r1 = r * ((i + 1) % 2 ? 0.72 : 1)
    const p0: V = [cx + Math.cos(a0) * r0, y0, cz + Math.sin(a0) * r0]
    const p1: V = [cx + Math.cos(a1) * r1, y0, cz + Math.sin(a1) * r1]
    tri(s, p0, p1, apex, base, [
      (Math.cos(a0) + Math.cos(a1)) / 2,
      0.5,
      (Math.sin(a0) + Math.sin(a1)) / 2,
    ])
  }
}

/**
 * A clump of dead stalks poking through the snow. One triangle each, splayed
 * from a common root and leaning apart, facing `VIEW_FROM` like the teeth do.
 *
 * These are the cheapest thing in the scene and they do more per triangle than
 * anything else in it: bare weeds are the detail that says the snow is lying
 * on GROUND rather than being the ground.
 */
function weeds(s: Solid, cx: number, cz: number, y0: number, h: number, n: number, seed: () => number) {
  let fx = VIEW_FROM[0] - cx
  let fz = VIEW_FROM[1] - cz
  const l = Math.hypot(fx, fz) || 1
  fx /= l
  fz /= l
  const px = -fz
  const pz = fx
  for (let i = 0; i < n; i++) {
    const lean = (seed() * 2 - 1) * 0.42
    const tall = h * (0.55 + seed() * 0.75)
    const root = (seed() * 2 - 1) * 0.16
    const foot = 0.035 + seed() * 0.03
    tri(
      s,
      [cx + px * (root - foot), y0, cz + pz * (root - foot)],
      [cx + px * (root + foot), y0, cz + pz * (root + foot)],
      [cx + px * (root + lean * tall), y0 + tall, cz + pz * (root + lean * tall)],
      T_WEED,
      [fx, 0.25, fz],
    )
  }
}

/**
 * A deterministic PRNG, seeded, so the trees and the snow land in the same
 * places on every load. A backdrop that reshuffles itself on refresh is not a
 * composition, it is a slot machine — and a composition is what has to sit
 * behind seven chapters without competing with them.
 */
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const smooth = (t: number) => {
  const k = clamp01(t)
  return k * k * (3 - 2 * k)
}

/**
 * The snowfield's drift — two sines for weather and two banks for the places
 * snow actually piles up. Deterministic, so the snow lies the same way on
 * every load.
 *
 * THREE masks multiply it away. One tapers it to nothing at the patch's own
 * edge, so the faceted patch and the flat plane beyond it meet on the same
 * height and the join can never show. One flattens it around the cabin, which
 * is partly so nothing has to stand on a slope and partly because it is true:
 * the snow in front of a door somebody uses is trodden flat. The third does
 * the same along the footpath, for the same reason and for one more — a path
 * laid over a surface that is still drifting under it disappears into the
 * drift. See `patchTop`.
 *
 * **And it drifts UP, never down.** The sines are signed and sum to ±0.25,
 * and every mask only ever scales toward zero, so the raw value reaches as far
 * below the ground as above it — while the flat plane the patch is laid over
 * sits at PLANE_Y, two centimetres down. Measured on the grids this actually
 * builds: 23 of the `high` tier's 99 vertices came out below that plane, by up
 * to 0.23m, and 7 of `low`'s 42 did. Not one of those hollows was ever visible.
 * The plane was nearer the camera, so it filled each of them in flat, and along
 * the band where the two surfaces crossed they were coplanar and z-fought for
 * real. Clamping at zero is what makes the "cannot z-fight" claim beside the
 * ground true rather than hopeful, and it costs no triangle and no visible
 * height: a clamped facet is flat and up-facing, which is the plane's own
 * normal and therefore the plane's own tone.
 */
/**
 * How much of the patch's own character a point is allowed to have: 1 in the
 * middle, tapering to 0 over the last five metres of every side.
 *
 * It was inline in `driftAt` and is hoisted because `snowTone` needs exactly
 * the same taper for exactly the same reason. The drift has to reach the flat
 * plane at the plane's own HEIGHT or the join shows as a step; the tone has to
 * reach it at the plane's own TONE or the join shows as a line. One function,
 * so the two can never disagree about where the patch ends.
 */
function patchEdge(x: number, z: number) {
  return (
    smooth((PATCH_HX - Math.abs(x - PATCH_CX)) / 5) *
    smooth((z - PATCH_Z0) / 5) *
    smooth((PATCH_Z1 - z) / 5)
  )
}

function driftAt(x: number, z: number) {
  const edge = patchEdge(x, z)
  const d = Math.max(Math.abs(x) / 5.2, Math.max(-z / 7.4, z / 9))
  const trodden = smooth((d - 0.8) / 0.4)
  // The footpath is flat for the same reason the yard is: it is walked on. It
  // is also what keeps the path's own quads from being buried — see `patchTop`.
  const walked = smooth((distToPath(x, z) - PATH_FLAT) / PATH_FADE)
  /*
   * **Every amplitude here went up by about half in this pass, and the reason
   * is the renders rather than a preference.** In `r2-D-1400.png` the snow is a
   * flat pale grey field across the bottom third of the frame with barely a
   * facet in it — and the drifts were already here, so more of the same was not
   * the answer. Two things were wrong at once and this is one of them: at 0.22
   * of relief across a 4m cell the facet is tilted four degrees, and four
   * degrees of tilt is nothing at all to `tri`'s shading. At 0.30, across cells
   * that are now 3.5m rather than 4m, it is seven — which is the difference
   * between a facet the eye finds and one it does not. The other half of the
   * fix is `snowTone`, which spends contrast rather than height.
   *
   * The two banks nearest the walk (the first and the last) grew most, because
   * the reader passes within a few metres of both and a drift is only relief if
   * you can see across it.
   *
   * None of it can put a mound in front of the lens: `trodden` flattens
   * everything within about 4m of the cabin and `walked` flattens the whole
   * footpath corridor, and the reader is on the footpath for the entire walk.
   */
  const h =
    0.3 * Math.sin(x * 0.36 + 1.7) * Math.cos(z * 0.29 - 0.6) +
    0.18 * Math.sin(x * 0.9 + z * 0.7) +
    0.07 * Math.sin(x * 1.9 - z * 1.6 + 2.2) +
    // Banked drifts. The sines above are weather; these are the places snow
    // actually piles up, which is wherever something has been standing in the
    // wind all winter. The third and fourth are out where the walk begins, so
    // the opening shot has relief in its foreground rather than a flat sheet.
    bank(x, z, -12.5, -3, 7, 4.2, 0.82) +
    bank(x, z, 10.5, 6, 6.5, 4.6, 0.62) +
    bank(x, z, -22, 22, 9, 7, 0.8) +
    bank(x, z, -28, 30, 9, 8, 1.05) +
    bank(x, z, 6.5, 14.5, 5.5, 5, 0.5)
  return Math.max(0, h * edge * trodden * walked)
}

/**
 * What TONE a square of the snow patch is, as opposed to what height it is.
 *
 * The ground in dark-02-seam.png is a flat sheet of pale grey across the whole
 * bottom of the frame, and the reason it is flat is worth naming, because the
 * drifts were supposed to fix it and could not: every quad of the patch is
 * emitted with `[0, 1, 0]` as its outward direction and `tri` shades it from
 * its OWN normal, so a facet only darkens if it is tilted — and the drifts are
 * 22cm of relief across a 4m cell, which is four degrees, which is nothing.
 * The snow is not flat because it has no shape. It is flat because everything
 * on it is pointing at the same sky.
 *
 * So the tone is decided per cell instead, and it costs no triangle at all —
 * this is a value handed to `quad`, not geometry. Two things move it:
 *
 * - **What is standing over it.** A disc per near tree and one for the cabin,
 *   pushed half a shadow's length down the light's own ground direction so
 *   each one runs away from its trunk the way a shadow does, and sized to
 *   still cover the trunk it belongs to. `max` and not a sum: two trees
 *   shading the same square do not make it twice as dark, they make it as dark
 *   as the darker one.
 * - **Weather.** Two sines at a twelfth of the shadow's depth, so no two
 *   squares of open snow are quite the same value.
 *
 * The result is blocky, at a 4m grain on `high` and a 5.7m one on `low`, and
 * that is not a compromise — it is the same faceted step the rest of the scene
 * is drawn in, and it is what the reference art does to a snowfield. What it
 * must not do is show at the patch's border, which is what `patchEdge` is for.
 */
const SHADE_DX = -LIGHT[0] / LIGHT[1]
const SHADE_DZ = -LIGHT[2] / LIGHT[1]
function snowTone(x: number, z: number, shade: [number, number, number][]) {
  const edge = patchEdge(x, z)
  if (edge <= 0) return T_SNOW
  let dark = 0
  for (const [sx, sz, r] of shade) {
    const k = 1 - Math.min(1, Math.hypot(x - sx, z - sz) / r)
    if (k > dark) dark = k
  }
  /*
   * The weather term is 0.095 and was 0.055, and there are two of them now.
   * This is the other half of the "the snow reads as a flat pale grey field"
   * fix — see `driftAt` for the first — and it is the half that does most of
   * the work, because it is the only thing in the scene that can make two
   * up-facing facets different values at all. The second sine runs at four
   * times the first's frequency and a third of its depth, so the field breaks
   * into patches within patches rather than into one regular corrugation.
   *
   * Measured on the dark theme's green channel across the `high` patch: the
   * open snow now spans 27 values against the 11 it spanned before, under a
   * ceiling that has not moved. Nothing here is brighter than it was; the
   * range is spent downward, which is what stops it glaring behind prose.
   */
  const t =
    T_SNOW +
    (T_SHADE - T_SNOW) * smooth(dark) +
    0.095 * Math.sin(x * 0.47 + 1.1) * Math.cos(z * 0.39 - 2.3) +
    0.032 * Math.sin(x * 1.9 - 0.7) * Math.cos(z * 1.55 + 0.8)
  return T_SNOW + (t - T_SNOW) * edge
}

/** A soft round bank of snow, tapering to nothing at `rx` / `rz`. */
function bank(x: number, z: number, cx: number, cz: number, rx: number, rz: number, h: number) {
  const k = 1 - Math.min(1, Math.hypot((x - cx) / rx, (z - cz) / rz))
  return h * k * k * (3 - 2 * k) * (k > 0 ? 1 : 0)
}

/**
 * The height of the drawn patch AT a point, rather than the height `driftAt`
 * would like it to be.
 *
 * The patch is a coarse grid — one cell is 5.7m across on `low` — so its
 * surface between the sample points is whatever the two triangles of that cell
 * interpolate, which is not `driftAt`. Anything laid ON the snow has to clear
 * THAT, and the difference is the whole reason a path quad placed at
 * `driftAt(x, z) + a hair` can still end up buried inside a cell that straddles
 * the corridor's edge: one corner flat, the far one 25cm up, and the surface
 * climbing between them.
 *
 * So the path asks the grid the same question the renderer will. Bilinear
 * rather than per-triangle because the twist between the two triangulations of
 * one cell is a couple of centimetres and PATH_LIFT covers it with room over.
 */
function patchTop(x: number, z: number, nx: number, nz: number) {
  const fx = ((x - PATCH_CX + PATCH_HX) / (PATCH_HX * 2)) * nx
  const fz = ((z - PATCH_Z0) / (PATCH_Z1 - PATCH_Z0)) * nz
  if (fx < 0 || fx > nx || fz < 0 || fz > nz) return 0
  const i = Math.min(nx - 1, Math.floor(fx))
  const j = Math.min(nz - 1, Math.floor(fz))
  const tx = fx - i
  const tz = fz - j
  const gx = (k: number) => PATCH_CX - PATCH_HX + (k / nx) * PATCH_HX * 2
  const gz = (k: number) => PATCH_Z0 + (k / nz) * (PATCH_Z1 - PATCH_Z0)
  const a = driftAt(gx(i), gz(j))
  const b = driftAt(gx(i + 1), gz(j))
  const c = driftAt(gx(i), gz(j + 1))
  const d = driftAt(gx(i + 1), gz(j + 1))
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz
}

/**
 * The faceted patch is not centred on the cabin, and that is the whole point.
 *
 * It exists so the reader can see that the snow has SHAPE, which means it has
 * to be under the reader — and the reader walks an arc from x = -32 to x = -3.
 * Centred on the cabin at 21m half-width it stopped at x = -21, so for the
 * first third of the walk the entire near foreground was the flat plane: a
 * sheet of unbroken pale grey across the bottom of the frame with not one
 * facet in it. Offsetting the patch to -5 costs nothing and puts the drifts
 * where the camera stands.
 */
const PATCH_CX = -7
const PATCH_HX = 28
const PATCH_Z0 = -22
const PATCH_Z1 = 34
/** Big enough that FOG_FAR eats its edges from anywhere on the walk. See there. */
const PLANE_HX = 140
const PLANE_Z0 = -140
const PLANE_Z1 = 90
/** How far the flat plane sits below the patch's own zero. See `driftAt`. */
const PLANE_Y = -0.02
/**
 * Where anything standing IN the snow has its feet.
 *
 * Below the plane, not on it. A trunk whose base sits at y = 0 stands two
 * centimetres proud of the plane it is planted in, and two centimetres at 12m
 * is a couple of pixels of sky under every tree — which reads as a forest
 * hovering. Sinking everything instead costs nothing and cannot ever show:
 * the worst case is a tree standing in a 40cm drift with 40cm of trunk buried,
 * and a trunk with snow banked up around it is what a trunk in a drift looks
 * like.
 */
const PLANT_Y = PLANE_Y - 0.04

/* ────────────────────────────────────────────────────────────────────────────
   The path to the door
   ──────────────────────────────────────────────────────────────────────────*/

/**
 * The line somebody has walked, from the bottom of the steps out into the
 * trees — and it is not a straight line to the horizon, it follows the way the
 * READER comes in. The camera's own arc runs from about (-32, 39) to (-3, 11),
 * so a path that curves out to the left is the path the reader is standing on.
 * A path aimed down +z would be a path arriving from somewhere nobody has been.
 *
 * It starts at z = 3.4 rather than at the wall because the porch steps reach
 * z = 3.2 and the deck is an opaque box in front of everything nearer than
 * that: a path laid under it is a path drawn inside a box.
 */
const PATH: [number, number][] = [
  [0, 3.4],
  [-1.2, 6.2],
  [-2.9, 9.8],
  [-5.2, 14.2],
  [-8, 19.2],
  [-11.2, 24.4],
]
/**
 * Half-width at the door and at the far end. Narrow, and narrower than looks
 * right in the numbers: a trodden line through snow is about a boot wide with
 * a scuffed margin either side, and at 1.25 it came out as a two-lane road
 * running to the horizon.
 */
const PATH_W0 = 0.52
const PATH_W1 = 0.82
/** How far either side of the line the snow is trodden flat, and its falloff. */
const PATH_FLAT = 2.4
const PATH_FADE = 3.6
/** How far the trodden surface sits above the snow the grid actually draws. */
const PATH_LIFT = 0.055

function distToPath(x: number, z: number) {
  let best = Infinity
  for (let i = 0; i < PATH.length - 1; i++) {
    const [ax, az] = PATH[i]
    const [bx, bz] = PATH[i + 1]
    const dx = bx - ax
    const dz = bz - az
    const t = clamp01(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz))
    const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t))
    if (d < best) best = d
  }
  return best
}

/** Point and half-width a fraction `k` along the whole path. */
function pathAt(k: number): [number, number, number] {
  const f = clamp01(k) * (PATH.length - 1)
  const i = Math.min(PATH.length - 2, Math.floor(f))
  const t = f - i
  const [ax, az] = PATH[i]
  const [bx, bz] = PATH[i + 1]
  return [ax + (bx - ax) * t, az + (bz - az) * t, PATH_W0 + (PATH_W1 - PATH_W0) * clamp01(k)]
}

/**
 * Where the trees stand: x, z, scale, rank. Best composition first, because
 * the tier budget takes the first N and `low` is most phones.
 *
 * **Rank is the cost knob as well as the tone knob.** 0 is the near rank —
 * seven notched tiers, snow on the branches, a visible trunk, and it is the
 * one the frame crops. 1 is the middle distance at five tiers. 2 is the far
 * rank at three, no snow, and it is read as a silhouette. Spending a near
 * rank's forty triangles on a tree forty metres off in fog buys nothing.
 * Rank 3 is the wall trunks, and it lives in `TRUNKS` rather than here.
 *
 * **None of them sits on the camera's path**, and that is measured rather than
 * eyeballed: the arc runs from (-31.9, 39.1) to (-3.1, 11.0), and the closest
 * any trunk comes to it is 5.4m — tree 0, at about progress 0.14, where it
 * sweeps the left edge of the frame as the reader passes it. That pass is the
 * point of it. What must not happen is the camera flying THROUGH a tree, and
 * the clearances were computed against the whole arc, not against its ends.
 *
 * The three rank-0 trees are placed against the frame rather than against the
 * cabin: 0 crops the left edge over the first third, 1 and 2 close in on both
 * edges through the middle, and by the last fifth the cabin and its light own
 * the frame outright — which is correct. There is no room at the end for a
 * near tree that does not stand in the window's light on the snow, and that
 * pool is the picture.
 *
 * **The ten entries added in this pass are all BEHIND or BESIDE the cabin, and
 * that is deliberate rather than timid.** The site owner asked for a frame that
 * feels filled, "like an actual forest", and the half of the frame that was
 * empty was the half a tree can be added to for free: past z = -7 nothing can
 * occlude the cabin and nothing can come near the arc, so the only question
 * left is composition. They are placed at irregular intervals — 4.5m, then 6m,
 * then 3m — because an even spacing is the one thing that reads as planted.
 * Their scales run 1.3 to 2.1 so the crowns land at different heights and
 * OVERLAP, which is what a stand of trees looks like and a row of them does
 * not. Two of them (index 25, 6) sit close enough behind the ridge that their
 * crowns break the roofline, which is the cheapest way to weld the building
 * into the wood behind it.
 *
 * They are interleaved rather than appended, because the tier takes the first
 * N: appended, every one of them would be a thing only an eight-core desktop
 * ever saw, and `low` is most phones.
 */
const TREES: [number, number, number, number][] = [
  [-29.4, 27.4, 2.6, 0],
  [-8.8, 3.5, 2.2, 0],
  [5.2, 6, 2.4, 0],
  [-9.5, -6, 1.5, 1],
  [8.2, -4.6, 1.35, 1],
  [-19.5, 14, 2.4, 1],
  [14.5, 2.2, 2.3, 1],
  [-6.2, -12.5, 1.7, 2],
  [-25.7, 20.1, 2.2, 1],
  [2, 26, 2.3, 1],
  [11.2, -9.5, 1.5, 1],
  [-16.8, -3.5, 1.9, 1],
  [-13.4, 1.5, 1.2, 1],
  [12.8, 2.4, 1.3, 1],
  [-4, -17, 1.8, 2],
  [7.5, 18, 2.1, 1],
  [-12.5, 6, 2, 1],
  [3.5, -16, 1.6, 2],
  [21, -2.5, 1.8, 2],
  [-15, -8, 1.4, 2],
  [16, -14, 1.5, 2],
  [-19, -18, 1.6, 2],
  [18, 6, 1.6, 2],
  [-22.5, -9, 1.7, 2],
  [0.5, -21, 1.9, 2],
  [-2.5, -9.5, 1.3, 2],
  [6.5, -19, 1.6, 2],
  [24, -12, 1.5, 2],
  [-27, -14, 1.6, 2],
  [13.5, -21, 1.4, 2],
]

/**
 * The trunks the reader walks BETWEEN: x, z, scale, all of them rank 3.
 *
 * This is the other half of the site owner's "trees in the foreground like in
 * an actual forest". A forest seen from inside is not a treeline you look at,
 * it is a few enormous verticals that pass close enough to the lens to be cut
 * off by the frame, with everything else read between them — and until this
 * pass the only prop in this scene that ever came within 8m of the camera was
 * a single conifer at the very start of the walk.
 *
 * Each is a conifer with rank 3's proportions, so up close it is a bare
 * vertical with no visible top and at a distance it is a tall pine. They are
 * measured against the whole arc rather than its ends, the same way `TREES`
 * is, and each carries the walk range over which it is actually in the frame:
 *
 * ```
 *                clearance  in frame  sx at 0 -> 1   crown leaves frame
 *   -6.6, -6.0     17.4m    all of it  -0.29 -0.92   walk 0.72
 *    7.0, -1.5     16.1m    all of it   0.20  0.94   walk 0.75
 *    4.6,  7.2      8.6m    0.00-0.49   0.38  (2.4)  walk 0.51
 *  -24.6, 23.4     10.0m    0.00-0.12  -0.44  (-9)   never; it is passed
 * ```
 *
 * The first two are the pair that matters, which is why they are the two
 * `low` buys. At the start of the walk they are tall pines standing 50-something
 * metres off, one either side of the cabin; by the arrival they are at
 * sx -0.92 and 0.94 — hard against the left and right edges of the frame —
 * their crowns have climbed past the top of it, and what is left of each is a
 * dark vertical with no top, sixteen metres from the lens. Nothing else in
 * this scene changes that much across the walk, and that CHANGE is the depth:
 * the cabin's own screen width barely doubles over the same stretch.
 *
 * The third is the overtake. It passes 8.6m from the lens and leaves the frame
 * to the right halfway through, so the reader goes past it, which no amount of
 * parallax between two distant things can imitate.
 *
 * None of them ever covers the cabin. The test was not "is it beside it" but
 * "is it nearer than the cabin AND inside the cabin's own screen span,
 * ridge included", run over 121 samples of the walk; all four are outside that
 * span at every one of them.
 *
 * It is a separate array from `TREES` rather than four more rows in it because
 * it wants its own budget knob: these are the most expensive trees in the
 * scene per unit and the most valuable, so `low` buys two and `high` four,
 * which is not the ratio the rest of the forest scales at.
 */
const TRUNKS: [number, number, number][] = [
  [-6.6, -6, 3.2],
  [7, -1.5, 3],
  [4.6, 7.2, 2.7],
  [-24.6, 23.4, 3],
]

/** Skirt tiers, segments and proportions per rank. See `TREES` and `conifer`. */
const RANKS = [
  { tiers: 7, seg: 5, tone: T_TREE, snow: true, tall: 4.3, bare: 1.15 },
  { tiers: 5, seg: 4, tone: T_TREE_MID, snow: false, tall: 4.3, bare: 1.15 },
  { tiers: 3, seg: 3, tone: T_TREE_FAR, snow: false, tall: 4.3, bare: 1.15 },
  { tiers: 5, seg: 5, tone: T_TREE, snow: false, tall: 4.6, bare: 2.55 },
]

/**
 * Small rocks, dry weeds and the drift banks are what stop the ground being a
 * white plane.
 *
 * **Every one of them is at least 5m off the camera's arc**, and that is a
 * correction rather than a precaution. The first placement scattered them
 * around the yard on the reasoning that props belong where the reader walks —
 * which put a 42cm stone 1.3m from the lens and a weed 0.8m from it. Rendered,
 * they were a black pyramid and a black spike filling the bottom of the frame
 * over the last third of the walk. The reader is ON the path, so the path is
 * the one place a ground prop cannot be; they line the sides of it instead,
 * weighted to the right, which is the side the camera is looking across.
 * Measured against the whole arc: nearest stone 7.0m, nearest weed 5.9m.
 */
const STONES: [number, number, number][] = [
  [2.9, 5.4, 0.26],
  [-1, 3, 0.3],
  [4.4, 11.6, 0.3],
  [6.6, -1.2, 0.28],
  [-8.5, 6.5, 0.4],
  [1.2, 21.5, 0.32],
  [5.2, 16.8, 0.34],
  [8.5, 8, 0.36],
]
const WEEDS: [number, number, number][] = [
  [2.2, 8.4, 0.5],
  [-1.5, 2.4, 0.44],
  [3.9, 14.2, 0.58],
  [-7.5, 4, 0.6],
  [5.8, 4.2, 0.46],
  [7.4, 9.4, 0.54],
  [2, 19.5, 0.66],
  [-11.5, 6.5, 0.55],
  [9.6, 16.8, 0.6],
  [-14.5, 12, 0.7],
  [6.2, 22.5, 0.72],
  [11.5, 12.5, 0.62],
]

/* ────────────────────────────────────────────────────────────────────────────
   The forest behind the forest
   ──────────────────────────────────────────────────────────────────────────*/

/**
 * The ranks the reader never walks into: three arcs of single-triangle trees
 * standing round the clearing, the farthest of them holding the horizon.
 *
 * **One triangle per tree.** `landscapes/mountain-ridge-dark.webp` draws its
 * whole treeline as a serrated fringe along the foot of the ridge, and that is
 * exactly the right amount of tree for something forty metres off — it is a
 * shape, not an object. A hundred and twenty of these cost what four near
 * conifers do, and they are the thing that makes the cabin sit IN a forest
 * rather than in front of a few of them.
 *
 * **The third rank is where the hills used to be, and that is the site
 * owner's call: "trees in the foreground like in an actual forest instead of
 * boring mountains".** What stood at 48m was a seven-facet band at T_HILL,
 * and it read exactly as described — a smooth pale ridge, the one shape in
 * the picture that was not made of trees. Rank 2 takes its radius, its tone
 * (T_HILL is renamed T_TREE_HAZE and is the same 0.85, so the tone ladder's
 * top rung and the "soft lighter band on the horizon" both survive) and its
 * job of closing the horizon, and gives it a serrated edge instead of a
 * smooth one. It costs 51 triangles on `high` against the band's 14, which is
 * the single largest line in this pass's growth and the most visible.
 *
 * Its teeth are wide on purpose. At 45m the arc is 190m long, so 51 of them
 * are 3.7m apart, and at 1.7–4.3m of half-width they OVERLAP — which is the
 * difference between a treeline and a row of spikes with sky between them.
 *
 * The spacing carries a jitter of ±0.42 of a slot as well as the radial one.
 * Evenly spaced teeth with only a radius wobble still read as a comb, because
 * the eye finds the rhythm before it finds the depth; the jitter cannot
 * reorder them, so the arc is still swept once in order and no two teeth can
 * swap places and cross.
 *
 * The arc skips the wedge in front of the cabin, which is the clearing the
 * camera stands in and walks through. It is not centred on that wedge: the
 * walk comes in from the left, so the gap is opened wider to the left
 * (-1.12 rad) than to the right (0.86) and the right-hand teeth close in
 * nearer the front of the frame, where there was nothing. A tooth is flat, so
 * it must never be near enough to be caught side-on; the nearest any of them
 * comes to the arc is about 20m, where a 4m triangle is a distant tree and not
 * a piece of card.
 */
const RANK_R = [25, 33, 45]
const RANK_TONE = [T_TREE_FAR, T_TREE_RIM, T_TREE_HAZE]
/** Radial scatter, half-width and height per rank: [base, extra]. */
const RANK_SPREAD = [3.2, 4, 5.5]
const RANK_W = [
  [0.85, 1.05],
  [1.15, 1.5],
  [1.7, 2.6],
]
const RANK_H = [
  [2.6, 2.9],
  [3, 3.4],
  [4.4, 4.6],
]
/** How many teeth each rank gets, as a multiple of the tier's own number. */
const RANK_N = [1, 1.25, 1.6]
/** The arc the teeth stand on, in radians, measured from +z round through the back. */
const TEETH_A0 = 0.86
const TEETH_A1 = 5.16

function buildWorld(tier: Quality, hut = false): Solid {
  const s: Solid = { pos: [], tone: [], pig: [], hearth: false, pigment: PIG_BASE, hut }
  /* the wall's foot: on the ground for the cabin, up on stilts for the hut */
  const G = hut ? HUT_BASE : 0

  /*
   * What is standing on the snow, as discs the ground can be shaded by. Built
   * FIRST because the ground is, and built from the tier's own lists rather
   * than from the whole of `TREES` — a shadow cast by a tree this machine
   * never drew is a stain on the snow with nothing over it.
   *
   * Only ranks 0, 1 and 3 cast. Rank 2 is a silhouette twenty metres back
   * whose shadow would be behind it and mostly behind the cabin as well, and
   * the loop runs once per patch cell per caster.
   */
  const shade: [number, number, number][] = []
  const cast = (x: number, z: number, h: number, r: number) => {
    const dx = h * SHADE_DX * 0.5
    const dz = h * SHADE_DZ * 0.5
    shade.push([x + dx, z + dz, Math.hypot(dx, dz) + r])
  }
  for (let i = 0; i < tier.trees && i < TREES.length; i++) {
    const [tx, tz, ts, rk] = TREES[i]
    if (rk === 2) continue
    cast(tx, tz, RANKS[rk].tall * ts, 1.5 * ts)
  }
  for (let i = 0; i < tier.trunks && i < TRUNKS.length; i++) {
    const [tx, tz, ts] = TRUNKS[i]
    cast(tx, tz, RANKS[3].tall * ts, 1.5 * ts)
  }
  // The cabin's own, from the middle of the building at roughly eave height.
  // It falls to the right and back, which is where the walk is not, so what it
  // actually does is stop the snow behind the far corner from being the same
  // value as the snow in front of the near one.
  cast(0, (CAB_Z0 + CAB_Z1) / 2, EAVE_Y, 4.6)

  // ── ground ───────────────────────────────────────────────────────────────
  s.pigment = hut ? PIG_SAND : PIG_BASE
  // One enormous flat quad for everything the fog is going to eat anyway, and a
  // faceted patch around the cabin where the reader can actually see the snow.
  // The patch sits a hair above the plane so the two cannot z-fight — which is
  // a fact about `driftAt`, not about this quad, and it holds only because
  // `driftAt` is clamped at zero. Read its note before changing either number.
  // The drift also tapers to zero at the patch's own border, so the join is
  // invisible.
  quad(
    s,
    [-PLANE_HX, PLANE_Y, PLANE_Z1],
    [PLANE_HX, PLANE_Y, PLANE_Z1],
    [PLANE_HX, PLANE_Y, PLANE_Z0],
    [-PLANE_HX, PLANE_Y, PLANE_Z0],
    T_SNOW,
    [0, 1, 0],
  )
  const nx = tier.patchX
  const nz = tier.patchZ
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const x0 = PATCH_CX - PATCH_HX + (i / nx) * PATCH_HX * 2
      const x1 = PATCH_CX - PATCH_HX + ((i + 1) / nx) * PATCH_HX * 2
      const z0 = PATCH_Z0 + (j / nz) * (PATCH_Z1 - PATCH_Z0)
      const z1 = PATCH_Z0 + ((j + 1) / nz) * (PATCH_Z1 - PATCH_Z0)
      quad(
        s,
        [x0, driftAt(x0, z1), z1],
        [x1, driftAt(x1, z1), z1],
        [x1, driftAt(x1, z0), z0],
        [x0, driftAt(x0, z0), z0],
        // Sampled at the cell's centre, one value for both its triangles. A
        // per-VERTEX tone would need `tri` to take three of them and would
        // buy a gradient across a cell nobody can see the edges of anyway.
        snowTone((x0 + x1) / 2, (z0 + z1) / 2, shade),
        [0, 1, 0],
      )
    }
  }

  // ── the path to the door ─────────────────────────────────────────────────
  // Trodden snow, at its own tone, laid on top of what the grid actually draws
  // rather than on top of what `driftAt` says — `patchTop` is the difference
  // and its note says why. Enough segments that the curve reads as a curve.
  const legs = tier.prints + 6
  for (let i = 0; i < legs; i++) {
    const [ax, az, aw] = pathAt(i / legs)
    const [bx, bz, bw] = pathAt((i + 1) / legs)
    let dx = bx - ax
    let dz = bz - az
    const dl = Math.hypot(dx, dz) || 1
    dx /= dl
    dz /= dl
    const ay = patchTop(ax, az, nx, nz) + PATH_LIFT
    const by = patchTop(bx, bz, nx, nz) + PATH_LIFT
    quad(
      s,
      [ax + dz * aw, ay, az - dx * aw],
      [bx + dz * bw, by, bz - dx * bw],
      [bx - dz * bw, by, bz + dx * bw],
      [ax - dz * aw, ay, az + dx * aw],
      T_TRACK,
      [0, 1, 0],
    )
  }

  // Footprints, alternating left and right down the middle of it. Two
  // triangles each and darker again than the path, because the print is the
  // hole and the path is only where the snow has been flattened.
  const stride = 1 / (tier.prints + 1)
  for (let i = 0; i < tier.prints; i++) {
    const k = (i + 0.6) * stride
    const [px, pz, pw] = pathAt(k)
    const [nx2, nz2] = pathAt(Math.min(1, k + 0.02))
    let dx = nx2 - px
    let dz = nz2 - pz
    const dl = Math.hypot(dx, dz) || 1
    dx /= dl
    dz /= dl
    const side = i % 2 ? 1 : -1
    const cx = px + dz * side * pw * 0.38
    const cz = pz - dx * side * pw * 0.38
    const y = patchTop(cx, cz, nx, nz) + PATH_LIFT + 0.012
    const hl = 0.15
    const hw = 0.058
    quad(
      s,
      [cx - dx * hl + dz * hw, y, cz - dz * hl - dx * hw],
      [cx + dx * hl + dz * hw, y, cz + dz * hl - dx * hw],
      [cx + dx * hl - dz * hw, y, cz + dz * hl + dx * hw],
      [cx - dx * hl - dz * hw, y, cz - dz * hl + dx * hw],
      T_PRINT,
      [0, 1, 0],
    )
  }

  s.pigment = PIG_BASE
  // ── what is lying in the snow ────────────────────────────────────────────
  const propSeed = rng(0x9a17)
  for (let i = 0; i < tier.stones && i < STONES.length; i++) {
    const [sx, sz, sr] = STONES[i]
    stone(s, sx, sz, PLANT_Y, sr, sr * (0.6 + propSeed() * 0.5), T_STONE, propSeed() * 6.28)
  }
  s.pigment = hut ? PIG_LEAF : PIG_BASE
  for (let i = 0; i < tier.weeds && i < WEEDS.length; i++) {
    const [wx, wz, wh] = WEEDS[i]
    weeds(s, wx, wz, PLANT_Y, wh, 2, propSeed)
  }
  // the hut is bamboo and sawali from here to its roof
  s.pigment = hut ? PIG_WOOD : PIG_BASE

  // ── front wall, with its openings cut ────────────────────────────────────
  // Vertical strips, because that is the decomposition a wall with a door and
  // two windows falls into with the fewest triangles and no T-junctions.
  panel(s, -CAB_HW, -WIN_X - WIN_HW, G, WALL_H, CAB_Z0, T_WALL)
  panel(s, -WIN_X - WIN_HW, -WIN_X + WIN_HW, G, WIN_Y0, CAB_Z0, T_WALL)
  panel(s, -WIN_X - WIN_HW, -WIN_X + WIN_HW, WIN_Y1, WALL_H, CAB_Z0, T_WALL)
  panel(s, -WIN_X + WIN_HW, -DOOR_HW, G, WALL_H, CAB_Z0, T_WALL)
  panel(s, -DOOR_HW, DOOR_HW, G, DECK_Y, CAB_Z0, T_WALL)
  panel(s, -DOOR_HW, DOOR_HW, DECK_Y + DOOR_H, WALL_H, CAB_Z0, T_WALL)
  panel(s, DOOR_HW, WIN_X - WIN_HW, G, WALL_H, CAB_Z0, T_WALL)
  panel(s, WIN_X - WIN_HW, WIN_X + WIN_HW, G, WIN_Y0, CAB_Z0, T_WALL)
  panel(s, WIN_X - WIN_HW, WIN_X + WIN_HW, WIN_Y1, WALL_H, CAB_Z0, T_WALL)
  panel(s, WIN_X + WIN_HW, CAB_HW, G, WALL_H, CAB_Z0, T_WALL)
  // the gable above it, with two course lines across it — the one face of the
  // front wall wide enough and empty enough to carry them
  if (!hut) {
  tri(s, [-CAB_HW, WALL_H, CAB_Z0], [CAB_HW, WALL_H, CAB_Z0], [0, RIDGE_Y, CAB_Z0], T_WALL, [0, 0, 1])
  for (let i = 0; i < 2; i++) {
    const gy = WALL_H + 0.34 + i * 0.62
    const gw = CAB_HW * (1 - (gy - WALL_H) / (RIDGE_Y - WALL_H)) - 0.06
    if (gw > 0.2) panel(s, -gw, gw, gy, gy + 0.08, 0.012, T_TRIM)
  }

  }
  // back wall and gable
  quad(
    s,
    [-CAB_HW, G, CAB_Z1],
    [CAB_HW, G, CAB_Z1],
    [CAB_HW, WALL_H, CAB_Z1],
    [-CAB_HW, WALL_H, CAB_Z1],
    T_WALL,
    [0, 0, -1],
  )
  if (!hut) tri(s, [-CAB_HW, WALL_H, CAB_Z1], [CAB_HW, WALL_H, CAB_Z1], [0, RIDGE_Y, CAB_Z1], T_WALL, [0, 0, -1])

  // side walls. The left one carries a window, because the walk comes in from
  // the left and that side is what the reader sees for most of it. Its four
  // numbers are module constants now, beside `buildGlowCore`, because the
  // glow layer has to light the same hole this cuts.
  const sideL = (z0: number, z1: number, y0: number, y1: number) =>
    quad(s, [-CAB_HW, y0, z0], [-CAB_HW, y0, z1], [-CAB_HW, y1, z1], [-CAB_HW, y1, z0], T_WALL, [-1, 0, 0])
  sideL(CAB_Z1, SW_Z0, G, WALL_H)
  sideL(SW_Z0, SW_Z1, G, SW_Y0)
  sideL(SW_Z0, SW_Z1, SW_Y1, WALL_H)
  sideL(SW_Z1, CAB_Z0, G, WALL_H)
  // The east flank, cut round its own window for the first time in this pass.
  // It is a wall no position on the walk can see — the arc never leaves the
  // west side — so the six triangles are bought entirely for the INSIDE, where
  // the opening is what stops the desk's corner being a dead black wall.
  const sideR = (z0: number, z1: number, y0: number, y1: number) =>
    quad(s, [CAB_HW, y0, z1], [CAB_HW, y0, z0], [CAB_HW, y1, z0], [CAB_HW, y1, z1], T_WALL, [1, 0, 0])
  sideR(CAB_Z1, EW_Z0, G, WALL_H)
  sideR(EW_Z0, EW_Z1, G, EW_Y0)
  sideR(EW_Z0, EW_Z1, EW_Y1, WALL_H)
  sideR(EW_Z1, CAB_Z0, G, WALL_H)

  // ── roof ─────────────────────────────────────────────────────────────────
  // Two slanted slabs: the shingle plane, its underside and the fascia that
  // joins them. Then a snow cap laid over each, inset from the ridge and
  // stopping short of the eave so a dark strip of shingle still reads at the
  // bottom edge — which is how a snowy roof actually looks and is the cheapest
  // possible way to say "snow" on a slope.
  //
  // **Which of those three the reader sees is now the whole second half of the
  // walk.** The eye drops through the eave's own height of 2.72 at about walk
  // 0.48, 22m out, so from there in it is UNDER the roof: the top plane and
  // its cap swing out of sight and what is left is the fascia and the shaded
  // underside. That is the point of the lower camera rather than a cost of it
  // — a roof you are looking down on is a model and a roof you are looking up
  // at is a building — but it does mean the cap is a wide-shot detail. It is
  // still bought for `low`, because `low` is a phone, and on a phone the
  // FRAME_PULL keeps the reader further out for longer.
  if (hut) hipRoof(s)
  else {
  for (const sign of [-1, 1]) {
    const ex = sign * EAVE_X
    const up: V = [sign * -0.5, 0.87, 0]
    const R0: V = [0, RIDGE_Y, ROOF_Z0]
    const R1: V = [0, RIDGE_Y, ROOF_Z1]
    const E0: V = [ex, EAVE_Y, ROOF_Z0]
    const E1: V = [ex, EAVE_Y, ROOF_Z1]
    quad(s, E0, R0, R1, E1, T_ROOF, up)
    quad(
      s,
      [ex, EAVE_Y - ROOF_T, ROOF_Z0],
      [0, RIDGE_Y - ROOF_T, ROOF_Z0],
      [0, RIDGE_Y - ROOF_T, ROOF_Z1],
      [ex, EAVE_Y - ROOF_T, ROOF_Z1],
      T_ROOF,
      [-up[0], -up[1], 0],
    )
    quad(
      s,
      [ex, EAVE_Y - ROOF_T, ROOF_Z1],
      [ex, EAVE_Y - ROOF_T, ROOF_Z0],
      [ex, EAVE_Y, ROOF_Z0],
      [ex, EAVE_Y, ROOF_Z1],
      T_TRIM,
      [sign, 0, 0],
    )
    // the cap
    const cx0 = sign * 0.24
    const cx1 = sign * (EAVE_X - 0.5)
    const cy0 = RIDGE_Y + 0.05 - (Math.abs(cx0) / EAVE_X) * (RIDGE_Y - EAVE_Y)
    const cy1 = RIDGE_Y + 0.05 - (Math.abs(cx1) / EAVE_X) * (RIDGE_Y - EAVE_Y)
    quad(
      s,
      [cx0, cy0, ROOF_Z0 - 0.12],
      [cx1, cy1, ROOF_Z0 - 0.12],
      [cx1, cy1, ROOF_Z1 + 0.12],
      [cx0, cy0, ROOF_Z1 + 0.12],
      T_SNOW,
      up,
    )
  }

  }

  // ── chimney ──────────────────────────────────────────────────────────────
  // On the LEFT slope, because the walk comes in from the left and stays
  // there: a chimney on the far side is a chimney whose smoke rises out of
  // nothing. It is also the reason CHIM_X is a constant now rather than a
  // literal — the smoke has to be able to find it. See `buildSmoke`.
  //
  // A stack, a wider footing where it meets the roof, and four stones set
  // proud. One box is a pipe; the footing and the proud stones are what make
  // it masonry at 12 metres, which is the only distance it is ever read at.
  if (!hut) {
  box(s, CHIM_X, 1.9, CHIM_Z, 0.78, 1.5, 0.78, T_STONE)
  box(s, CHIM_X, 3.3, CHIM_Z, 0.64, 2.6, 0.64, T_STONE)
  // `floor` on the footing only: it overhangs the 0.64 stack by 9cm on every
  // side, and from a 1.72m eye the reader is looking up at that overhang.
  box(s, CHIM_X, CHIM_Y - 0.22, CHIM_Z, 0.82, 0.24, 0.82, T_STONE, true)
  box(s, CHIM_X, CHIM_Y, CHIM_Z, 0.72, 0.14, 0.72, T_SNOW)
  for (let i = 0; i < tier.stones && i < 4; i++) {
    const sy = 2.3 + i * 0.72
    const sw = 0.2 + (i % 2) * 0.1
    // the two faces the walk can see: front, and the left flank
    panel(s, CHIM_X - sw, CHIM_X + sw, sy, sy + 0.22, CHIM_Z + (i % 2 ? 0.41 : 0.34), T_TRIM)
    quad(
      s,
      [CHIM_X - (i % 2 ? 0.41 : 0.34), sy, CHIM_Z - sw],
      [CHIM_X - (i % 2 ? 0.41 : 0.34), sy, CHIM_Z + sw],
      [CHIM_X - (i % 2 ? 0.41 : 0.34), sy + 0.22, CHIM_Z + sw],
      [CHIM_X - (i % 2 ? 0.41 : 0.34), sy + 0.22, CHIM_Z - sw],
      T_TRIM,
      [-1, 0, 0],
    )
  }

  }

  // ── log courses ──────────────────────────────────────────────────────────
  // What makes a cabin a LOG cabin, and the cheapest true thing to say about
  // it. Not banded walls — the front wall is already cut into ten strips
  // around its openings, and course lines across it would be forty quads that
  // stop and start at every jamb. The notched CORNER is the read: stacked log
  // butts crossing the vertical edge at 45 degrees, so they catch a different
  // tone from either wall and step up the corner in a rhythm the eye finishes
  // by itself.
  //
  // Three corners, never four. The back-right one is behind the cabin from
  // every position on the walk.
  if (hut) sawali(s)
  else {
  const corners: [number, number, number][] = [
    [-CAB_HW, CAB_Z0, 1],
    [CAB_HW, CAB_Z0, -1],
    [-CAB_HW, CAB_Z1, -1],
  ]
  for (let c = 0; c < tier.corners && c < corners.length; c++) {
    const [cx, cz, sx] = corners[c]
    for (let i = 0; i < tier.logs; i++) {
      const y = 0.24 + (i * (WALL_H - 0.5)) / tier.logs
      const t = 0.12 + (i % 2) * 0.04
      const zo = cz === CAB_Z0 ? 1 : -1
      quad(
        s,
        [cx + sx * -0.02, y, cz + zo * 0.22],
        [cx + sx * 0.22, y, cz + zo * -0.02],
        [cx + sx * 0.22, y + t, cz + zo * -0.02],
        [cx + sx * -0.02, y + t, cz + zo * 0.22],
        i % 2 ? T_STONE : T_WALL,
        [sx * 0.7, 0, zo * 0.7],
      )
    }
  }
  // and plain course lines along the flank the walk looks straight down
  for (let i = 0; i < tier.logs; i++) {
    const y = 0.34 + (i * (WALL_H - 0.6)) / tier.logs
    if (y + 0.09 > SW_Y0 && y < SW_Y1) continue
    quad(
      s,
      [-CAB_HW - 0.05, y, CAB_Z1 + 0.2],
      [-CAB_HW - 0.05, y, CAB_Z0 - 0.2],
      [-CAB_HW - 0.05, y + 0.09, CAB_Z0 - 0.2],
      [-CAB_HW - 0.05, y + 0.09, CAB_Z1 + 0.2],
      T_TRIM,
      [-1, 0, 0],
    )
  }

  }

  // ── porch ────────────────────────────────────────────────────────────────
  // The roof and its posts are narrow, over the door only. A porch wide enough
  // to reach the windows would put a post in front of each of them and the roof
  // over both, which is a porch that shades the two brightest things in the
  // scene — the posts at x = 1.0 clear the door at 0.6 and the window's inner
  // edge at 1.23 with room either side. The deck below is wide, because it is
  // at knee height and passes under the sills without touching anything.
  box(s, 0, 0.22, DECK_Z / 2, 4.4, DECK_Y - 0.22, DECK_Z, T_TRIM)
  box(s, 0, 0, DECK_Z / 2, 4.1, 0.22, DECK_Z, T_STONE)
  // Three-sided posts rather than boxes: at 12m nobody counts a post's faces,
  // and it is four triangles each back into the tree budget.
  for (const sign of [-1, 1]) post(s, sign * 1, DECK_Y, DECK_Z - 0.3, 0.11, 2.5, T_TRIM, 0.4)
  // `floor` because the eye now arrives BELOW this. Its underside is the porch
  // ceiling, and a ceiling in shade is what gives the porch depth; see `box`.
  if (hut) s.pigment = PIG_THATCH
  box(s, 0, DECK_Y + 2.5, DECK_Z / 2 + 0.25, 2.5, 0.18, DECK_Z + 0.5, T_ROOF, true)
  if (hut) s.pigment = PIG_WOOD
  else box(s, 0, DECK_Y + 2.68, DECK_Z / 2 + 0.25, 2.3, 0.1, DECK_Z + 0.2, T_SNOW)
  // A rail each side, so the porch reads as a porch and not as a canopy on
  // two sticks. Flat quads, not boxes: a rail is seen edge-on from the walk
  // and its underside is never in the shot.
  for (const sign of [-1, 1]) {
    for (const ry of [DECK_Y + 0.92, DECK_Y + 0.52]) {
      quad(
        s,
        [sign * 1, ry, DECK_Z - 0.3],
        [sign * 1, ry, 0.1],
        [sign * 1, ry + 0.1, 0.1],
        [sign * 1, ry + 0.1, DECK_Z - 0.3],
        T_TRIM,
        [sign, 0.2, 0],
      )
    }
  }

  // steps down to the snow, snow-topped like everything else out here
  for (let i = 0; i < 3; i++) {
    const h = (DECK_Y * (3 - i)) / 4
    box(s, 0, 0, DECK_Z + 0.24 + i * 0.42, 2.4, h, 0.42, hut ? T_TRIM : T_SNOW)
  }

  // window frames, as a thin surround on the wall plane
  for (const sign of [-1, 1]) {
    const cx = sign * WIN_X
    panel(s, cx - WIN_HW - 0.09, cx + WIN_HW + 0.09, WIN_Y1, WIN_Y1 + 0.09, 0.01, T_TRIM)
    panel(s, cx - WIN_HW - 0.09, cx + WIN_HW + 0.09, WIN_Y0 - 0.11, WIN_Y0, 0.01, hut ? T_TRIM : T_SNOW)
    /*
     * The bars across the glass, and they are the cheapest legibility in the
     * whole cabin: two quads turn a warm rectangle into a WINDOW, and a warm
     * rectangle is what the eye files under "lit sign".
     *
     * At z = 0.04 rather than at the wall, and that number is load-bearing.
     * The lit pane is a transparent quad at z = 0.03 with `depthWrite: false`
     * but the depth TEST still on, so an opaque bar in FRONT of it wins and
     * the pane's fragments behind it are discarded. Put the bars at 0.02 and
     * they land behind the light and vanish.
     */
    panel(s, cx - 0.045, cx + 0.045, WIN_Y0, WIN_Y1, 0.04, T_TRIM)
    panel(s, cx - WIN_HW, cx + WIN_HW, (WIN_Y0 + WIN_Y1) / 2 - 0.04, (WIN_Y0 + WIN_Y1) / 2 + 0.04, 0.04, T_TRIM)
  }
  /*
   * The west window's own bar, and it is a TRANSOM rather than a mullion —
   * horizontal, high, and nothing down the middle.
   *
   * It used to be a vertical bar on the centre line, which is right for a
   * window seen at 12m from outside and wrong the moment that window became
   * the backdrop the small tools cards are read against. Rendered at the
   * settled window beat, the opening fills 73% of the frame's width and that
   * bar ran straight down the middle of it: rgb (42,49,60) against snow at
   * (120,124,132), in the one column of the frame where a heading sits. It is
   * the "no cut edges, ever" rule and the "no high-contrast edge where a card's
   * text lands" rule failing in the same place.
   *
   * A transom 20cm down from the head still says "window" — the reveal, the
   * sill and the wall around it are doing most of that work anyway. Measured on
   * the settled window frame at 1440x900, where the opening runs from 110px to
   * 830px: at 34cm the bar landed at 304px, which is 34% down the viewport and
   * straight through the top row of cards. At 20cm it lands at 224px, 25% down,
   * which is where a kicker and an h2 already are.
   */
  const sw = SW_Y1 - 0.2
  quad(
    s,
    [-CAB_HW - 0.04, sw - 0.045, SW_Z0],
    [-CAB_HW - 0.04, sw - 0.045, SW_Z1],
    [-CAB_HW - 0.04, sw + 0.045, SW_Z1],
    [-CAB_HW - 0.04, sw + 0.045, SW_Z0],
    T_TRIM,
    [-1, 0, 0],
  )

  // ── the room ─────────────────────────────────────────────────────────────
  // Five viewports of the walk happen in here, so it is a room rather than the
  // four flat panels that used to stand behind the openings. `interior` has it
  // all, and it is a separate function because it is half the geometry in this
  // file and `buildWorld` was already long.
  s.pigment = PIG_BASE
  interior(s, tier)
  s.pigment = hut ? PIG_WOOD : PIG_BASE

  // ── the door, standing open ──────────────────────────────────────────────
  // The whole section is about arriving somewhere, so the door is ajar rather
  // than shut: it is two triangles, and it is the difference between a lit
  // house and a house somebody is expecting you at.
  const A = DOOR_AJAR
  const hinge = -DOOR_HW
  const fx = hinge + DOOR_HW * 2 * Math.cos(A)
  const fz = DOOR_HW * 2 * Math.sin(A)
  quad(
    s,
    [hinge, DECK_Y, 0],
    [fx, DECK_Y, fz],
    [fx, DECK_Y + DOOR_H, fz],
    [hinge, DECK_Y + DOOR_H, 0],
    T_DOOR,
    [Math.sin(A), 0, Math.cos(A)],
  )
  /*
   * ── the door casing ──────────────────────────────────────────────────────
   *
   * Two jamb boards and a head, 14cm wide and standing 5cm proud of the wall.
   * They are here for one frame band and they earn their thirty triangles in
   * it: the threshold, where the reader is 0.5 to 2m off this wall and it fills
   * everything the doorway does not.
   *
   * Sampled on the canvas at the frame the critics called a floating box, the
   * left and right edges were rgb (50,57,68) at every one of 48 samples — one
   * value, 600px wide, which is a wall that reads as page. This wall is ONE
   * QUAD per side of the doorway and there is nothing else on it: the log
   * courses deliberately stop at the corners (see `log courses` above, which
   * states why they are not banded across the front), and at 12m that is right.
   * At 1.5m it is a void with a lit rectangle in it.
   *
   * Through the dark ramp the boards land at green 46 against the wall's 55,
   * their inner returns at 40 and their outer flanks at 48. Four values of
   * modelled edge where there was one flat step is what turns the doorway from
   * the outline of a box into the frame of a door — and the same thirty
   * triangles are in the approach's last frames, where a cabin door with a
   * casing round it is simply a better door.
   */
  for (const sign of [-1, 1]) {
    box(s, sign * (DOOR_HW + 0.07), DECK_Y, 0.025, 0.14, DOOR_H + 0.14, 0.05, T_TRIM)
  }
  box(s, 0, DECK_Y + DOOR_H, 0.025, DOOR_HW * 2 + 0.28, 0.14, 0.05, T_TRIM)

  // ── trees ────────────────────────────────────────────────────────────────
  const treeSeed = rng(0xc4b1)
  /*
   * ── nothing is planted in the pool, and two things were ────────────────────
   *
   * `TREES` and `TRUNKS` are one table for both worlds, and they were written
   * for the winter scene, which has no pool. The hut's world adds one
   * (`poolside`, x 5.0..8.8, z -0.6..-4.4 inside a 0.36 coping) and two entries
   * land in it: TREES[4] at (8.2, -4.6) sits on the south coping and TRUNKS[1]
   * at (7, -1.5) stands in the middle of the water. The site owner saw the
   * second: "one of the trees to the right of the hut are in a pond."
   *
   * Pushed out rather than moved in the table, because the table is shared: a
   * coordinate edited there would move a pine in a scene nobody has complained
   * about. This runs only when `hut` is true, and it pushes along whichever
   * axis is the shorter way out, so a tree keeps as much of its composed
   * position as the water allows.
   */
  const POOL = { x0: 4.64, x1: 9.16, z0: -4.76, z1: -0.24, pad: 0.75 }
  const clearPool = (tx: number, tz: number): [number, number] => {
    const x0 = POOL.x0 - POOL.pad
    const x1 = POOL.x1 + POOL.pad
    const z0 = POOL.z0 - POOL.pad
    const z1 = POOL.z1 + POOL.pad
    if (tx < x0 || tx > x1 || tz < z0 || tz > z1) return [tx, tz]
    const out = [tx - x0, x1 - tx, tz - z0, z1 - tz]
    const least = Math.min(out[0], out[1], out[2], out[3])
    if (least === out[0]) return [x0, tz]
    if (least === out[1]) return [x1, tz]
    if (least === out[2]) return [tx, z0]
    return [tx, z1]
  }
  const plant = (tx: number, tz: number, ts: number, rk: number) => {
    const r = RANKS[rk]
    if (hut) {
      const [px, pz] = clearPool(tx, tz)
      palm(s, px, pz, PLANT_Y, ts, treeSeed() * Math.PI * 2, r.tone, r.tall)
      return
    }
    conifer(
      s,
      tx,
      tz,
      PLANT_Y,
      ts,
      r.tiers,
      Math.max(3, r.seg + tier.cone - 5),
      treeSeed() * Math.PI * 2,
      r.tone,
      r.snow,
      r.tall,
      r.bare,
    )
    // Snow banked against the foot of the near ones. The reference art draws
    // this too — `props/pine-faceted-pair-dark.webp` has a whole shelf of
    // faceted snow chunks at the base — and four triangles is what stops a
    // trunk from looking pushed into the ground like a pin. Rank 3 buys it
    // too, and needs it more than anything else here: a wall trunk is the one
    // thing in the scene the reader gets close enough to see the FOOT of.
    if (rk === 0 || rk === 3) stone(s, tx, tz, PLANT_Y, 0.62 * ts, 0.3 * ts, T_SNOW, treeSeed() * 6.28)
  }
  for (let i = 0; i < tier.trees && i < TREES.length; i++) {
    const [tx, tz, ts, rk] = TREES[i]
    plant(tx, tz, ts, rk)
  }
  for (let i = 0; i < tier.trunks && i < TRUNKS.length; i++) {
    const [tx, tz, ts] = TRUNKS[i]
    plant(tx, tz, ts, 3)
  }
  /*
   * And one more trunk, which is not in `TRUNKS` and is not a tier's business:
   * it belongs to the WINDOW BEAT, and that beat happens on every machine.
   *
   * The brief's last requirement for the window is "something legible outside
   * it", and what was outside it was the far treeline and the edge of one
   * existing trunk. The window's own view cone was solved rather than guessed:
   * from `ST_WINDOW`'s eye at (-0.85, 1.9, -2.6) the opening's two jambs put
   * the cone at 9.9 degrees south of due west and 28.8 north of it, so at
   * 8.35m out — where this stands — the window shows z from -1.14 to -7.19.
   * `TRUNKS[0]` at (-6.6, -6) misses that by 24cm, which is why the last render
   * of this beat had a field of distant shards in it and no near subject.
   *
   * (-9.2, -3.2) is in the middle of the cone at 9.7m, which for a rank-3 trunk
   * at 2.6 scale is a bare vertical that fills the opening's height and is cut
   * off by the head — the same "a forest is a few enormous verticals" the
   * `TRUNKS` note is about, seen through a window instead of walked between.
   *
   * **It cannot touch the approach, and that was checked rather than hoped.**
   * The test the `TRUNKS` note sets is "is it nearer than the cabin AND inside
   * the cabin's own screen span". Against the orbit at its two ends and its
   * middle — camera (-3.12, 11.03), (-13.05, 25.02) and (-31.8, 39.0) — this
   * trunk sits at 23.1, 7.8 and 28.2 degrees while the cabin's nearest edge is
   * at 2.5, 16.2 and 31.5. It is outside the cabin's span at every one of them,
   * on the same side each time, so there is no sample between them where it
   * could cross. It is one more distant pine to the left of the shot.
   *
   * **And the tools cards sit over it, so the step it puts behind them was
   * measured too.** There is no card-free column at this beat — the opening
   * spans screen 150 to 1135 against a card box of 130 to 1310, so everything
   * outside this window is behind a card by construction and the only card-free
   * bands are horizontal. The test is therefore not "keep the edge out of the
   * box", it is "how much of the edge reaches the text": screenshot the beat
   * with this canvas visible and again with it hidden, and difference the two
   * inside each card inset past its border. The largest per-pixel luminance the
   * backdrop contributes is 37 in dark and 1.0 in light, against card
   * backgrounds of rgba(9,10,16,0.74) and rgba(255,255,255,0.88). That leaves
   * `--text` at 13.4:1 over the brightest pixel of the darkest card, against a
   * floor of 4.5. The card scrim was built for exactly this and it holds; the
   * same measurement at the table beat is 28 and 3.5.
   */
  plant(-9.2, -3.2, 2.6, 3)

  // ── the ranks behind them, out to the horizon ────────────────────────────
  // Three arcs now, the outermost of which stands where the hill band used to.
  // See RANK_R for what that swap is and whose call it was.
  const rankSeed = rng(0x71d3)
  if (hut) {
    sea(s)
    poolside(s)
    stilts(s)
  } else {
  for (let r = 0; r < tier.ranks && r < RANK_R.length; r++) {
    const n = Math.round(tier.teeth * RANK_N[r])
    for (let i = 0; i < n; i++) {
      // The jitter is applied to the SLOT rather than to the angle, so it can
      // never carry a tooth past its neighbour: at ±0.42 of a slot two
      // adjacent teeth can close to 16% of the spacing and no further.
      const slot = i + 0.5 + (rankSeed() * 2 - 1) * 0.42
      const a = TEETH_A0 + (slot / n) * (TEETH_A1 - TEETH_A0)
      const rad = RANK_R[r] + (rankSeed() * 2 - 1) * RANK_SPREAD[r]
      tooth(
        s,
        Math.sin(a) * rad,
        LOOK_Z + Math.cos(a) * rad,
        PLANT_Y,
        RANK_W[r][0] + rankSeed() * RANK_W[r][1],
        RANK_H[r][0] + rankSeed() * RANK_H[r][1],
        RANK_TONE[r],
      )
    }
  }

  }
  s.pigment = PIG_BASE

  return s
}

/* ────────────────────────────────────────────────────────────────────────────
   The room
   ──────────────────────────────────────────────────────────────────────────*/

/**
 * The fire's baked contribution to a facet's tone, at that facet's centroid.
 *
 * **The scene has exactly one runtime light and it is `LIGHT`, which is the
 * sky.** Indoors the sky reaches almost nothing: every interior surface is
 * turned away from it, so `tri` gives the whole room one flat value and the
 * result is a cardboard box. This is the second source, and it is baked into
 * the same tone the sky's is, which means it costs nothing per frame and adds
 * no material, no light object and no shader.
 *
 * What it CANNOT do is make anything warm — a tone is one number on a ramp
 * between two greys. The warmth is the `fire` layer's job, and the two are
 * meant to be read together: this is what the fire LIGHTS, and the quads in
 * `buildFireStatic` are the colour of the light doing it.
 *
 * The falloff is inverse-square-ish rather than inverse-square: at true
 * inverse-square the far corner of a 6m room is at 3% of the near wall and
 * comes out black, which is true of a real single candle and wrong for a room
 * with log walls bouncing everything.
 *
 * **`HEARTH_FALL` is 0.20 and was 0.055, and that is the single number this
 * pass changed most.** At 0.055 the term was nearly CONSTANT across the room:
 * measured on the tone the buffer actually carries, the floor a metre from the
 * hearth took 0.10 and the floor five metres away took 0.019, which after the
 * dark theme's ramp is rgb green 60 against 50. Ten values across a six-metre
 * room is not a light source, it is a tint — and it is exactly what made the
 * render read as "a low-contrast desaturated fog with a small pale fire in
 * it". A cabin lit by a hearth is warm near the fire and genuinely dark away
 * from it, and the falloff is the only thing in this file that can say so.
 *
 * At 0.20, with `HEARTH_K` raised to 0.90 so the near end still reaches, the
 * same two points are 0.39 and 0.014 — green 79 against 33. The west wall runs
 * 0.33 beside the hearth to 0.05 at its south end. That is a range, and the
 * rest of the room's ladder was dropped underneath it (see `T_FLOOR`) so there
 * is somewhere for it to fall INTO.
 *
 * Nothing up-facing above the flame gets any of it, which includes the table
 * top and therefore the paper: the fire is at y = 0.88 and the table is at
 * 1.18, so `ndl` is negative there and the term is zero. That is correct — a
 * fire in a hearth does not light the top of a table across the room — and it
 * is also why the paper's own tone has to carry it, and why the warmth on the
 * table's north edge is a `wash` in `buildFireStatic` rather than a tone.
 */
const HEARTH_P: V = [FIRE_X, FIRE_Y + 0.28, FIRE_Z + 0.12]
const HEARTH_K = 0.9
const HEARTH_FALL = 0.2
/**
 * And a ceiling on it, because the falloff has none of its own. Anything within
 * half a metre of the flame and facing it takes essentially the whole of
 * `HEARTH_K`, and now that the term is evaluated per VERTEX rather than per
 * facet that includes the corner of any surface that happens to touch the
 * hearth — the slab's own edge, the woodpile's near face, the log bed.
 *
 * 0.50, up from 0.34 with `HEARTH_K`. Through light's ramp, which starts at
 * 0.26 and is where this is dangerous, the brightest a room surface can now
 * reach is 0.26 + 0.60 * 0.74 = 0.70, which is rgb (208, 208, 212) against a
 * paper at (208) and a page at (235, 240, 251). Hot, and still short of the
 * white the light theme's whole problem was.
 */
const HEARTH_MAX = 0.5
function hearthAt(px: number, py: number, pz: number, nx: number, ny: number, nz: number) {
  const dx = HEARTH_P[0] - px
  const dy = HEARTH_P[1] - py
  const dz = HEARTH_P[2] - pz
  const d2 = dx * dx + dy * dy + dz * dz
  const d = Math.sqrt(d2) || 1
  const ndl = (dx * nx + dy * ny + dz * nz) / d
  if (ndl <= 0) return 0
  return Math.min(HEARTH_MAX, (HEARTH_K * ndl) / (1 + d2 * HEARTH_FALL))
}

/** A flat rectangle lying on the floor, a table or a shelf, at `y`. */
function lie(s: Solid, x0: number, x1: number, z0: number, z1: number, y: number, base: number) {
  quad(s, [x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], base, [0, 1, 0])
}

/**
 * A sheet of paper lying on a table: one flat field with a CURLED RIM round it,
 * and optionally one corner turned up further than the rest.
 *
 * **The middle is one quad and that is deliberate.** `field`'s subdivision buys
 * the hearth's falloff, and the hearth cannot reach a table top at all — the
 * fire is at y 0.88 and this is at 1.18, so `hearthAt`'s `ndl` is negative
 * everywhere on it and the term is zero. The sky term gives every cell of a
 * flat sheet the identical value. So cutting the middle up would be triangles
 * that cannot change a pixel, which is the trade `field`'s own note makes in
 * the other direction.
 *
 * The rim is where the picture is. `PAPER_RIM` and `PAPER_LIFT` carry the
 * arithmetic; what they buy is a soft dark band along the sheet's north and
 * east edges and a faint bright one along its south and west, so the sheet has
 * a thickness and a side the light is behind. Sixteen triangles.
 *
 * `dog` turns the corner at (`x0`, `z1`) up by a further 90%, which is a
 * dog-ear. That corner is not chosen for looks — it is the sheet's north-west
 * one, which is the FURTHEST point on the paper from the camera on this whole
 * leg, and it sits outside the frame's own footprint at every station from
 * `ST_ROOM_SET` on. Re-checked against the camera that replaced the top-down
 * one: it is 0.20 to 0.35m past the frame's top edge on the table, so the one
 * real tonal step in this arrangement is never under a card. Before that
 * camera it was in the frame's top-right 130px margin, which bought the same
 * thing a tighter way.
 */
function sheet(
  s: Solid,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  y: number,
  base: number,
  rim: number,
  lift: number,
  dog: boolean,
) {
  const ax0 = x0 + rim
  const ax1 = x1 - rim
  // z0 is the SOUTH edge and z1 the north one, so z0 > z1 and the inner edges
  // move the other way round from x's.
  const az0 = z0 - rim
  const az1 = z1 + rim
  lie(s, ax0, ax1, az1, az0, y, base)
  // The four rim strips: inner edge on the flat field, outer edge lifted.
  const hi = y + lift
  quad(s, [ax0, y, az0], [ax1, y, az0], [ax1, hi, z0], [ax0, hi, z0], base, [0, 1, 0])
  quad(s, [ax0, y, az1], [ax1, y, az1], [ax1, hi, z1], [ax0, hi, z1], base, [0, 1, 0])
  quad(s, [ax0, y, az1], [ax0, y, az0], [x0, hi, az0], [x0, hi, az1], base, [0, 1, 0])
  quad(s, [ax1, y, az1], [ax1, y, az0], [x1, hi, az0], [x1, hi, az1], base, [0, 1, 0])
  // and the four corners, each a quad from the flat field's corner out to the
  // sheet's own, which stands higher than either edge beside it.
  const corner = (ix: number, iz: number, ox: number, oz: number, k: number) =>
    quad(s, [ix, y, iz], [ox, hi, iz], [ox, y + lift * k, oz], [ix, hi, oz], base, [0, 1, 0])
  corner(ax0, az0, x0, z0, 1.4)
  corner(ax1, az0, x1, z0, 1.4)
  corner(ax1, az1, x1, z1, 1.4)
  corner(ax0, az1, x0, z1, dog ? 2.7 : 1.4)
}

/**
 * A second sheet, laid at an angle. One quad, and the angle is the whole point:
 * two sheets squared up with each other read as one sheet with a line on it.
 */
function slip(s: Solid, cx: number, cz: number, hu: number, hv: number, rot: number, y: number, base: number) {
  const c = Math.cos(rot)
  const sn = Math.sin(rot)
  const at = (u: number, v: number): V => [cx + u * c - v * sn, y, cz + u * sn + v * c]
  quad(s, at(-hu, -hv), at(hu, -hv), at(hu, hv), at(-hu, hv), base, [0, 1, 0])
}

/**
 * The same, cut into an `nu` by `nv` grid.
 *
 * **The subdivision is the fire's, not the geometry's.** A cabin floor has no
 * facets to describe — it is flat, and `tri`'s sky term gives every cell of it
 * the identical value, so as far as the low-poly look goes this is exactly one
 * quad's worth of picture. What it buys is the hearth's falloff: that term is
 * per-vertex now (see `tri`), Gouraud interpolation between two vertices is a
 * straight line, and the floor runs six metres from a light source two metres
 * off its near edge. Sampled at the four corners of ONE quad the pool comes out
 * as a flat wedge with the bright end in the wrong place; at 5 by 6 the error
 * against the analytic falloff is under a value on the dark ramp everywhere.
 *
 * 30 quads where there was 1. It is 58 triangles in a buffer that is uploaded
 * once and drawn in the same single call as everything else in the world, and
 * it is the largest field in the room the fire actually lights.
 */
function field(s: Solid, x0: number, x1: number, z0: number, z1: number, y: number, base: number, nu: number, nv: number) {
  for (let i = 0; i < nu; i++) {
    const a = x0 + ((x1 - x0) * i) / nu
    const b = x0 + ((x1 - x0) * (i + 1)) / nu
    for (let j = 0; j < nv; j++) {
      const c = z0 + ((z1 - z0) * j) / nv
      const d = z0 + ((z1 - z0) * (j + 1)) / nv
      lie(s, a, b, c, d, y, base)
    }
  }
}

/**
 * A rectangle standing on the z = `z` plane, facing `dir` (+1 or -1), cut into
 * `nu` by `nv`. Same argument as `field`: the strips exist so the fire's
 * falloff can bend along the wall instead of being sampled twice across it.
 *
 * `nu` and `nv` default to 1 — a wall the camera never gets near, or one the
 * fire reaches at a constant angle, does not need them and does not pay.
 */
function wallZ(s: Solid, x0: number, x1: number, y0: number, y1: number, z: number, dir: number, nu = 1, nv = 1, base = T_ROOM) {
  for (let i = 0; i < nu; i++) {
    const a = x0 + ((x1 - x0) * i) / nu
    const b = x0 + ((x1 - x0) * (i + 1)) / nu
    for (let j = 0; j < nv; j++) {
      const c = y0 + ((y1 - y0) * j) / nv
      const d = y0 + ((y1 - y0) * (j + 1)) / nv
      quad(s, [a, c, z], [b, c, z], [b, d, z], [a, d, z], base, [0, 0, dir])
    }
  }
}

/** The same on the x = `x` plane. */
function wallX(s: Solid, z0: number, z1: number, y0: number, y1: number, x: number, dir: number, nu = 1, nv = 1, base = T_ROOM) {
  for (let i = 0; i < nu; i++) {
    const a = z0 + ((z1 - z0) * i) / nu
    const b = z0 + ((z1 - z0) * (i + 1)) / nu
    for (let j = 0; j < nv; j++) {
      const c = y0 + ((y1 - y0) * j) / nv
      const d = y0 + ((y1 - y0) * (j + 1)) / nv
      quad(s, [x, c, a], [x, c, b], [x, d, b], [x, d, a], base, [dir, 0, 0])
    }
  }
}

/**
 * A log lying on its side: a three-sided prism along x, with ends.
 *
 * `post` is the same shape standing up and it is used for every trunk and leg
 * in this file; a fire wants them lying down, and it wants their ENDS, because
 * a log seen end-on from the room is a circle of char with the fire behind it
 * and that is most of what says "log" at this size. Eight triangles.
 */
function logAt(s: Solid, cx: number, y: number, z: number, half: number, r: number, base: number, rot: number) {
  const p: [number, number][] = []
  for (let i = 0; i < 3; i++) {
    const a = rot + (i / 3) * Math.PI * 2
    p.push([y + Math.sin(a) * r, z + Math.cos(a) * r])
  }
  for (let i = 0; i < 3; i++) {
    const [ay, az] = p[i]
    const [by, bz] = p[(i + 1) % 3]
    const my = (ay + by) / 2 - y
    const mz = (az + bz) / 2 - z
    quad(s, [cx - half, ay, az], [cx + half, ay, az], [cx + half, by, bz], [cx - half, by, bz], base, [0, my, mz])
  }
  for (const sign of [-1, 1]) {
    tri(
      s,
      [cx + sign * half, p[0][0], p[0][1]],
      [cx + sign * half, p[1][0], p[1][1]],
      [cx + sign * half, p[2][0], p[2][1]],
      base,
      [sign, 0, 0],
    )
  }
}

/**
 * The whole inside of the cabin.
 *
 * Read `internal/checklists/cabin-interior-spec.md` before changing anything in
 * here: it is the transcription of the owner's hand-drawn floor plan, and every
 * placement below is a row of its table.
 *
 * **Nothing in here is instanced, and that is the right answer rather than a
 * missed one.** InstancedMesh buys one draw call for N copies of one geometry;
 * this file already has ONE draw call for the entire world, because every
 * triangle in it — ground, forest, cabin, room and every prop — is merged into
 * a single static non-indexed buffer with a per-vertex tone, built once at
 * mount and uploaded once. Instancing the four table legs would add a draw
 * call, a second material and a per-instance matrix, to save 24 triangles out
 * of two thousand in a scene that has never once been vertex-bound. The merge
 * is strictly the better trade at this size and it is why the budget below is
 * quoted in draw calls as well as triangles.
 *
 * **What IS culled is what the camera cannot reach.** The spline is one path
 * and it is known at build time, so:
 *
 * - the north and south gables are one triangle each rather than a wall
 * - the east wall and the south wall take no subdivision, because the fire
 *   reaches both at a nearly constant distance and the camera never settles
 *   on either
 * - every surface here is single-sided and wound inward, so the half of each
 *   the reader stands behind costs nothing
 *
 * **The room DOES have a ceiling of its own now, and it did not.** This note
 * used to say "the roof's underside already is one", which was true of the
 * geometry and wrong about the light: those two slabs are built in
 * `buildWorld`, they overhang the walls by 70cm, and their undersides are the
 * porch's and the eaves' ceilings seen from the snow — so they can never carry
 * `s.hearth` without putting firelight on the outside of the building. The
 * room's own ceiling is 2cm under them, over the room's footprint only, and it
 * is what the lift off the table looks at.
 *
 * The north-east quarter above desk height used to be empty on the same
 * "camera is looking west or down" reasoning. That is true from the TURN
 * onward and false at the THRESHOLD, which aims north at the fire from five
 * metres out with a 54-degree frame — so the wall east of the fireplace was a
 * bare dark rectangle in the first frame of the room, and it has a shelf on it
 * now.
 *
 * `s.hearth` is on for the whole of it, which is what gives every VERTEX the
 * fire's own baked light on top of the sky's per-facet one. See `hearthAt` for
 * the light and `tri` for why the two are evaluated differently.
 */
function interior(s: Solid, tier: Quality) {
  /* In the hut the floor, the beams and the furniture are bamboo and the
     ceiling is the underside of the thatch; the walls, the hearth and the
     paper keep the base ramp. In the cabin all of this is one ramp, so these
     resolve to PIG_BASE and change nothing. */
  const wood = () => {
    s.pigment = s.hut ? PIG_WOOD : PIG_BASE
  }
  const base = () => {
    s.pigment = PIG_BASE
  }
  s.hearth = true
  const props = tier.room

  // ── the shell ────────────────────────────────────────────────────────────
  /*
   * The floor, cut 5 by 6 — see `field` for why, and `HEARTH_FALL` for what it
   * is carrying. It is the largest field in the room the fire actually lights
   * (the paper is bigger and the fire cannot reach it, being under the table's
   * own horizon) and every value between rgb green 31 in the south-east corner
   * and 78 on the hearth stone lives on these thirty cells.
   */
  wood()
  field(s, -IN_X, IN_X, IN_Z1, IN_Z0, IN_Y, T_FLOOR, 5, 6)
  // Floorboards: five lines cut across the floor, a shade under it. `tri`
  // shades from the facet's own NORMAL, and every cell of the floor has the
  // same one — so the grid above buys the fire's falloff and nothing else, and
  // without these the floor is still one unbroken plane. Ten triangles is what
  // says "boards". Same fix as `snowTone` outdoors, indoors.
  if (props >= 1) {
    for (let i = 1; i < 6; i++) {
      const bx = -IN_X + (i / 6) * IN_X * 2
      lie(s, bx - 0.018, bx + 0.018, IN_Z1 + 0.1, IN_Z0 - 0.1, IN_Y + 0.004, T_BEAM)
    }
  }
  /*
   * The ceiling, and it is NEW — this file used to say "there is no ceiling of
   * its own; the roof's underside already is one", which was true and is no
   * longer enough.
   *
   * The roof's underside is built in `buildWorld`, OUTSIDE this function, so it
   * never sees `s.hearth` — and it cannot be allowed to, because the same two
   * slabs overhang the walls by 70cm and their undersides are the porch's and
   * the eaves' ceilings, seen from the snow. Firelight on the outside of a
   * building is a bug. So the room gets its own, 2cm under the slab, over the
   * room's footprint only, at `T_CEIL` — the darkest large surface in the room,
   * which is what the underside of a roof in a room lit from below actually is.
   *
   * 16 quads. Two columns each side of the ridge and four rows down the room,
   * for the same reason the floor is subdivided: the fire is 5.7m from the
   * south end and 2.4m from the ridge above it, so the falloff along this
   * surface is the steepest anywhere in the room, and it is what puts a warm
   * patch on the roof over the hearth and leaves the rest of it black.
   */
  s.pigment = s.hut ? PIG_THATCH : PIG_BASE
  const CEIL_NX = 2
  const CEIL_NZ = 4
  for (const sign of [-1, 1]) {
    for (let i = 0; i < CEIL_NX; i++) {
      const xa = (sign * IN_X * i) / CEIL_NX
      const xb = (sign * IN_X * (i + 1)) / CEIL_NX
      const ya = ceilAt(xa) - 0.02
      const yb = ceilAt(xb) - 0.02
      for (let j = 0; j < CEIL_NZ; j++) {
        const za = IN_Z1 + ((IN_Z0 - IN_Z1) * j) / CEIL_NZ
        const zb = IN_Z1 + ((IN_Z0 - IN_Z1) * (j + 1)) / CEIL_NZ
        quad(s, [xa, ya, za], [xb, yb, za], [xb, yb, zb], [xa, ya, zb], T_CEIL, [0, -1, 0])
      }
    }
  }
  // north wall and its gable. The apex is the roof's own underside rather than
  // 4.5: at 4.5 there was a 15cm triangular gap under the ridge that the old
  // camera could not reach and the new one, tilting up off the table, can. At
  // `ceilAt(0)` the two meet exactly — solved, not nudged: the gable's edges
  // and the ceiling's slopes differ by 0.024 per unit x, so the triangle sits
  // 0 to 5cm INSIDE the slab all the way out and cannot show a seam.
  //
  /*
   * **AND IT IS CUT ROUND THE FIREBOX OPENING, which it was not, and that one
   * missing hole is most of why the fire read as "a flat shape".**
   *
   * The firebox is built at z = -6.20, behind this wall at -5.94, on the
   * reasoning in `FIRE_X`'s note that it is cut "THROUGH the wall's own
   * thickness and 26cm beyond". Nothing ever cut it. So the five dark inward
   * faces of the firebox — the thing the whole tone ladder puts at `T_HEARTH`
   * precisely so the flames have something to be seen against — were behind an
   * uncut wall and had never once been drawn, and what the tongues were burning
   * in front of was the north wall at `T_ROOM` with the fire's own light full
   * on it.
   *
   * Measured on `b3-D2400.png` before the cut, at the middle of the opening:
   * rgb (54, 60, 71) where `T_HEARTH` through the same ramp is (15, 22, 35),
   * and (167, 167, 172) against (125, 125, 133) in light. The fire was standing
   * against a surface BRIGHTER than the walls beside it. Rendering with the
   * fire layer hidden gave the identical pixel, which is what proved it was the
   * geometry and not the glow.
   *
   * Four strips round a 1.24 by 0.92 hole. Nothing else in this wall needs
   * cutting: from inside the room the surround's face, its two returns, the
   * mantel and the breast already cover every other part of the fireplace's
   * footprint, and outside the opening the wall is what the reader should see.
   */
  base()
  const fbL = FIRE_X - FP_OPEN_HW
  const fbR = FIRE_X + FP_OPEN_HW
  wallZ(s, -IN_X, fbL, IN_Y, WALL_H, IN_Z1, 1, 2, 2)
  wallZ(s, fbR, IN_X, IN_Y, WALL_H, IN_Z1, 1, 3, 2)
  wallZ(s, fbL, fbR, IN_Y, FP_OPEN_Y0, IN_Z1, 1)
  wallZ(s, fbL, fbR, FP_OPEN_Y1, WALL_H, IN_Z1, 1, 1, 2)
  tri(s, [-IN_X, WALL_H, IN_Z1], [IN_X, WALL_H, IN_Z1], [0, ceilAt(0), IN_Z1], T_ROOM, [0, 0, 1])
  // south wall, round the door, and its own gable. Single quads: it is the wall
  // BEHIND the camera for every beat from the turn onward, and the fire reaches
  // it at a nearly constant 5.5m, so there is nothing across it to bend.
  wallZ(s, -IN_X, -DOOR_HW, IN_Y, WALL_H, IN_Z0, -1)
  wallZ(s, DOOR_HW, IN_X, IN_Y, WALL_H, IN_Z0, -1)
  wallZ(s, -DOOR_HW, DOOR_HW, DECK_Y + DOOR_H, WALL_H, IN_Z0, -1)
  tri(s, [IN_X, WALL_H, IN_Z0], [-IN_X, WALL_H, IN_Z0], [0, ceilAt(0), IN_Z0], T_ROOM, [0, 0, -1])
  // West wall, round the window the camera ends on — and the wall this shot is
  // composed against, so it takes the finest cut in the room. Its north
  // segment runs from the fireplace's own corner to the window's jamb and
  // carries the light's whole falloff along it: 0.33 of tone at the north end
  // and 0.05 at the south, which is rgb green 75 to 42 in dark. In one quad
  // that was a flat 58 and it is why the window beat had a grey wall round it.
  wallX(s, IN_Z1, SW_Z0, IN_Y, WALL_H, -IN_X, 1, 3, 2)
  wallX(s, SW_Z0, SW_Z1, IN_Y, SW_Y0, -IN_X, 1, 2, 1)
  wallX(s, SW_Z0, SW_Z1, SW_Y1, WALL_H, -IN_X, 1, 2, 1)
  wallX(s, SW_Z1, IN_Z0, IN_Y, WALL_H, -IN_X, 1, 3, 2)
  // east wall, round its own. Two strips on the long runs and no vertical cut:
  // it is 6.3m from the fire across the room, where the falloff has already
  // flattened out, and the turn is the only beat that passes it.
  wallX(s, IN_Z1, EW_Z0, IN_Y, WALL_H, IN_X, -1, 2, 1)
  wallX(s, EW_Z0, EW_Z1, IN_Y, EW_Y0, IN_X, -1)
  wallX(s, EW_Z0, EW_Z1, EW_Y1, WALL_H, IN_X, -1)
  wallX(s, EW_Z1, IN_Z0, IN_Y, WALL_H, IN_X, -1, 2, 1)
  /*
   * The reveals: the 6cm of wall thickness round the window the camera settles
   * on. Without them the opening is a cut with nothing in it, and from any
   * angle off square the reader sees along the gap between the two skins
   * straight out of the building. Eight triangles, and they are what make the
   * last beat read as a window in a wall rather than a bright rectangle.
   *
   * Only the west one gets them. The east window is never nearer than 4m and
   * never off square by more than a few degrees, so its gap is under a pixel.
   */
  if (props >= 1) {
    const rz = (z: number, dir: number) =>
      quad(
        s,
        [-CAB_HW, SW_Y0, z],
        [-IN_X, SW_Y0, z],
        [-IN_X, SW_Y1, z],
        [-CAB_HW, SW_Y1, z],
        T_TIMBER,
        [0, 0, dir],
      )
    rz(SW_Z0, -1)
    rz(SW_Z1, 1)
    quad(s, [-CAB_HW, SW_Y1, SW_Z0], [-IN_X, SW_Y1, SW_Z0], [-IN_X, SW_Y1, SW_Z1], [-CAB_HW, SW_Y1, SW_Z1], T_TIMBER, [0, -1, 0])
    quad(s, [-CAB_HW, SW_Y0, SW_Z0], [-IN_X, SW_Y0, SW_Z0], [-IN_X, SW_Y0, SW_Z1], [-CAB_HW, SW_Y0, SW_Z1], T_SNOW, [0, 1, 0])
  }
  /*
   * The SILL, and it is not a reveal: a board standing 13cm proud of the wall,
   * on every tier, running 8cm past the opening at each end the way a real one
   * does.
   *
   * The brief for the window beat is "the frame, sill and the forest beyond it
   * are what makes it a window rather than a rectangle", and the reveals above
   * only give the first and the third. A reveal is the thickness of the wall
   * seen edge-on and it disappears the moment the camera is square to the
   * opening — which `ST_WINDOW` deliberately nearly is, at 9 degrees off. The
   * sill is the one part of a window that is still THERE from square on, and
   * it is the horizontal that puts the opening in a wall rather than in space.
   *
   * Its top is at `SW_Y0` exactly, edge to edge with the reveal's own bottom
   * face at the wall line, so the two read as one surface running out through
   * the wall to the snow on the outside sill. Eight triangles.
   *
   * Nothing stands on it. The window IS the field the small tools cards are
   * read against, and the sill crosses the bottom of that field — a lamp or a
   * pot here would be a dark object in the lower third of the one frame that
   * beat is composed on. `interior`'s note on the big table is the same
   * argument at the other beat.
   */
  wood()
  box(s, -IN_X + 0.065, SW_Y0 - 0.05, (SW_Z0 + SW_Z1) / 2, 0.13, 0.05, SW_Z1 - SW_Z0 + 0.16, T_TIMBER)
  /*
   * ── the window's casing ──────────────────────────────────────────────────
   *
   * A head board and two jambs, 10cm wide and standing 5.5cm into the room, and
   * an apron under the sill. The brief for this beat is that "a window is a
   * frame, a sill, a depth of reveal, and something legible outside it" and the
   * render it was written against had two of those four: the reveals above are
   * 6cm of wall thickness that vanish the moment the camera is square to the
   * opening, which `ST_WINDOW` deliberately nearly is, and the sill.
   *
   * The casing is the frame and it is also most of the depth: 5.5cm of
   * projection plus the 6cm reveal behind it is 11.5cm of thickness seen from
   * inside, against 6cm before. The head board carries its own underside
   * (`floor`), because from a 1.9m eye the reader is looking UP into it —
   * that face is the one surface in the whole opening that says how thick this
   * wall is from square on.
   *
   * **Where each piece is put is a legibility decision, measured.** The tools
   * cards were read off the live DOM at this beat: 130..1310 by 476..730 —
   * three cards in a single band across the middle. Unprojected onto the wall
   * plane, that band is y 1.28 to 1.79. So the head board at y 2.42 to 2.52 and
   * the apron at 0.99 to 1.11 are both entirely outside it, and the two jamb
   * boards are the only pieces that cross it. They cross it where the opening's
   * own cut edge already was, and what they do there is split one hard step
   * (wall to daylight) into three softer ones (wall, board, return, daylight) —
   * which is a legibility improvement rather than a new edge.
   */
  box(s, -IN_X + 0.028, SW_Y1, (SW_Z0 + SW_Z1) / 2, 0.055, 0.1, SW_Z1 - SW_Z0 + 0.2, T_TIMBER, true)
  for (const jz of [SW_Z0 - 0.05, SW_Z1 + 0.05]) {
    box(s, -IN_X + 0.028, SW_Y0, jz, 0.055, SW_Y1 - SW_Y0, 0.1, T_TIMBER)
  }
  if (props >= 1) {
    box(s, -IN_X + 0.015, SW_Y0 - 0.17, (SW_Z0 + SW_Z1) / 2, 0.03, 0.12, SW_Z1 - SW_Z0 - 0.1, T_TIMBER)
  }
  // Two ceiling beams. They are bought for two beats — the threshold and the
  // lift off the table to the window — and they are what those beats are FOR:
  // the room's height comes into frame, and a bare sloped ceiling has no scale
  // in it. `floor` on both, because from in the room the reader is looking up
  // at their undersides.
  //
  // -2.45 and not -1.85, and the frame the cards are read against is why. That
  // was solved against the top-down station, whose eye was at z = -1.46; the
  // camera that replaced it stands at z = -1.25 to -1.60 and looks DOWN AND
  // WEST, so its frame's top edge is at 2.56m of height only 1.2m ahead — a
  // beam at -1.85 would now be behind the lens rather than across the top of
  // the shot. Both positions are clear of the room beat at both cameras, and
  // -2.45 is the one that is also in the lift, so it stays.
  for (const bz of [-2.45, -4.55]) {
    if (bz < -3 && props < 1) continue
    box(s, 0, 2.56, bz, IN_X * 2, 0.17, 0.19, T_BEAM, true)
  }

  // ── the fireplace ────────────────────────────────────────────────────────
  base()
  hearth(s)
  wood()

  // ── the big table, and the paper on it ───────────────────────────────────
  const tcx = (TABLE_X0 + TABLE_X1) / 2
  const tcz = (TABLE_Z0 + TABLE_Z1) / 2
  box(s, tcx, TABLE_Y - TABLE_T, tcz, TABLE_X1 - TABLE_X0, TABLE_T, TABLE_Z0 - TABLE_Z1, T_TABLE, true)
  for (const lx of [TABLE_X0 + 0.16, TABLE_X1 - 0.16]) {
    for (const lz of [TABLE_Z0 - 0.18, TABLE_Z1 + 0.18]) {
      post(s, lx, IN_Y, lz, 0.075, TABLE_Y - TABLE_T - IN_Y, T_TABLE, 0.5)
    }
  }
  /*
   * ── THE PAPER ────────────────────────────────────────────────────────────
   *
   * It was one flat quad, and three critics who rendered this beat
   * independently all led with the same sentence about it: a flat grey field
   * with two diagonal wedges at the right. The field being flat is correct and
   * has to stay — the cards are read against it — so what this pass adds is
   * everything that makes a flat field a PLACE, and every piece of it is put
   * where the cards are not.
   *
   * **The card box is measured, not guessed — and it was RE-measured against the
   * camera that replaced the top-down one.** The sheet's four numbers have not
   * moved; what has moved is the frame that has to fit inside them, and the new
   * one is smaller and lands further from every edge.
   *
   * The camera now looks WEST at a person's eye and dollies in across the beat,
   * so on this table screen LEFT is the SOUTH end, screen RIGHT the north end,
   * screen UP is west (away) and screen DOWN is east (toward the reader). The
   * frame's own footprint on the table top (y = 1.182), unprojected at 1440x900
   * at the three stations the leg runs between:
   *
   * ```
   *                       x from   x to    z from   z to    slack to the sheet
   *   ST_ROOM      p A     wall*   -1.241  -0.505  -2.495   top of frame is wall
   *   ST_ROOM_SET  +0.25dT -2.615  -1.213  -0.505  -2.495   0.35 0.21 0.25 0.31
   *   ST_ROOM_END  +0.72dT -2.758  -1.583  -0.748  -2.452   0.20 1.42 0.49 0.35
   * ```
   *
   * From `ST_ROOM_SET` onward the WHOLE frame is on this sheet with a fifth of a
   * metre to spare on its tightest side. At `ST_ROOM` the frame's top runs past
   * the table to the west wall on purpose, and that band is above the card grid
   * by 202px — see `ST_ROOM` and `TABLE_Z1`.
   *
   * `PAPER_Z0` is -0.26 and not -0.20 because of how much of the sheet's own
   * SOUTH edge that puts in the picture — the whole of it is now in the frame's
   * left margin at every station on this leg, where the old camera only caught
   * its top 43%. That edge is the strongest step in this frame that a card
   * cannot reach: sheet at green 88 against bare table at 36. It is the room
   * beat's answer to "the table's edges should be visible somewhere in the
   * frame", and it is worth six centimetres of sheet to double its length.
   */
  base()
  sheet(s, PAPER_X0, PAPER_X1, PAPER_Z0, PAPER_Z1, TABLE_Y + 0.002, T_PAPER, PAPER_RIM, PAPER_LIFT, true)
  /*
   * The shadow, on the two edges `LIGHT` is behind — north and east.
   *
   * A sheet whose edge meets the table at the table's own value is a sheet
   * printed on the table. This is the band that puts it on top of one, and it
   * is `T_SHADOW`, which is the only tone in the room BELOW the surface it
   * lies on. It is 6cm wide, which at this station is 29px at the top of the
   * frame's right margin — wide enough to be a shadow and not a seam.
   *
   * North lands in the right margin, 3.5cm clear of the card box's own corner.
   * East lands off the bottom of the frame entirely (the frame's bottom edge
   * is at x -1.03 to -1.13 and this is at -0.955). Neither is anywhere a card
   * can reach, which is what lets them be a real step rather than a hint.
   */
  lie(s, PAPER_X0, TABLE_X1, PAPER_Z1 - 0.06, PAPER_Z1, TABLE_Y + 0.0015, T_SHADOW)
  lie(s, PAPER_X1, TABLE_X1, PAPER_Z1, PAPER_Z0, TABLE_Y + 0.0015, T_SHADOW)
  /*
   * A second sheet, slid half under the first at the table's south end and
   * turned 7.5 degrees off it.
   *
   * "more than one sheet if that helps, at very low contrast" — it helps for
   * one reason: two sheets squared up with each other read as one sheet with a
   * line drawn on it, and the angle is what makes the pair read as paper. Its
   * south edge is 1.6cm inside the main sheet's, in the LEFT margin; its north
   * edge is the one thing in this arrangement that does cross the card area,
   * at `T_SHEET` — seven values of green in dark and six in light, which moves
   * the contrast ratio under `--text` by 0.15 of a stop.
   */
  slip(s, -2.35, -0.72, 0.52, 0.44, 0.13, TABLE_Y + 0.006, T_SHEET)
  /*
   * And two more, because two sheets are an accident and three are a table
   * somebody works at. They are the only thing in this frame that stops the
   * middle 80% of it being one value, and they can be — the measured card box
   * is a rectangle, so the whole of it is fair game for an edge as long as the
   * edge is small enough. Theirs are 6 and 7 values of green.
   *
   * One is a shade brighter than `T_PAPER` and one a shade darker, which is
   * what a stack of paper that has been handled looks like and what a set of
   * identically toned rectangles does not. All three are laid at different
   * angles and none of them is square to the sheet under it: two sheets squared
   * up read as one sheet with a line on it, which is the failure this is for.
   *
   * They are disjoint in plan — checked, not assumed — so the 6mm they float
   * above the sheet can be the same 6mm for all three and nothing z-fights.
   */
  slip(s, -1.55, -2.05, 0.4, 0.6, -0.19, TABLE_Y + 0.006, T_PAPER + 0.045)
  if (props >= 1) slip(s, -2.62, -1.85, 0.26, 0.22, 0.35, TABLE_Y + 0.006, T_SHEET)
  wood()
  /*
   * **Nothing else stands on this table, and that is the second attempt.**
   *
   * The first put a lantern and two loose sheets at its north end, on the
   * reasoning that the north end is out of the way. It is not: the camera looks
   * WEST at this beat, so the frame's horizontal axis runs along z and north is
   * the RIGHT-HAND EDGE, not the top. Rendered, the lantern was a dark box in
   * the top right corner and the sheets a brighter step under it, both of them
   * inside the middle 78% of the frame where `.shell` puts the cards.
   *
   * **The camera changed and the answer did not.** The new one is closer and
   * lower, so its footprint is SMALLER — 1.40 by 1.99 at `ST_ROOM_SET` against
   * a sheet 1.96 by 2.54 — which means even less of this table is out of frame
   * than before, not more. The props stay on the desk and the mantel, where the
   * turn and the lift both pass them. What is left here is one flat field,
   * which is what the owner asked for: "a big paper or something to be a solid
   * background when the UI is showing the project cards".
   */

  // ── the small desk, the chair, and the corners ───────────────────────────
  const dcx = (DESK_X0 + DESK_X1) / 2
  const dcz = (DESK_Z0 + DESK_Z1) / 2
  box(s, dcx, DESK_Y - 0.06, dcz, DESK_X1 - DESK_X0, 0.06, DESK_Z0 - DESK_Z1, T_TABLE, true)
  for (const lz of [DESK_Z0 - 0.14, DESK_Z1 + 0.14]) {
    post(s, DESK_X0 + 0.14, IN_Y, lz, 0.07, DESK_Y - 0.06 - IN_Y, T_TABLE, 0.9)
  }
  // The lantern that used to be on the big table, and a stack of books beside
  // it. The desk is where they belong: it is in frame for the whole turn and
  // for none of the room's own leg, so they are read as the room being
  // lived in rather than as things standing on the backdrop.
  box(s, dcx - 0.42, DESK_Y, dcz + 0.34, 0.17, 0.28, 0.17, T_TIMBER)
  if (props >= 1) box(s, dcx + 0.34, DESK_Y, dcz - 0.24, 0.3, 0.12, 0.22, T_TIMBER)
  // A candle on the mantel, which is the other warm anchor and the one thing in
  // the room above waist height that is not structure. It is in frame at the
  // threshold and again through the lift.
  box(s, FIRE_X + 0.66, MANTEL_Y + MANTEL_T, FP_FZ - 0.26, 0.08, 0.22, 0.08, T_TIMBER)
  /*
   * The kettle, standing on the hearth slab at the east end of it.
   *
   * The owner's list is "a rug, a stack of firewood beside the hearth, a
   * kettle or a pot, shelves, a lamp on the desk, a blanket over a chair back",
   * and this is the one on it that had no answer anywhere in the room. It is at
   * x = -0.53, which is 10cm clear of the firebox opening's east jamb at -0.63,
   * so it stands BESIDE the fire rather than in front of it and no tongue is
   * ever drawn behind it. 12cm across and 15 tall, which is a kettle.
   *
   * It costs eight triangles and it is the brightest small solid in the room:
   * 55cm from the flame and facing it, so `hearthAt` gives it the whole of
   * `HEARTH_MAX` on its west face and almost nothing on its east one, which is
   * a lit object against a dark room rather than a box.
   */
  box(s, FIRE_X + 0.72, IN_Y + 0.07, FP_FZ + 0.3, 0.12, 0.15, 0.12, T_TABLE)
  chair(s, 0.62, -1.42, -0.5)
  // North-west: the woodpile beside the hearth, which is the one prop in the
  // room that explains the fire. North-east: a dresser under the east window,
  // which is the one thing stopping that corner being a bare wall behind the
  // desk. Both are chest height or lower, so neither is ever in the frame the
  // reader reads over — they are what the TURN passes.
  box(s, -2.7, IN_Y, -5.06, 0.78, 0.62, 0.74, T_TABLE)
  // Two split logs lying across the top of the stack, ends toward the room.
  // The box under them is a stack of firewood only because it is next to a
  // fire; these are what actually say so, and they are 16 triangles at the one
  // place in the room where the light is strongest and the geometry is
  // otherwise a cube.
  logAt(s, -2.7, IN_Y + 0.69, -5.2, 0.36, 0.075, T_TIMBER, 0.4)
  logAt(s, -2.72, IN_Y + 0.69, -4.98, 0.36, 0.075, T_TIMBER, 1.7)
  if (props >= 1) {
    for (let i = 0; i < 3; i++) {
      const ly = IN_Y + 0.12 + i * 0.2
      panel(s, -2.98 + (i % 2) * 0.3, -2.78 + (i % 2) * 0.3, ly, ly + 0.16, -4.68, T_TIMBER)
    }
    /*
     * A shelf on the north wall, east of the fireplace, with two small things
     * on it. "Shelves" is on the owner's list and this is the wall that had
     * nothing at all: the fireplace stops at x = -0.2 and the north-east
     * quarter above desk height was deliberately left empty because "the camera
     * is looking west or down for every frame it is in the room".
     *
     * That is true from the TURN onward and it is not true at the threshold,
     * which is the beat this pass had to fix. `ST_THRESH` aims at (-1.05, 1.5,
     * -5.5) with a 54-degree frame from 5m out, so the north wall is in shot
     * from x = -3.9 to +1.4 — and everything east of the fireplace was a bare
     * dark rectangle filling the right third of the first frame of the room.
     * Six triangles of shelf and sixteen of what is on it.
     */
    lie(s, -0.05, 1.15, -5.92, -5.66, 1.5, T_TIMBER)
    quad(s, [-0.05, 1.46, -5.66], [1.15, 1.46, -5.66], [1.15, 1.5, -5.66], [-0.05, 1.5, -5.66], T_TIMBER, [0, 0, 1])
    box(s, 0.18, 1.5, -5.79, 0.16, 0.19, 0.16, T_TABLE)
    box(s, 0.74, 1.5, -5.79, 0.34, 0.1, 0.2, T_TIMBER)
    box(s, 2.42, IN_Y, -4.72, 1.2, 0.86, 0.5, T_TABLE)
    for (let i = 0; i < 2; i++) {
      panel(s, 1.94, 2.9, IN_Y + 0.26 + i * 0.3, IN_Y + 0.3 + i * 0.3, -4.46, T_TIMBER)
    }
  }
  // The rug, cut 3 by 2 for the same reason the floor is: it lies between the
  // hearth and the table, which is exactly the stretch the fire's falloff is
  // steepest over, and a rug that took ONE value across 2.7m would be a flat
  // patch sitting on a graded floor — the one place the subdivision would be
  // visible by its absence. It does more per triangle than anything else in the
  // room: the one thing between hearth and table that is neither floor nor
  // furniture, landing exactly where the camera's pan crosses the floor.
  field(s, -2.9, -0.2, -4.5, -2.7, IN_Y + 0.008, T_RUG, 3, 2)
  base()

  s.hearth = false
}

/**
 * The fireplace, set into the north wall.
 *
 * Seven pieces: a surround standing proud of the wall with the firebox cut
 * through it, the firebox's own five inward-facing surfaces, THREE LOGS burning
 * in it, a mantel beam, the breast rising off it to the ceiling, and a hearth
 * slab on the floor in front.
 *
 * The firebox is only reachable at all because `interior` cuts the north wall
 * round its opening. It did not, for as long as this fireplace has existed, and
 * the note there has the measurement — it is the single largest reason the fire
 * read as a flat shape.
 *
 * The breast is capped along the ROOF's own slope rather than square, and that
 * is not decoration: `ceilAt` is a straight line in x and the breast is 1.6
 * wide, so a square top at any height either pokes through the roof on its west
 * side or leaves a wedge of daylight on its east one. Capped on the slope its
 * top edge lies exactly in the ceiling plane, which is watertight by
 * construction at every width somebody might give it later.
 */
function hearth(s: Solid) {
  const fl = FIRE_X - FP_HW
  const fr = FIRE_X + FP_HW
  const ol = FIRE_X - FP_OPEN_HW
  const or_ = FIRE_X + FP_OPEN_HW
  // the surround's face, in four strips round the opening
  const face = (x0: number, x1: number, y0: number, y1: number) =>
    quad(s, [x0, y0, FP_FZ], [x1, y0, FP_FZ], [x1, y1, FP_FZ], [x0, y1, FP_FZ], T_STONE, [0, 0, 1])
  face(fl, ol, IN_Y, MANTEL_Y)
  face(or_, fr, IN_Y, MANTEL_Y)
  face(ol, or_, IN_Y, FP_OPEN_Y0)
  face(ol, or_, FP_OPEN_Y1, MANTEL_Y)
  // its two returns to the wall
  for (const sign of [-1, 1]) {
    const sx = FIRE_X + sign * FP_HW
    quad(s, [sx, IN_Y, IN_Z1], [sx, IN_Y, FP_FZ], [sx, MANTEL_Y, FP_FZ], [sx, MANTEL_Y, IN_Z1], T_STONE, [sign, 0, 0])
  }
  /*
   * The firebox: back, two sides, lintel and floor, all facing in and all at
   * T_HEARTH, which is nearly black.
   *
   * **`s.hearth` goes OFF for it, and that is the one exemption in the room.**
   * `hearthAt` puts the fire's baked light on every facet that faces it, and
   * the firebox's five surfaces face it from 30cm: at full strength the boost
   * is 0.455 of tone, which took the inside of the firebox to rgb (185,185,190)
   * in light theme — paler than the surround around it and paler than the wall.
   * The render is unambiguous about how wrong that looks: the darkest thing in
   * any room with a fire in it is the inside of the fireplace, and the flames
   * have nothing to be read against without it.
   *
   * It is also true rather than convenient. A firebox is soot, and the light
   * this term models is the light REFLECTING off a surface; soot at 500 degrees
   * an inch from a flame reflects nothing worth drawing.
   */
  s.hearth = false
  quad(s, [ol, FP_OPEN_Y0, FP_BZ], [or_, FP_OPEN_Y0, FP_BZ], [or_, FP_OPEN_Y1, FP_BZ], [ol, FP_OPEN_Y1, FP_BZ], T_HEARTH, [0, 0, 1])
  for (const sign of [-1, 1]) {
    const sx = FIRE_X + sign * FP_OPEN_HW
    quad(s, [sx, FP_OPEN_Y0, FP_BZ], [sx, FP_OPEN_Y0, FP_FZ], [sx, FP_OPEN_Y1, FP_FZ], [sx, FP_OPEN_Y1, FP_BZ], T_HEARTH, [-sign, 0, 0])
  }
  quad(s, [ol, FP_OPEN_Y1, FP_BZ], [or_, FP_OPEN_Y1, FP_BZ], [or_, FP_OPEN_Y1, FP_FZ], [ol, FP_OPEN_Y1, FP_FZ], T_HEARTH, [0, -1, 0])
  lie(s, ol, or_, FP_BZ, FP_FZ, FP_OPEN_Y0, T_HEARTH)
  s.hearth = true
  /*
   * ── THE LOG BED ──────────────────────────────────────────────────────────
   *
   * Three split logs in the firebox, and the exemption above stops at them.
   *
   * "a hot core and a cooler tip, embers if they are cheap, and a LOG BED under
   * it" — this is the log bed, and it is the one thing in this file that has to
   * be both solid and lit. The firebox's five faces are exempted from
   * `hearthAt` because soot reflects nothing; a burning log is not soot, it is
   * the fuel, and it is the brightest solid object in the room. At 30cm from
   * `HEARTH_P` and facing it these take the whole of `HEARTH_MAX`, which is the
   * one place in the room that cap is actually reached and the reason it
   * exists.
   *
   * `T_LOG` at 0.055 is a hair off the firebox's own 0.04 — charred wood, not
   * pale timber — so what makes them read is the fire's light on them and
   * nothing else. Two lying across the back and one rolled forward, which is
   * how a fire that has been burning a while ends up. 24 triangles, and they
   * are the difference between flames standing on a black floor and flames
   * standing on something burning.
   *
   * **Two behind the flame plane and one low in front of it, and that split is
   * the whole placement.** The tongues are billboarded through `FIRE_Z`, so a
   * log at FIRE_Z is a log THROUGH the fire: written with all three near the
   * plane, the render came back with a dark slab lying across the middle of
   * every tongue and the fire's brightest row — its root — hidden behind it
   * entirely. The two at FIRE_Z − 0.15 are the mass the flames are seen
   * against, and the one at + 0.15 tops out at FIRE_Y + 0.13, which is the
   * bottom fifth of a 66cm tongue: enough that the fire is standing ON
   * something, not enough to cover what makes it bright.
   */
  logAt(s, FIRE_X - 0.06, FIRE_Y + 0.06, FIRE_Z - 0.15, 0.34, 0.075, T_LOG, 0.35)
  logAt(s, FIRE_X - 0.02, FIRE_Y + 0.17, FIRE_Z - 0.19, 0.26, 0.062, T_LOG, 0.9)
  logAt(s, FIRE_X + 0.04, FIRE_Y + 0.06, FIRE_Z + 0.15, 0.31, 0.07, T_LOG, 1.9)
  // the mantel, projecting 10cm past the surround, and read from underneath
  box(s, FIRE_X, MANTEL_Y, (IN_Z1 + FP_FZ - 0.1) / 2, FP_HW * 2 + 0.26, MANTEL_T, FP_FZ - 0.1 - IN_Z1, T_TIMBER, true)
  // the breast, capped on the roof's slope
  const by = MANTEL_Y + MANTEL_T
  const bl = FIRE_X - 0.8
  const br = FIRE_X + 0.8
  quad(s, [bl, by, FP_FZ], [br, by, FP_FZ], [br, ceilAt(br), FP_FZ], [bl, ceilAt(bl), FP_FZ], T_STONE, [0, 0, 1])
  for (const bx of [bl, br]) {
    quad(
      s,
      [bx, by, IN_Z1],
      [bx, by, FP_FZ],
      [bx, ceilAt(bx), FP_FZ],
      [bx, ceilAt(bx), IN_Z1],
      T_STONE,
      [bx < FIRE_X ? -1 : 1, 0, 0],
    )
  }
  // The hearth slab on the floor. Exactly the surround's own width and no
  // wider: the woodpile stands at x = -3.09 to -2.31 and the slab's west edge
  // is at -2.30, so the two meet without one sinking into the other.
  box(s, FIRE_X, IN_Y, FP_FZ + 0.33, FP_HW * 2, 0.07, 0.66, T_STONE)
}

/**
 * A chair, pulled out, facing the desk — which on the floor plan is the one
 * piece of furniture that is not against a wall.
 *
 * `face` is the direction it is turned, in radians from +z. It is a seat, a
 * back and four legs, and it costs 38 triangles: the most expensive prop in the
 * room per unit of meaning, and it earns it by being the thing that says
 * somebody sits here. The camera passes it during the turn and never settles on
 * it, which is why it is a silhouette rather than a piece of joinery.
 */
function chair(s: Solid, cx: number, cz: number, face: number) {
  const c = Math.cos(face)
  const sn = Math.sin(face)
  const at = (u: number, v: number): [number, number] => [cx + c * u - sn * v, cz + sn * u + c * v]
  const seat = IN_Y + 0.44
  const [sx, sz] = at(0, 0)
  box(s, sx, seat, sz, 0.46, 0.05, 0.46, T_TABLE, true)
  for (const u of [-0.18, 0.18]) {
    for (const v of [-0.18, 0.18]) {
      const [lx, lz] = at(u, v)
      post(s, lx, IN_Y, lz, 0.032, seat - IN_Y, T_TABLE, 0.3)
    }
  }
  // The back, behind the seat rather than beside it: `at(0, -0.22)` is one
  // radius back along the chair's own facing, so turning the chair turns it.
  const [bx, bz] = at(0, -0.22)
  box(s, bx, seat + 0.05, bz, 0.44, 0.42, 0.05, T_TABLE, true)
  /*
   * A blanket over that back — the last item on the owner's list, and four
   * triangles.
   *
   * It is drawn as two quads hanging off the top rail rather than as a box,
   * because a blanket has no thickness worth two more faces and because the
   * two sides want different tones: the room-facing one takes `T_RUG` at the
   * chair's own angle and the far one is turned away from both lights. It hangs
   * 26cm on the seat side and 18 on the other, which is a cloth thrown over a
   * chair rather than folded on one.
   *
   * `T_RUG` and not a tone of its own: it and the rug are the two soft things
   * in the room and there is nothing to be gained by making them disagree.
   */
  const top = seat + 0.05 + 0.42
  const drape = (v: number, h: number, out: V) => {
    const [ax, az] = at(-0.19, v)
    const [cx2, cz2] = at(0.19, v)
    quad(s, [ax, top - h, az], [cx2, top - h, cz2], [cx2, top + 0.02, cz2], [ax, top + 0.02, az], T_RUG, out)
  }
  // The chair's own +v direction in world is (-sin, 0, cos) — see `at`. The
  // seat-side drape faces that way and the one behind the back faces the other,
  // and stating it rather than trusting vertex order is `tri`'s whole rule: a
  // single quad wound the wrong way is not a dark quad, it is no quad at all.
  drape(-0.16, 0.26, [-sn, 0, c])
  drape(-0.28, 0.18, [sn, 0, -c])
}

/**
 * A conifer, drawn the way `props/pine-faceted-pair-dark.webp` draws one.
 *
 * Go and look at that file before changing this. Three things in it are the
 * shape, and the old version here had none of them:
 *
 * - **A bare trunk below the lowest branches**, and a trunk visible again
 *   through the gaps. The reference's trunk is a third of the tree's height.
 *   The old conifer buried its trunk under a cone that started at 0.55 of the
 *   scale, so what it drew was a bush.
 * - **Six to nine tiers, not three.** The rhythm of many narrow skirts IS the
 *   silhouette; three fat cones read as a child's drawing of a tree.
 * - **Every skirt is NOTCHED and it DROOPS.** Alternate rim points pull in and
 *   hang below the tier's own base, which is what makes the outline a row of
 *   hooks rather than a circle. A smooth cone cannot look like this art.
 *
 * Tiers rise slightly in tone toward the tip — the reference does the same,
 * and it is true besides: the top of a tree is what the sky reaches.
 *
 * `snow` lays a pale facet along every other segment of the lower skirts. It
 * is the difference between a dark forest and a SNOWY one, and it is only
 * bought for the near rank, where it is the only place it can be seen.
 *
 * `tall` and `bareK` are the rank's own proportions, and rank 3 exists
 * entirely for them. A tree in the near foreground of a real forest shot is
 * not a small tree drawn big; it is a MATURE tree, bare for most of its height,
 * whose crown is out of the frame altogether. At bareK 2.55 and scale 3 the
 * lowest branch is at 7.7m, which from six metres away is two and a half
 * frames above the top edge — so what the reader gets is a dark vertical with
 * no top, which is the whole point of it. The same tree at 50m is a tall pine
 * with a high crown, which is also correct, and is why these are trees rather
 * than bare posts.
 */
function conifer(
  s: Solid,
  x: number,
  z: number,
  y0: number,
  scale: number,
  tiers: number,
  seg: number,
  rot: number,
  base: number,
  snow: boolean,
  tall = 4.3,
  bareK = 1.15,
) {
  const top = tall * scale
  const bare = bareK * scale
  // The trunk runs the whole height: the gaps between skirts are where a real
  // pine shows its own stem, and stopping it at the first tier leaves a tree
  // that is hollow wherever you can see into it.
  post(s, x, y0, z, 0.115 * scale, top * 0.82, T_TRUNK, rot * 1.7)
  const span = top - bare
  for (let i = 0; i < tiers; i++) {
    const k = i / tiers
    const ty = y0 + bare + span * k * 0.88
    const r = (0.28 + 1.35 * Math.pow(1 - k, 0.85)) * scale
    const h = (span / tiers) * 2.25
    skirt(s, x, ty, z, r, h, base * (1 + k * 0.22), seg, rot + i * 0.8, snow && i < tiers - 2)
  }
}

/** One drooping, notched tier. See `conifer`. */
function skirt(
  s: Solid,
  cx: number,
  y0: number,
  cz: number,
  r: number,
  h: number,
  base: number,
  seg: number,
  rot: number,
  snow: boolean,
) {
  const apex: V = [cx, y0 + h, cz]
  const rim = (i: number): V => {
    const a = rot + (i / seg) * Math.PI * 2
    const notch = i % 2 === 1
    const rr = r * (notch ? 0.66 : 1)
    return [cx + Math.cos(a) * rr, y0 - (notch ? 0 : 0.16 * r), cz + Math.sin(a) * rr]
  }
  for (let i = 0; i < seg; i++) {
    const p0 = rim(i)
    const p1 = rim(i + 1)
    const mx = (p0[0] + p1[0]) / 2 - cx
    const mz = (p0[2] + p1[2]) / 2 - cz
    tri(s, p0, p1, apex, base, [mx, 0.4, mz])
    // Snow sits on top of the branch, so it is a second facet a hand's width
    // in from the tip and tilted flatter — an up-facing normal, which is what
    // makes `tri` give it the full lit tone.
    if (snow && i % 2 === 0) {
      const q0: V = [cx + (p0[0] - cx) * 0.74, p0[1] + 0.1 * r, cz + (p0[2] - cz) * 0.74]
      const q1: V = [cx + (p1[0] - cx) * 0.74, p1[1] + 0.1 * r, cz + (p1[2] - cz) * 0.74]
      tri(s, q0, q1, [cx, y0 + h * 0.55, cz], T_SNOW, [mx * 0.3, 1, mz * 0.3])
    }
  }
}

/* ────────────────────────────────────────────────────────────────────────────
   The hut — what the Cebu theme stands where the cabin is
   ──────────────────────────────────────────────────────────────────────────

   A bahay kubo: the same footprint, the same door, the same two windows and
   the same room — every number the walk and the card grid are measured
   against is untouched — with the walls lifted onto stilts, a steep thatched
   hip roof in place of the gables, bamboo battens across sawali panels in
   place of log courses, coconut palms where the pines were, and the sea where
   the treeline was. Built by the same helpers, in the same voice, so it sits
   beside the Cebu art kit the way the cabin sits beside the winter one.
   ──────────────────────────────────────────────────────────────────────────*/

/** Where the hut's walls start: 14cm below the deck, so a strip of open air
 *  and the stilts show under the floor. The floor itself (IN_Y) is unmoved. */
const HUT_BASE = DECK_Y - 0.14

/** A steep four-sided thatch roof with a short ridge and wide eaves. */
function hipRoof(s: Solid) {
  s.pigment = PIG_THATCH
  const EX = EAVE_X + 0.5
  const EY = EAVE_Y
  const RY = RIDGE_Y + 0.45
  const Z0 = ROOF_Z0 + 0.75
  const Z1 = ROOF_Z1 - 0.75
  const RZ0 = ROOF_Z0 - 1.35
  const RZ1 = ROOF_Z1 + 1.35
  for (const sign of [-1, 1]) {
    const ex = sign * EX
    const up: V = [sign * -0.46, 0.89, 0]
    quad(s, [ex, EY, Z0], [0, RY, RZ0], [0, RY, RZ1], [ex, EY, Z1], T_ROOF, up)
    quad(
      s,
      [ex, EY - ROOF_T, Z0],
      [0, RY - ROOF_T, RZ0],
      [0, RY - ROOF_T, RZ1],
      [ex, EY - ROOF_T, Z1],
      T_ROOF * 0.8,
      [-up[0], -up[1], 0],
    )
    // fascia along the long eave
    quad(s, [ex, EY - ROOF_T, Z1], [ex, EY - ROOF_T, Z0], [ex, EY, Z0], [ex, EY, Z1], T_TRIM, [sign, 0, 0])
    // three courses of thatch lying on the slope, reading as layers at 12m
    for (let i = 1; i <= 3; i++) {
      const k = i / 4
      const x = ex * (1 - k)
      const y = EY + (RY - EY) * k + 0.03
      const za = Z0 - (Z0 - RZ0) * k
      const zb = Z1 + (RZ1 - Z1) * k
      const x2 = ex * (1 - k + 0.035)
      const y2 = y - (RY - EY) * 0.035
      quad(s, [x2, y2, za - 0.05], [x, y, za], [x, y, zb], [x2, y2, zb + 0.05], T_ROOF * 0.72, up)
    }
  }
  // the two hips
  tri(s, [-EX, EY, Z0], [EX, EY, Z0], [0, RY, RZ0], T_ROOF * 0.94, [0, 0.55, 1])
  tri(s, [EX, EY, Z1], [-EX, EY, Z1], [0, RY, RZ1], T_ROOF * 0.94, [0, 0.55, -1])
  tri(s, [EX, EY - ROOF_T, Z0], [-EX, EY - ROOF_T, Z0], [0, RY - ROOF_T, RZ0], T_ROOF * 0.8, [0, -0.55, 1])
  tri(s, [-EX, EY - ROOF_T, Z1], [EX, EY - ROOF_T, Z1], [0, RY - ROOF_T, RZ1], T_ROOF * 0.8, [0, -0.55, -1])
  quad(s, [-EX, EY - ROOF_T, Z0], [EX, EY - ROOF_T, Z0], [EX, EY, Z0], [-EX, EY, Z0], T_TRIM, [0, 0, 1])
  quad(s, [EX, EY - ROOF_T, Z1], [-EX, EY - ROOF_T, Z1], [-EX, EY, Z1], [EX, EY, Z1], T_TRIM, [0, 0, -1])
  // the ridge cap
  s.pigment = PIG_WOOD
  box(s, 0, RY - 0.04, (RZ0 + RZ1) / 2, 0.34, 0.16, RZ0 - RZ1 + 0.24, T_TRIM)
  s.pigment = PIG_BASE
}

/** Bamboo battens over sawali: what makes a hut a hut at twelve metres. */
function sawali(s: Solid) {
  s.pigment = PIG_WOOD
  const top = WALL_H - 0.02
  // the front: a post either side of the door and one past each window
  for (const x of [-2.72, -1.02, 1.02, 2.72]) {
    post(s, x, HUT_BASE, CAB_Z0 + 0.06, 0.05, top - HUT_BASE, T_TIMBER, 0.3)
  }
  // the west flank, which the walk looks straight down: clear of its window
  for (const z of [-1.1, -4.75, -5.7]) {
    post(s, -CAB_HW - 0.06, HUT_BASE, z, 0.05, top - HUT_BASE, T_TIMBER, 0.3)
  }
  // top plates along the front and the flank, and a lighter mid band
  box(s, 0, top - 0.08, CAB_Z0 + 0.05, CAB_HW * 2 + 0.24, 0.1, 0.1, T_TIMBER)
  box(s, -CAB_HW - 0.05, top - 0.08, (CAB_Z0 + CAB_Z1) / 2, 0.1, 0.1, CAB_Z0 - CAB_Z1 + 0.24, T_TIMBER)
  panel(s, -CAB_HW, -DOOR_HW - 0.2, 1.08, 1.14, CAB_Z0 + 0.012, T_TRIM)
  panel(s, DOOR_HW + 0.2, CAB_HW, 1.08, 1.14, CAB_Z0 + 0.012, T_TRIM)
  s.pigment = PIG_BASE
}

/** The posts the hut stands on, and the underside of its floor. */
function stilts(s: Solid) {
  s.pigment = PIG_WOOD
  const xs = [-CAB_HW + 0.12, -1.1, 1.1, CAB_HW - 0.12]
  const zs = [CAB_Z0 - 0.12, -3, CAB_Z1 + 0.12]
  for (const x of xs) {
    for (const z of zs) {
      if (Math.abs(x) < 2 && z !== -3) continue
      post(s, x, PLANT_Y - 0.05, z, 0.09, HUT_BASE - PLANT_Y + 0.08, T_TIMBER, 0.6)
    }
  }
  quad(
    s,
    [-CAB_HW, HUT_BASE, CAB_Z1],
    [CAB_HW, HUT_BASE, CAB_Z1],
    [CAB_HW, HUT_BASE, CAB_Z0],
    [-CAB_HW, HUT_BASE, CAB_Z0],
    T_BEAM,
    [0, -1, 0],
  )
  s.pigment = PIG_BASE
}

/**
 * A tapered limb between two arbitrary points: a prism whose two ends have
 * different radii and whose axis can point anywhere.
 *
 * `post` cannot do this. It builds a prism with ONE cross-section, extruded
 * straight up — so a trunk made of seven posts at seven heights is seven
 * vertical cylinders offset sideways, and the offsets show as a staircase with
 * a step at every joint. The site owner's report is exactly that: "it looks
 * like it's being stacked directly up and none of the trunk parts are bent."
 *
 * Here the ring at each end is built in the plane perpendicular to the axis, so
 * consecutive limbs share an edge and the trunk reads as one curved shaft.
 * Three sides, like `post`, because the whole scene is faceted and a rounder
 * trunk would be the only smooth thing in it.
 */
function limb(s: Solid, a: V, b: V, r0: number, r1: number, base: number, rot: number, sides = 3) {
  const ax = b[0] - a[0]
  const ay = b[1] - a[1]
  const az = b[2] - a[2]
  const len = Math.hypot(ax, ay, az) || 1
  const ux = ax / len
  const uy = ay / len
  const uz = az / len
  // any vector not parallel to the axis, crossed twice for an orthonormal pair
  const hx = Math.abs(uy) < 0.9 ? 0 : 1
  let px = uy * (hx ? 0 : 1) - uz * 0
  let py = uz * hx - ux * (hx ? 0 : 1)
  let pz = ux * 0 - uy * hx
  const pl = Math.hypot(px, py, pz) || 1
  px /= pl
  py /= pl
  pz /= pl
  const qx = uy * pz - uz * py
  const qy = uz * px - ux * pz
  const qz = ux * py - uy * px
  const A: V[] = []
  const B: V[] = []
  for (let i = 0; i < sides; i++) {
    const t = rot + (i / sides) * Math.PI * 2
    const c = Math.cos(t)
    const sn = Math.sin(t)
    A.push([a[0] + (px * c + qx * sn) * r0, a[1] + (py * c + qy * sn) * r0, a[2] + (pz * c + qz * sn) * r0])
    B.push([b[0] + (px * c + qx * sn) * r1, b[1] + (py * c + qy * sn) * r1, b[2] + (pz * c + qz * sn) * r1])
  }
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides
    const nx = (A[i][0] + A[j][0]) / 2 - a[0]
    const ny = (A[i][1] + A[j][1]) / 2 - a[1]
    const nz = (A[i][2] + A[j][2]) / 2 - a[2]
    quad(s, A[i], A[j], B[j], B[i], base, [nx, ny, nz])
  }
}

/**
 * A coconut palm.
 *
 * ── what was here, and why it read as an umbrella ──────────────────────────
 * The crown was eight FLAT TRIANGLE PAIRS, every one of them starting at a
 * single point at the top of the trunk and running straight out to a tip. Eight
 * flat spokes radiating from one hub, all at the same droop, is a parasol —
 * which is what the site owner called it: "the leaves on the trees look very
 * off, very silly. They look like low-poly umbrellas."
 *
 * A frond is not a spoke. Three things make it one, and all three are here:
 *
 *   **It is a CURVE, not a line.** The midrib leaves the crown pointing UP,
 *   carries on out, and falls away under its own weight — `rise` then `droop`,
 *   sampled over `SPANS` so the fall is visible along the blade rather than
 *   being a single angle chosen at the base.
 *
 *   **It has a WIDTH that goes somewhere.** Narrow at the petiole, widest a
 *   third of the way out, closed to nothing at the tip. `sin(pi * t^0.7)` is
 *   that shape in one expression.
 *
 *   **It is FOLDED along its midrib.** The two halves drop below the rib by a
 *   fraction of the local width, so the blade catches light on one side and
 *   shadow on the other and has a spine you can see. A flat quad cannot.
 *
 * The fronds are also not all at one angle: `TILT` spreads their base
 * elevation from nearly upright to nearly horizontal, and length and tone vary
 * per frond, so the crown has an inside and an outside.
 *
 * ── and the trunk bends ────────────────────────────────────────────────────
 * Nine samples down a curve with both a lean and a slight S in it, joined by
 * `limb` — which builds each ring perpendicular to the LOCAL axis, so the
 * segments share their edges instead of stepping past each other.
 *
 * ── cost ───────────────────────────────────────────────────────────────────
 * 8 limbs x 3 sides x 2 = 48 triangles of trunk, and 9 fronds x 4 spans x 2
 * halves x 2 = 144 of crown, against the 58 the parasol cost. It is built once
 * per world and uploaded once; nothing here is per frame.
 */
function palm(s: Solid, x: number, z: number, y0: number, scale: number, rot: number, tone: number, tall: number) {
  const h = tall * scale * 0.92
  const lean = 0.2 * h
  const dirx = Math.cos(rot)
  const dirz = Math.sin(rot)

  /** The trunk's centre line: lean out quadratically, with a slight S back. */
  const spine = (t: number): V => {
    const bend = t * t * 0.86 + t * 0.14
    const s2 = Math.sin(t * Math.PI) * 0.06
    return [
      x + dirx * lean * bend - dirz * lean * s2,
      y0 + h * t,
      z + dirz * lean * bend + dirx * lean * s2,
    ]
  }

  s.pigment = PIG_WOOD
  const SEG = 8
  for (let i = 0; i < SEG; i++) {
    const t0 = i / SEG
    const t1 = (i + 1) / SEG
    const r0 = (0.155 - 0.098 * t0) * scale
    const r1 = (0.155 - 0.098 * t1) * scale
    /* A coconut trunk is pale grey-tan, not mahogany: T_TRUNK is 0.1, which is
       the winter pine's bark and sits at the dark end of the wood ramp. +0.3
       puts the shaft in the middle of it and the taper adds a little light
       toward the crown. */
    limb(s, spine(t0), spine(t1), r0, r1, T_TRUNK + 0.3 + 0.12 * t0, rot + t0 * 0.5)
  }

  const C = spine(1)
  const cx = C[0]
  const cy = C[1]
  const cz = C[2]

  s.pigment = PIG_LEAF
  // twelve, not nine: nine leaves gaps you can see the sky through from the
  // side, and a coconut crown is a full sphere of fronds seen from any angle.
  const N = 12
  const SPANS = 4
  for (let i = 0; i < N; i++) {
    // golden-angle spacing so nine fronds never line up into a star
    const a = rot * 0.4 + i * 2.399963
    const ca = Math.cos(a)
    const sa = Math.sin(a)
    const L = (1.3 + 0.45 * (((i * 5) % 4) / 3)) * scale
    // base elevation: some fronds stand up, some are already falling
    // base elevation spread wider than before so a few stand almost upright
    const rise = (0.24 + 0.52 * (((i * 3) % 5) / 4)) * L
    const droop = (1.02 + 0.5 * ((i % 3) / 2)) * L
    const W = (0.17 + 0.05 * ((i % 2) ? 1 : 0)) * scale
    const lit = tone * (0.82 + 0.34 * (((i * 7) % 5) / 4))

    const rib = (t: number): V => [
      cx + ca * L * t,
      cy + 0.14 * scale + rise * t - droop * t * t,
      cz + sa * L * t,
    ]
    const wide = (t: number) => W * Math.sin(Math.PI * Math.pow(t, 0.7))

    let m0 = rib(0)
    let w0 = wide(0)
    for (let k = 0; k < SPANS; k++) {
      const t1 = (k + 1) / SPANS
      const m1 = rib(t1)
      const w1 = wide(t1)
      // the fold: each half drops below the rib by 45% of the local width
      const l0: V = [m0[0] - sa * w0, m0[1] - w0 * 0.45, m0[2] + ca * w0]
      const l1: V = [m1[0] - sa * w1, m1[1] - w1 * 0.45, m1[2] + ca * w1]
      const r0v: V = [m0[0] + sa * w0, m0[1] - w0 * 0.45, m0[2] - ca * w0]
      const r1v: V = [m1[0] + sa * w1, m1[1] - w1 * 0.45, m1[2] - ca * w1]
      const shade = lit * (1 - 0.14 * (k / SPANS))
      quad(s, m0, l0, l1, m1, shade, [-sa * 0.4, 1, ca * 0.4])
      quad(s, m0, m1, r1v, r0v, shade * 0.88, [sa * 0.4, 1, -ca * 0.4])
      m0 = m1
      w0 = w1
    }
  }

  s.pigment = PIG_WOOD
  for (let i = 0; i < 3; i++) {
    const a = rot + i * 2.1
    stone(s, cx + Math.cos(a) * 0.15 * scale, cz + Math.sin(a) * 0.15 * scale, cy - 0.12 * scale, 0.09 * scale, 0.13 * scale, T_TREE, a)
  }
  s.pigment = PIG_BASE
}

/** The sea, from a little past the sand patch out to where the painted
 *  lagoon stands: one plane, a foam line at the shore, a few crests. */
const SHORE_Z = -24
function sea(s: Solid) {
  s.pigment = PIG_WATER
  const Y = PLANE_Y + 0.05
  quad(s, [-PLANE_HX, Y, -71.8], [PLANE_HX, Y, -71.8], [PLANE_HX, Y, SHORE_Z], [-PLANE_HX, Y, SHORE_Z], 0.6, [0, 1, 0])
  quad(s, [-PLANE_HX, Y + 0.015, SHORE_Z + 1.1], [PLANE_HX, Y + 0.015, SHORE_Z + 1.1], [PLANE_HX, Y + 0.015, SHORE_Z - 0.4], [-PLANE_HX, Y + 0.015, SHORE_Z - 0.4], 0.98, [0, 1, 0])
  for (let i = 0; i < 7; i++) {
    const z = SHORE_Z - 2.4 - i * 3.6
    const x0 = -70 + i * 11
    const x1 = x0 + 30 + i * 7
    quad(s, [x0, Y + 0.02, z], [x1, Y + 0.02, z], [x1, Y + 0.02, z - 0.5], [x0, Y + 0.02, z - 0.5], 0.95, [0, 1, 0])
  }
  s.pigment = PIG_BASE
}

/** A small pool on the hut's east side, sunk in a pale coping. */
function poolside(s: Solid) {
  const X0 = 5.0
  const X1 = 8.8
  const Z0 = -0.6
  const Z1 = -4.4
  const TOP = PLANT_Y + 0.34
  const W = 0.36
  s.pigment = PIG_BASE
  box(s, (X0 + X1) / 2, PLANT_Y - 0.3, Z0 + W / 2, X1 - X0 + W * 2, TOP - PLANT_Y + 0.3, W, 0.92)
  box(s, (X0 + X1) / 2, PLANT_Y - 0.3, Z1 - W / 2, X1 - X0 + W * 2, TOP - PLANT_Y + 0.3, W, 0.92)
  box(s, X0 - W / 2, PLANT_Y - 0.3, (Z0 + Z1) / 2, W, TOP - PLANT_Y + 0.3, Z0 - Z1, 0.92)
  box(s, X1 + W / 2, PLANT_Y - 0.3, (Z0 + Z1) / 2, W, TOP - PLANT_Y + 0.3, Z0 - Z1, 0.92)
  s.pigment = PIG_WATER
  const WY = TOP - 0.1
  quad(s, [X0, WY, Z0], [X1, WY, Z0], [X1, WY, Z1], [X0, WY, Z1], 0.72, [0, 1, 0])
  // caught light: three pale slivers on the water
  for (let i = 0; i < 3; i++) {
    const x = X0 + 0.7 + i * 1.1
    const z = Z0 - 0.9 - i * 0.8
    tri(s, [x, WY + 0.01, z], [x + 0.9, WY + 0.01, z - 0.25], [x + 0.35, WY + 0.01, z - 0.7], 0.98, [0, 1, 0])
  }
  s.pigment = PIG_BASE
}

/* ────────────────────────────────────────────────────────────────────────────
   The light coming out
   ──────────────────────────────────────────────────────────────────────────*/

type Glow = { pos: number[]; rgba: number[] }

/**
 * One quad of light, wound to face `out`.
 *
 * The facing is STATED rather than left to vertex order, exactly the way `tri`
 * states it and for exactly the reason `tri`'s note gives — and this layer is
 * the proof of that note. Every quad here used to be emitted in whatever order
 * it was written in, `softMat` and `coreMat` are FrontSide `MeshBasicMaterial`s
 * like everything else in the scene, and the four HORIZONTAL quads came out
 * wound face-down. All four were back-face culled, on every frame, in both
 * themes, since the day they were written.
 *
 * Measured at the door, by muting each range's vertex alpha and diffing the
 * drawing buffer: the two window pools, the deck pool and the door pool
 * contributed **0 pixels each**. Wound correctly they contribute 7474, 6463,
 * 4580 and 134706. The vertical bloom quads were always right, which is why the
 * layer looked like it worked and why nothing in the file ever said otherwise.
 *
 * Those four numbers are that session's shot, at that session's camera and
 * canvas, and the walk has since become an orbit that arrives 4.4m closer and
 * 10 degrees further round — so they are kept as the RECORD OF THE BUG and not
 * as a target. Re-measured the same way after the art pass, on a 1432x753
 * frame at the end of the walk: the door pool is **46,600 pixels** and the
 * whole warm layer 241,909. The claim that carries forward is "not zero".
 */
const pushQuad = (g: Glow, a: V, b: V, c: V, d: V, alpha: number, out: V) => {
  const ux = b[0] - a[0]
  const uy = b[1] - a[1]
  const uz = b[2] - a[2]
  const vx = c[0] - a[0]
  const vy = c[1] - a[1]
  const vz = c[2] - a[2]
  const nx = uy * vz - uz * vy
  const ny = uz * vx - ux * vz
  const nz = ux * vy - uy * vx
  const [p, q, r, s] = nx * out[0] + ny * out[1] + nz * out[2] < 0 ? [d, c, b, a] : [a, b, c, d]
  for (const v of [p, q, r, p, r, s]) {
    g.pos.push(v[0], v[1], v[2])
    // RGB is 1: the hue lives on the material, so a theme change is one colour
    // assignment rather than a buffer rewrite. Only the falloff is baked.
    g.rgba.push(1, 1, 1, alpha)
  }
}

/**
 * A quad whose four corners each carry their own alpha. `pushQuad` bakes one
 * value across the whole face, which is right for a lit pane and wrong for
 * anything that is supposed to fade out — see `halo`.
 *
 * Winding is stated the same way and for the same reason, and the alphas are
 * carried through the flip with their own vertices. Reversing the positions
 * and not the alphas is a bug that looks like a lighting decision.
 */
function pushFade(g: Glow, q: [V, number][], out: V) {
  const [a, b, c] = [q[0][0], q[1][0], q[2][0]]
  const ux = b[0] - a[0]
  const uy = b[1] - a[1]
  const uz = b[2] - a[2]
  const vx = c[0] - a[0]
  const vy = c[1] - a[1]
  const vz = c[2] - a[2]
  const nx = uy * vz - uz * vy
  const ny = uz * vx - ux * vz
  const nz = ux * vy - uy * vx
  const p = nx * out[0] + ny * out[1] + nz * out[2] < 0 ? [q[3], q[2], q[1], q[0]] : q
  for (const [v, alpha] of [p[0], p[1], p[2], p[0], p[2], p[3]]) {
    g.pos.push(v[0], v[1], v[2])
    g.rgba.push(1, 1, 1, alpha)
  }
}

/** Where a 2D halo lives in the world. */
type Plane = (u: number, v: number) => V
const zPlane = (z: number): Plane => (u, v) => [u, v, z]
/** u runs along z, so a halo on the flank wall is written the same way. */
const xPlane = (x: number): Plane => (u, v) => [x, v, u]

/**
 * The wall around a lit opening, catching the light.
 *
 * This replaces three nested rectangles at falling alpha, and the reason is
 * worth keeping: `pushQuad` gives a quad ONE alpha, so a "bloom" built out of
 * them is a stack of flat translucent panels with hard edges. Rendered, it did
 * not read as light at all — it read as three sheets of tracing paper taped to
 * the cabin, the largest of them 3.1m across and covering the whole front wall
 * with a visible rectangular seam down each side.
 *
 * A picture frame of four trapezoids does what the stack was trying to do:
 * full alpha along the inner edge, zero along the outer one, the corners
 * covered by the diagonals where the sides meet. Two triangles more per
 * opening, and no edge anywhere.
 */
function halo(
  g: Glow,
  p: Plane,
  out: V,
  cu: number,
  cv: number,
  hu: number,
  hv: number,
  spread: number,
  alpha: number,
) {
  const iu0 = cu - hu
  const iu1 = cu + hu
  const iv0 = cv - hv
  const iv1 = cv + hv
  const ou0 = iu0 - spread
  const ou1 = iu1 + spread
  const ov0 = iv0 - spread
  const ov1 = iv1 + spread
  const band = (a: V, b: V, c: V, d: V) =>
    pushFade(g, [[a, alpha], [b, alpha], [c, 0], [d, 0]], out)
  band(p(iu0, iv1), p(iu1, iv1), p(ou1, ov1), p(ou0, ov1))
  band(p(iu1, iv0), p(iu0, iv0), p(ou0, ov0), p(ou1, ov0))
  band(p(iu0, iv0), p(iu0, iv1), p(ou0, ov1), p(ou0, ov0))
  band(p(iu1, iv1), p(iu1, iv0), p(ou1, ov0), p(ou1, ov1))
}

/**
 * How far the door stands open, and where its light gets out.
 *
 * The leaf is hinged at -DOOR_HW and swings outward, so it covers the opening
 * from the hinge to `hinge + 2 * DOOR_HW * cos(A)` and the light comes out of
 * whatever is left. At 0.9 rad that leaves a 45cm slot, which at the end of
 * the walk is about twenty pixels of warm edge against a dark leaf — the
 * "somebody is expecting you" of the brief, rather than a lit rectangle.
 *
 * Both halves read this. The geometry builds the leaf from it and the glow
 * layer starts its quad at DOOR_SLOT, so the light can never be found shining
 * through the door.
 */
const DOOR_AJAR = 0.9
const DOOR_SLOT = -DOOR_HW + 2 * DOOR_HW * Math.cos(DOOR_AJAR)

/** The lit openings themselves: two windows and the gap the open door leaves. */
function buildGlowCore(): Glow {
  const g: Glow = { pos: [], rgba: [] }
  for (const sign of [-1, 1]) {
    const cx = sign * WIN_X
    pushQuad(
      g,
      [cx - WIN_HW, WIN_Y0, 0.03],
      [cx + WIN_HW, WIN_Y0, 0.03],
      [cx + WIN_HW, WIN_Y1, 0.03],
      [cx - WIN_HW, WIN_Y1, 0.03],
      1,
      [0, 0, 1],
    )
  }
  /*
   * The doorway, and only the part of it the leaf is not standing in front of.
   *
   * This used to light the whole opening and let the door's own geometry
   * occlude it, which is correct in principle and wrong in practice: the leaf
   * is a single quad standing at an angle, so at the walk's final angles it is
   * nearly edge-on and hides almost nothing. Rendered, the doorway came out as
   * one flat warm rectangle — a lit panel where a door should be, with no
   * reading of a door standing open at all. Two attempts at fixing it by
   * swinging the leaf wider only produced a WIDER flat warm rectangle.
   *
   * Lighting the slot instead gives the picture the brief asks for: a dark
   * leaf, and a narrow bright edge of light beside it. `DOOR_SLOT` is derived
   * from the same angle the leaf is built at, so the two cannot drift apart.
   */
  pushQuad(
    g,
    [DOOR_SLOT, DECK_Y, -0.06],
    [DOOR_HW, DECK_Y, -0.06],
    [DOOR_HW, DECK_Y + DOOR_H, -0.06],
    [DOOR_SLOT, DECK_Y + DOOR_H, -0.06],
    1,
    [0, 0, 1],
  )
  // The flank window, lit like the others. It exists in the wall already; what
  // it never had was a light behind it, which did not matter while the camera
  // sat square-on to the front and does now.
  pushQuad(
    g,
    [-CAB_HW - 0.02, SW_Y0, SW_Z0],
    [-CAB_HW - 0.02, SW_Y0, SW_Z1],
    [-CAB_HW - 0.02, SW_Y1, SW_Z1],
    [-CAB_HW - 0.02, SW_Y1, SW_Z0],
    0.9,
    [-1, 0, 0],
  )
  return g
}

/**
 * Everything the light does to what is around it: the wall glow around each
 * opening, and the warm pools it lays on the deck and out across the snow.
 *
 * No texture anywhere, which is the same trick the rest of the scene uses —
 * nothing to download, nothing to upload, nothing extra to dispose. What
 * changed is HOW the glow is built. It used to be three nested quads at
 * falling alpha, on the reasoning that a hard-edged step is the house style.
 * It is, for a facet. It is not for light: `pushQuad` gives a quad one alpha
 * for all four corners, so a stack of them has a hard edge wherever each one
 * stops, and rendered at the end of the walk the outermost was a 3.1m
 * translucent rectangle with a visible seam straight across the front wall.
 * `halo` replaces it with a frame that reaches zero at its outer edge.
 */
function buildGlowSoft(): Glow {
  const g: Glow = { pos: [], rgba: [] }
  for (const sign of [-1, 1]) {
    halo(g, zPlane(0.045), [0, 0, 1], sign * WIN_X, (WIN_Y0 + WIN_Y1) / 2, WIN_HW, (WIN_Y1 - WIN_Y0) / 2, 0.62, 0.3)
    /*
     * What a window puts on the snow in front of it — and the near end of it is
     * under the porch deck, deliberately left there.
     *
     * The pool runs from z = 0.55, a hand's width off the wall, and the deck is
     * an opaque box from z = 0 to DECK_Z with its top at DECK_Y; the pool lies
     * a hand's width off the ground, so its first metre and a bit is inside
     * that box. `softMat` has `depthWrite: false` but the depth TEST is on, so
     * the deck simply wins and those fragments are discarded. Measured at the
     * door when it was shorter than it is now: 42% of the left pool and 47% of
     * the right one never reached the frame. The pool has since been widened
     * and lengthened for the closer camera, so treat those as the shape of the
     * answer rather than the answer.
     *
     * That is occlusion doing its job, not a bug — light does not land on snow
     * that has a deck standing on it, and the pool emerging from under the deck
     * edge is what the reader sees. It costs six triangles' worth of discarded
     * fragments and no wrong pixel. What it is NOT is invisible: the numbers are
     * here so the next person deciding whether the pool should instead START at
     * the deck's edge is making that call with them, rather than discovering the
     * overlap and assuming it was a mistake.
     */
    pool(g, sign * WIN_X, 0.55, 4.2, 0.8, 2.15, 0.36)
  }
  halo(g, zPlane(0.045), [0, 0, 1], 0, DECK_Y + DOOR_H / 2, DOOR_HW, DOOR_H / 2, 0.7, 0.34)
  // and the flank window, on its own wall
  halo(
    g,
    xPlane(-CAB_HW - 0.03),
    [-1, 0, 0],
    (SW_Z0 + SW_Z1) / 2,
    (SW_Y0 + SW_Y1) / 2,
    (SW_Z1 - SW_Z0) / 2,
    (SW_Y1 - SW_Y0) / 2,
    0.55,
    0.26,
  )
  // The deck, then the snow past the steps. `[0, 1, 0]`: these lie FLAT and are
  // looked down on, and getting that wrong is what culled every pool in this
  // layer — see `pushQuad`.
  pushQuad(
    g,
    [-0.85, DECK_Y + 0.02, 0.02],
    [0.85, DECK_Y + 0.02, 0.02],
    [1.15, DECK_Y + 0.02, DECK_Z],
    [-1.15, DECK_Y + 0.02, DECK_Z],
    0.42,
    [0, 1, 0],
  )
  /*
   * The door's own pool, and it is drawn LAST on purpose: the bench that
   * measures how much of this scene's light actually lands on the snow finds
   * it as the final eighteen vertices of this buffer, mutes their alpha and
   * diffs the frame. Keep it last, or that measurement silently starts
   * reporting some other quad.
   *
   * It was `2.9 -> 7.4`, then `1.6 -> 6.4`, and it is now shorter again, for
   * the same reason both times: the shot moved and the bottom edge of the
   * frame came up the ground toward the door.
   *
   * The eye is now 1.72m and the aim is 2.5 degrees ABOVE horizontal, which
   * puts the bottom edge of the frame across the ground 6.3m ahead of the
   * reader on the centre line — z = 4.9 in world terms, with the corners
   * reaching further. Projected at the arrival, `1.6 -> 6.4` put the fan's far
   * LEFT corner at -1.34 of the frame's half-height, half of that edge under
   * the picture, while its right corner stayed in: a pool cropped on one side
   * only, which reads as a mistake in a way a symmetric crop does not. At
   * `1.6 -> 5.4` the same corner lands at -1.13 and its opposite number comes
   * in from -0.97 to -0.85, so what is lost is a wedge of the fan's last band,
   * where its own `(1 - k)^2` ramp has already taken the alpha to zero.
   *
   * Wider rather than longer, both times, and that is the composition rather
   * than the arithmetic: the reference paintings put a broad warm patch
   * spreading sideways from the door across cold ground, not a carpet runner
   * pointing at the reader.
   */
  pool(g, DOOR_SLOT * 0.6, 1.6, 5.4, 1.6, 4.4, 0.62)
  return g
}

/**
 * A warm pool on the snow: a fan of three faceted bands widening away from the
 * cabin and fading to nothing, so the light has a shape on the ground rather
 * than stopping at a line.
 *
 * It emits its own vertices rather than going through `pushQuad`, because every
 * corner carries its own alpha. That means it also has to get its own winding
 * right, and it did not: wound as written, all three pools faced DOWN and a
 * FrontSide material culled every one of them. See `pushQuad` for the
 * measurement.
 */
function pool(g: Glow, cx: number, z0: number, z1: number, w0: number, w1: number, alpha: number) {
  const bands = 3
  /*
   * Above the footpath, not on the snow.
   *
   * The trodden path is opaque geometry at PATH_LIFT, and it runs from the
   * steps out through the middle of exactly where this lies. At the pool's old
   * 3cm the path won that depth test and cut a dark stripe through the
   * brightest part of the light — the one thing in the frame that must not
   * have a stripe through it.
   *
   * 10cm off the ground shows nothing, and that is not a hope: a pool of light
   * has no silhouette against the surface under it, because the surface under
   * it is the same snow. There is no edge for the lift to separate from.
   */
  const y = PATH_LIFT + 0.045
  for (let i = 0; i < bands; i++) {
    const k0 = i / bands
    const k1 = (i + 1) / bands
    const za = z0 + (z1 - z0) * k0
    const zb = z0 + (z1 - z0) * k1
    const wa = w0 + (w1 - w0) * k0
    const wb = w0 + (w1 - w0) * k1
    const aa = alpha * (1 - k0) * (1 - k0)
    const ab = alpha * (1 - k1) * (1 - k1)
    // Counter-clockwise seen from ABOVE, which is the only side of a thing
    // lying on the ground that anybody looks at. The order of these six is the
    // difference between a pool of light and nothing at all.
    for (const q of [
      [cx + wb, y, zb, ab],
      [cx + wa, y, za, aa],
      [cx - wa, y, za, aa],
      [cx - wb, y, zb, ab],
      [cx + wb, y, zb, ab],
      [cx - wa, y, za, aa],
    ]) {
      g.pos.push(q[0], q[1], q[2])
      g.rgba.push(1, 1, 1, q[3])
    }
  }
}

/**
 * A soft-edged rectangle of light lying ON something: the inner face at full
 * alpha, and `halo`'s frame of trapezoids round it reaching zero at the outer
 * edge.
 *
 * It is `halo` plus two triangles, and those two triangles are the whole
 * difference between light falling on a surface and a ring drawn on one —
 * `halo` alone leaves its middle empty, which is right for a wall round a lit
 * window and wrong for a pool on a floor.
 *
 * **Nothing in this layer has an edge, and that is the requirement rather than
 * the technique.** Every boundary in the room's warm layer dissolves; a
 * rectangle of light with a visible side is the defect the pass that built
 * `halo` existed to remove, and it would be worse indoors than out, because
 * indoors these lie across the exact area the cards are read on.
 */
function wash(
  g: Glow,
  p: Plane,
  out: V,
  cu: number,
  cv: number,
  hu: number,
  hv: number,
  spread: number,
  alpha: number,
) {
  pushQuad(g, p(cu - hu, cv - hv), p(cu + hu, cv - hv), p(cu + hu, cv + hv), p(cu - hu, cv + hv), alpha, out)
  halo(g, p, out, cu, cv, hu, hv, spread, alpha)
}

/** A halo lying flat, at height `y`. `u` runs in x and `v` in z. */
const yPlane = (y: number): Plane => (u, v) => [u, y, v]

/**
 * What the fire DOES to the room: the static half of the fire buffer.
 *
 * "ONE LIGHT SOURCE, with somewhere for the light to fall: a glow on the air, a
 * pool on the ground, a rim on whatever is nearest it." These are the places it
 * falls, in the order the eye finds them, and every one of them is pointed at
 * by the tone the same fire already baked into the geometry through `hearthAt`.
 * The two have to be read together: that one raises a facet's VALUE, this one
 * gives the light its COLOUR, and either alone is half a fire.
 *
 * The two lanterns are here rather than in a layer of their own because they
 * are the same pigment and the same theme entry: "light theme turns the fire
 * and the lamps down, not off" is one number, `ROLES.*.fire`, and it can only
 * stay one number if they share a material.
 *
 * **The table's light is the one thing in here that is a legibility decision,
 * and it is a bare four-alpha `pushFade` rather than a `wash`.** A wash is a
 * flat core with a fade round it, so what it put on the paper was a uniform
 * tint: measured across the settled frame, rgb (109,109,111) at the left edge,
 * (109,109,111) in the middle and (113,113,117) at the right — four values
 * across 1440px, which is why that beat read as a featureless grey field. The
 * fade runs (92,97,106) at the corner furthest from the hearth to (107,107,110)
 * at the one nearest it, and its peak is a value UNDER where the flat wash sat.
 * Its own call site carries the four numbers and the contrast arithmetic that
 * caps them at 0.15.
 */
function buildFireStatic(): Glow {
  const g: Glow = { pos: [], rgba: [] }
  // The surround's face round the opening. A frame, not a wash: the middle of
  // it is the firebox, which has the actual fire in it.
  halo(
    g,
    zPlane(FP_FZ + 0.012),
    [0, 0, 1],
    FIRE_X,
    (FP_OPEN_Y0 + FP_OPEN_Y1) / 2,
    FP_OPEN_HW,
    (FP_OPEN_Y1 - FP_OPEN_Y0) / 2,
    0.52,
    0.42,
  )
  /*
   * The pool on the floor in front of the hearth. Wider than it is deep, the
   * way the door's pool outside is, because a fire throws light sideways across
   * a floor and not down a corridor.
   *
   * It lies at floor level, so the hearth slab — 7cm proud, standing in the
   * middle of it — cuts it. That is left alone deliberately. The slab's top
   * faces straight up 80cm from the flame, which is the largest `hearthAt`
   * boost anywhere in the room, so it is already brighter than the pool rather
   * than a hole in it: what the cut reads as is the light STARTING at the
   * hearth, which is where it starts. Lifting the pool above the slab instead
   * would have solved a problem that is not there and made a new one — the
   * plane would then slice the woodpile beside it at 9cm and put a horizontal
   * line across a solid object.
   */
  wash(g, yPlane(IN_Y + 0.014), [0, 1, 0], FIRE_X, FP_FZ + 0.95, 1.15, 1.05, 1.35, 0.5)
  /*
   * The west wall, north of the window and stopping exactly at its jamb.
   *
   * A wash on a wall is a quad floating a centimetre off it, and a wall with a
   * HOLE in it is a wall a quad can float in the middle of. The first version
   * of this ran from z = -5.50 to -2.80, which put its far end inside the west
   * window's own opening (-3.86 to -2.20) with nothing behind it but the
   * snowfield 20 metres away: a warm rectangle hanging in the air outside the
   * cabin, in the one frame the whole last beat is composed on.
   *
   * So the inner edge stops at -4.10, 24cm north of the jamb, and `spread` is
   * 0.24 rather than 1.1 — chosen so `halo`'s outer edge lands exactly ON the
   * jamb rather than past it. That is why the falloff here is tighter than
   * anything else in this layer: it is not a taste decision, it is the width of
   * the wall that is left.
   */
  wash(g, xPlane(-IN_X + 0.014), [1, 0, 0], -5.0, 1.45, 0.9, 0.9, 0.24, 0.2)
  /*
   * ── THE TABLE ────────────────────────────────────────────────────────────
   *
   * One quad over the whole table top, brightest at the corner nearest the
   * hearth and falling away diagonally. It replaces a symmetric `wash` at 0.13
   * and it is the single change to the LIGHT that turns the room beat
   * from a field into a place; the sheet's own rim and shadow in `interior` are
   * the change to the geometry.
   *
   * **The frame's horizontal axis is z, and north is screen RIGHT.** Every
   * station on the room's leg — `ST_ROOM`, `ST_ROOM_SET`, `ST_ROOM_END` — looks
   * due west, so its screen-right projected on the ground is (0, 0, -1) at all
   * three and this claim survived the camera being rebuilt. That means this
   * reads as light entering from the right of the frame and falling away to the
   * left, which is where the fire actually is — it is 3.0m off the table's
   * north-east corner and 6.0m off its south-west one.
   *
   * **0.15 and not more, and the ceiling is contrast rather than taste.**
   * `--text` at #f2f2f5 has a relative luminance of 0.879, so a 4.5:1 floor puts
   * the brightest pixel of this field at L = 0.156, which is about rgb 109. The
   * paper alone measures (92, 97, 106) and the old flat wash took the whole
   * field to (109, 109, 111) — at the limit everywhere, with nothing left to
   * spend on a gradient. At 0.15 the same field runs (92, 97, 106) at the south
   * end to (107, 107, 110) at the north: a seventeen-value fall across the
   * frame, the peak a value UNDER where the flat wash sat, and the whole of it
   * in the direction the room's one light source is.
   *
   * Its four edges: north on the table's own north edge, south at zero alpha,
   * and east and west exactly on `TABLE_X0` / `TABLE_X1`, where the table top
   * ends and the eye already has a step to look at.
   */
  /*
   * **It is a raw `pushFade` and not a `wash`, and the table beat is why.**
   * `wash` is a flat core with `halo`'s frame round it, so its middle is ONE
   * alpha — which is exactly what put a uniform tint over the whole paper and
   * left `r3-D-3200.png` reading as "a featureless grey wash": measured across
   * that frame, rgb (109,109,111) at the left edge, (109,109,111) in the middle
   * and (113,113,117) at the right. Four values across 1440px is not a light
   * source in a room, it is a fill.
   *
   * This used to be a `ramp` — one alpha along the north edge falling to zero
   * at the south — and `ramp` has gone with it, because the table was its only
   * caller. A ramp falls along one axis, so the table was
   * lit as though the fire were a wall of light at the north end of it; the
   * hearth is a point 3.0m off the table's north-EAST corner and 6.0m off its
   * south-west one, and a quad whose corners carry their own alphas says so for
   * the same two triangles.
   *
   * The four numbers are `1 / (1 + d^2 * HEARTH_FALL)` at the four corners,
   * scaled so the brightest is the 0.15 the contrast ceiling below allows:
   * NE 0.150, NW 0.122, SE 0.055, SW 0.051. The peak has not moved, so neither
   * has the arithmetic that caps it — what has changed is that the fall is now
   * diagonal, across the frame rather than along it.
   *
   * The south end is no longer at zero, and that is deliberate rather than
   * sloppy: at 0.05 its edge lands exactly on the table's own south edge, where
   * the table meets the south wall and the geometry already has a step. See
   * `ramp` for why an unfaded edge is only allowed in that one situation.
   */
  pushFade(
    g,
    [
      [[TABLE_X0, TABLE_Y + 0.014, TABLE_Z1], 0.122],
      [[TABLE_X1, TABLE_Y + 0.014, TABLE_Z1], 0.15],
      [[TABLE_X1, TABLE_Y + 0.014, TABLE_Z0], 0.055],
      [[TABLE_X0, TABLE_Y + 0.014, TABLE_Z0], 0.051],
    ],
    [0, 1, 0],
  )
  // The lantern on the desk: a small bright core facing the room, and a pool of
  // its own on the desk under it. It is the only warm in the south-east corner
  // and it is what the turn sweeps past on its way to the table.
  const lx = DESK_X0 + (DESK_X1 - DESK_X0) / 2 - 0.42
  const lz = DESK_Z1 + (DESK_Z0 - DESK_Z1) / 2 + 0.34
  pushQuad(
    g,
    [lx - 0.06, DESK_Y + 0.06, lz + 0.09],
    [lx + 0.06, DESK_Y + 0.06, lz + 0.09],
    [lx + 0.06, DESK_Y + 0.24, lz + 0.09],
    [lx - 0.06, DESK_Y + 0.24, lz + 0.09],
    0.85,
    [0, 0, 1],
  )
  wash(g, yPlane(DESK_Y + 0.008), [0, 1, 0], lx, lz, 0.2, 0.2, 0.46, 0.34)
  // The candle on the mantel, and the light it throws up the breast. Small, and
  // the only thing that keeps the north wall alive after the camera has turned
  // away from the fire.
  const cx = FIRE_X + 0.66
  pushQuad(
    g,
    [cx - 0.05, MANTEL_Y + MANTEL_T + 0.04, FP_FZ - 0.22],
    [cx + 0.05, MANTEL_Y + MANTEL_T + 0.04, FP_FZ - 0.22],
    [cx + 0.05, MANTEL_Y + MANTEL_T + 0.2, FP_FZ - 0.22],
    [cx - 0.05, MANTEL_Y + MANTEL_T + 0.2, FP_FZ - 0.22],
    0.8,
    [0, 0, 1],
  )
  wash(g, zPlane(FP_FZ + 0.02), [0, 0, 1], cx, MANTEL_Y + 0.5, 0.14, 0.3, 0.55, 0.16)
  return g
}

/* ────────────────────────────────────────────────────────────────────────────
   The shot

   Everything below is read at frame time and nothing at module init, which is
   why it can sit under the geometry and refer to it by name. The stations are
   `const` objects and DO initialise at import, so they must stay after the
   constants they are solved against — `TABLE_*`, `SW_*`, `FIRE_*`, `IN_*`.
   ──────────────────────────────────────────────────────────────────────────*/

/** Where the eye is, and what it is pointed at. */
type Station = { readonly p: V; readonly l: V }

/**
 * ── THE CAMERA NEVER STOPS, AND IT NEVER JOLTS ───────────────────────────
 *
 * The shot used to be six stations with an eased HOLD between each pair, and
 * the site owner read the arrival at the table as a jolt: "it jolts too quickly
 * and fast to pan down at the table". Both halves of that sentence have the
 * same cause and it is arithmetic rather than taste.
 *
 * `smooth` arrives at 1 with zero slope and leaves 0 with zero slope, so a
 * spline made of smoothstepped legs is stationary at EVERY station. Between two
 * stations the camera therefore has to cover the whole leg in the middle of its
 * span, which makes the middle of every leg the fastest part of it; and the
 * legs either side of a station have wildly different lengths, so the speed the
 * camera arrives at a station with and the speed it leaves with are unrelated.
 * Zero is the only value they agree on. Measured on the shipped spline at
 * 1440x900: the turn covered 1.08m in 171px of scroll with a peak rate of
 * 1.5x its own mean, and then stopped dead for 1532px. That stop-start is
 * what a jolt IS.
 *
 * So the whole run is now ONE path with ONE speed curve, and the two properties
 * the owner asked for are held by construction rather than by tuning:
 *
 * - **Nothing ever stops.** Each leg's own parameter is LINEAR in walk
 *   progress, so its speed is its length over its span — a positive constant.
 *   No `smooth` anywhere on a leg.
 * - **Speed is continuous across every station.** Each station is rounded by
 *   `cornerAt`: over a window either side of it the two legs' own straight
 *   lines are cross-faded with a `smooth` weight. At the ends of the window the
 *   weight is 0 and 1 with zero slope, so the blended path leaves with exactly
 *   the incoming leg's velocity and arrives with exactly the outgoing leg's —
 *   C1 with no spline library. And because BOTH lines pass through the station
 *   at the station's own knot, the blend still hits every composed station
 *   EXACTLY, whatever the weight is there. Nothing solved in this file moved.
 *
 * What is left is a speed curve that is fast where there is nothing to read and
 * slow where there is, which is the other half of the owner's note: "have the
 * camera always, always be moving, but faster in some areas and slower in some
 * areas". The spans below are solved from that, not chosen — see `B_ORBIT`.
 */

/**
 * The beats, as fractions of the marks `Walk.tsx` measures. `A` is the p at
 * which #apps' top reaches the top of the viewport and `T` is #tools'.
 *
 * Stated as fractions rather than as literals so the two anchored beats land
 * exactly as a heading arrives, whatever anybody does to a section's height
 * later. That is the whole reason the progress object carries marks at all.
 *
 * **They are SOLVED from the speed curve rather than picked.** Each leg's speed
 * is its own length in metres over its span in walk progress, so choosing the
 * spans IS choosing the speed curve. Measured on the live 1440x900 layout
 * (`.walk` 5187px on a 900px viewport, so the pin travels 4287px, A = 0.399 and
 * T = 0.846 clamped to 0.840), sampling the camera at 60 evenly spaced points
 * across the whole walk:
 *
 * ```
 *   leg                    metres   span      px    m per unit p   deg per sample
 *   orbit                  41.0     0.1318    565   602 -> 115      5.6 -> 1.7
 *   run-in to the door      9.16    0.0799    343   115             2.0 -> 4.4
 *   door -> mouth           1.99    0.0279    120    71             3.8 -> 3.6
 *   mouth -> threshold      1.29    0.0560    240    23             2.3 -> 1.1
 *   threshold -> the room   0.80    0.1038    445     7.7          10.7 -> 14.5
 *   the room, settling      0.48    0.1084    465     4.4           2.2 -> 3.3
 *   the room, drifting      0.45    0.2088    895     2.2           0.2
 *   the room -> the window  1.05    0.1234    529     8.5           4.7 -> 6.7
 *   the window, dollying    1.13    0.1600    686     7.0           1.3
 * ```
 *
 * Read the right-hand columns downward and that is the answer to "faster in
 * some areas and slower in some areas". Two properties are what the owner
 * actually asked for and both are measured rather than asserted:
 *
 * - **No zero.** The smallest step anywhere on that sample is 0.066m of eye
 *   plus aim, in the middle of the drift. There is no frame of this walk on
 *   which the camera is not moving.
 * - **No spike.** The largest ratio between two ADJACENT steps is 2.51, at the
 *   threshold's hand-over into the turn — and that one is a dolly handing over
 *   to a PAN, so the angular column goes up over exactly the samples the
 *   positional one comes down. Every other adjacent pair is inside 2.1x. The
 *   spline this replaced had five exact zeros, so its own worst ratio was
 *   unbounded.
 *
 * The turn is the number that moved most and it is the owner's jolt: 171px
 * before and 445px now, and the pan it carries peaks at 14.5 degrees per
 * sample against the 44 the old spline's smoothstepped middle reached.
 */
const B_ORBIT = 0.33
const B_DOOR = 0.53
const B_MOUTH = 0.6
const B_THRESH = 0.74
const ROOM_SETTLE = 0.246
const ROOM_CREEP = 0.72

/**
 * The approach's own ease, and it is one-sided on purpose.
 *
 * The orbit interpolates the RECIPROCAL of the distance, so a linear parameter
 * already gives the cabin an even rate of apparent growth — that is what the
 * 1/d law in `orbitAt` is for. What a linear parameter does NOT give is metres:
 * `d(dist)/d(ease)` goes as `dist^2`, so the camera covers 150m per unit of
 * ease at 52m out and 10m per unit at 13.4m. Over the orbit's own span that is
 * a smooth 17x decay — 1.44x per sample at 60 samples across the walk — which
 * is the shape the run-in and the door then continue.
 *
 * `x * (S + (1 - S) x)` starts at S of the mean rate and ends at (2 - S) of it.
 * At S = 0.5 the far end opens gently instead of snapping into motion, and the
 * near end is 1.5x, which is what lets the orbit hand over to the run-in at the
 * run-in's own speed instead of at a fifteenth of it. Both derivatives are
 * finite and positive, so this eases without ever holding — `smooth`, which is
 * what used to be here, is 0 at both ends and that is a hold at each end of the
 * loved approach.
 *
 * The FRAMES are untouched. This is a reparameterisation of the same curve:
 * every pose the old approach passed through, the new one passes through.
 */
const APPROACH_EASE = 0.5
const approachEase = (x: number) => x * (APPROACH_EASE + (1 - APPROACH_EASE) * x)
/** Its inverse, for `restFor`. The positive root of the quadratic above. */
const approachEaseInv = (y: number) =>
  (-APPROACH_EASE + Math.sqrt(APPROACH_EASE * APPROACH_EASE + 4 * (1 - APPROACH_EASE) * y)) /
  (2 * (1 - APPROACH_EASE))

/**
 * How much of the THRESHOLD is spent getting from the door station to the door
 * mouth, and it is the number that killed "the camera is not inside the cabin,
 * it is outside a room-shaped box".
 *
 * Three critics rendered the walk and all three led with that sentence about
 * `v4-D-2400.png`. Measured on the live page at 1440x900, that frame is walk
 * 0.2765 — 35% of the way through the threshold — and the camera is at z =
 * +1.62, which is 1.56m OUTSIDE the south wall. It is not a box; it is a
 * doorway, seen from the porch, and the reason it reads as a box is arithmetic:
 * at 1.56m off a 1.2m opening the doorway spans 73% of the frame's width, so
 * the picture is a thin band of unlit wall, a bright room, and a thin band of
 * unlit wall. Sampled on the canvas itself at that frame, the left and right
 * frame edges are rgb (50,57,68) at EVERY sample, top to bottom — a dead flat
 * field 600px wide with no facet in it — against an interior at 100 to 141.
 *
 * **The box window is a function of distance and it is narrow.** The test used
 * is the canvas itself: sample the right-hand frame edge at 48 points and ask
 * whether every one of them is the same value, which is what "a wall that reads
 * as page" means. Swept in 15px steps at 1440x900, that is true for camera z
 * between 2.25 and 0.86 and false either side of it — beyond 2.25 the picture
 * is a lit door in a wall, which is the loved approach, and inside 0.86 the
 * doorway has overflowed the frame and the picture is the room.
 *
 * `B_MOUTH` above is that band's own span in walk progress, and it is stated as
 * a mark fraction rather than as a fraction of the threshold beat because every
 * other knot in this file is. Converted: the box band is z 2.25 to 0.86, which
 * on this leg is walk 0.5657A to 0.6035A — 65px of scroll at 1440x900, against
 * 157px on the spline this replaced. The camera crosses it at 55 m/p, its
 * second-fastest leg, and what the reader sees is the doorway growing to
 * swallow the frame rather than a rectangle sitting still in the middle of it.
 */

/**
 * What to assume before `Walk.tsx` has measured, and how far the marks are
 * allowed to be believed.
 *
 * The marks come from live boxes and are refreshed on resize, so on the very
 * first frame — and on any layout where a section is degenerate — they can be
 * 0, out of order, or greater than 1. A knot list that is not increasing puts
 * the camera in two beats at once, which is not a wobble, it is a jump.
 *
 * Measured live at 1440x900 with the walk built: `.walk` is 5187px tall on a
 * 900px viewport, so the pin travels 4287px, and the marks come back as `apps`
 * 0.3994 and `tools` 0.8459. `apps` is inside these bounds with room to spare
 * and `tools` is 0.0059 past `MARK_TOOLS_MAX`, so it clamps — which costs the
 * window dolly six thousandths of the walk at its far end and nothing else.
 *
 * An EARLIER layout put #tools' top 3483px into a 3453px run — p = 1.009, past
 * the release — where the window beat would have been zero long. That is what
 * these bounds are for, and they fail in the right direction: settled a sixth
 * of the walk early beats still moving when the reader arrives.
 */
const MARK_FALLBACK_APPS = 0.5
const MARK_FALLBACK_TOOLS = 0.8
const MARK_APPS_MIN = 0.24
const MARK_APPS_MAX = 0.62
const MARK_GAP_MIN = 0.14
const MARK_TOOLS_MAX = 0.84

/**
 * The nine knots of the shot in walk progress — eight legs and their two ends —
 * filled by `knotsOf` and read by `shotAt`, `insideness` and `restFor`.
 *
 * One module-level array rather than a returned object, because this is read
 * two or three times per drawn frame inside the one frame loop and an object
 * per read is garbage the collector has to come back for. It is only ever
 * written by `knotsOf` and only ever read afterwards in the same synchronous
 * tick, which is the same contract `motion.ts`'s single mutated `Frame` has.
 */
const SEGS = 9
const KNOT = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]

function knotsOf(marks: WalkProgress) {
  const a = Math.min(MARK_APPS_MAX, Math.max(MARK_APPS_MIN, marks.apps || MARK_FALLBACK_APPS))
  const t = Math.min(
    MARK_TOOLS_MAX,
    Math.max(a + MARK_GAP_MIN, marks.tools || MARK_FALLBACK_TOOLS),
  )
  KNOT[0] = 0
  KNOT[1] = B_ORBIT * a
  KNOT[2] = B_DOOR * a
  KNOT[3] = B_MOUTH * a
  KNOT[4] = B_THRESH * a
  KNOT[5] = a
  KNOT[6] = a + ROOM_SETTLE * (t - a)
  KNOT[7] = a + ROOM_CREEP * (t - a)
  KNOT[8] = t
  KNOT[9] = 1
}

/**
 * How much of a leg either side of a station the corner rounding is allowed to
 * eat, and how far past its own end a leg may be extrapolated into the next
 * one's window.
 *
 * They are two different limits and both bite. `CORNER` keeps the two windows
 * on one leg from meeting — each is at most 0.45 of that leg and 0.45 + 0.45 <
 * 1, so they cannot — and `REACH` keeps the ROUNDING small: inside the window
 * the neighbouring leg is evaluated beyond its own end, and at 0.5 it never
 * runs more than half its own length past the station it already arrived at.
 *
 * The pair is what lets the window be ASYMMETRIC — bounded by the leg it eats
 * on one side and by the leg it extrapolates on the other — and the two knots
 * where that matters are the two either side of the reading beat. Measured at
 * 1440x900:
 *
 * ```
 *   station              before   after    total     the change it rounds
 *   the room     (A)     0.0467   0.0488   409px     7.7 m/p -> 4.4
 *   the window's lift    0.0617   0.0555   502px     2.2 m/p -> 8.5
 * ```
 *
 * Four hundred pixels is about six samples of sixty, which is what puts every
 * adjacent step in `B_ORBIT`'s table inside 2.1x of its neighbour rather than
 * dropping the rate by five in one frame.
 *
 * The rounding never moves a station: both lines pass through it at its own
 * knot, so the blend is `w * Q + (1 - w) * Q` there for any `w`.
 */
const CORNER = 0.45
const REACH = 0.5

/**
 * How far the room has closed round the camera: 0 at the door mouth, 1 by the
 * end of the threshold.
 *
 * It is keyed on the shot's own knots rather than on the camera's z, and that
 * is deliberate: the gate that picks the frame rate needs this BEFORE the
 * camera has been placed, and a term that means two different things depending
 * on where in the tick it is asked is a term that will eventually disagree with
 * itself. `knotsOf` has to have run.
 */
function insideness(t: number) {
  return smooth((t - KNOT[3]) / Math.max(1e-4, KNOT[4] - KNOT[3]))
}

/**
 * The window and door light's own ramp across the approach: `smooth(smooth(w))`
 * on the orbit's own parameter, saturating at 1 the moment the orbit hands over
 * to the run-in. Unchanged in shape; it is keyed on `KNOT[1]` now because that
 * is where the orbit ends, where it used to be a fraction of the first beat.
 */
function approachLit(t: number) {
  return KNOT[1] > 0 ? smooth(smooth(clamp01(t / KNOT[1]))) : 1
}

/**
 * Where the shot rests for a visitor who asked for less motion.
 *
 * **Three composed frames, not one, and this is the one place this file departs
 * from what "snaps to identity" used to mean here.** The old rest was a single
 * pose, because the camera was decoration behind one section. It is now the
 * BACKDROP for three, and two of those three have a legibility requirement
 * riding on the camera being in a particular place: the project cards are read
 * against the table and the small tools against the window. A single frozen
 * pose would satisfy at most one of them and leave the other two sections
 * reading over whatever the frozen frame happened to be.
 *
 * So it snaps to the nearest ANCHORED beat instead — the composed exterior, the
 * room, or the window — switching at the midpoints between them. Every one of
 * those is a frame the shot was composed to arrive at, never a mid-move one,
 * which is what the rule is actually protecting. There is no animation between
 * them: crossing a midpoint is a cut, and a cut is not motion.
 *
 * The two interior frames are the START of their legs rather than a point
 * inside them, and that matters more than it used to: the room's beat is a
 * creep now rather than a hold, so "the beat" no longer names one frame. The
 * one it names here is the frame the beat was composed to open on.
 *
 * `knotsOf` has to have run.
 */
function restFor(marks: WalkProgress) {
  knotsOf(marks)
  const out = REST_K * KNOT[1]
  const p = clamp01(marks.p)
  if (p < (out + KNOT[5]) / 2) return out
  if (p < (KNOT[5] + KNOT[8]) / 2) return KNOT[5]
  return KNOT[8]
}

/**
 * ── the stations ─────────────────────────────────────────────────────────
 *
 * Seven of them, and every number is measured against the room rather than
 * chosen: the table's own centre, the window's own centre, the firebox's own
 * opening. Each is quoted where it matters.
 */

/**
 * THE DOOR. The end of the approach, on the open half of the doorway.
 *
 * `x = 0.34` is not the door's centre and must not be. The leaf is hinged at
 * -DOOR_HW and swings OUT to (0.146, 0.940), so it covers the doorway from the
 * hinge across to x = 0.146 and the light — and the camera — get out through
 * the 45cm slot beside it. A camera on the door's axis would pass straight
 * through the leaf at z = 0.756. At 0.34 it is in the middle of the slot,
 * clear of the leaf by 19cm and of the jamb by 26cm, and what the reader gets
 * is the jamb sweeping past on the right and the dark leaf on the left, which
 * is the "doorway frame passes the lens" of the brief.
 *
 * `y = 1.98` is a standing eye on the second step, whose top is at 0.22.
 */
const ST_DOOR: Station = { p: [0.34, 1.98, 2.55], l: [-0.15, 1.78, -3.2] }

/**
 * THE DOOR MOUTH. Half a metre off the opening, on the same line, and the whole
 * of it is SOLVED rather than composed: it is the nearest station on the way in
 * at which the doorway no longer has a visible edge anywhere in the frame.
 *
 * The condition is that all four sides of the opening fall outside the frustum,
 * at every frame this site supports. The binding one is the near jamb — the
 * doorway is x -0.6 to 0.6 and the entry line is x = 0.34, so the +x jamb is
 * only 26cm off the axis while the -x jamb is 94cm — and the aperture that
 * counts is the INNER skin at `IN_Z0`, because it is the further of the two and
 * therefore subtends the less.
 *
 * With `d` the distance to that skin and `t` the aim's own azimuth off -z,
 * the jamb is outside the frame when `atan(0.26 / d) >= hHalf - t`. `fovFor`
 * clamps the vertical angle at `FOV_MAX`, so the widest horizontal half-angle
 * this site can produce is on the SHORTEST viewport rather than the narrowest:
 * `atan(tan(13 deg) * aspect)`, which is 34.7 degrees at 3:1 and 36.5 at 3.2:1.
 * This station's aim gives t = 10.6 degrees, so at 3.2:1 the jamb clears the
 * frame for d <= 0.535 and this is at d = 0.50. The other three are slack by a
 * wide margin at the same d: the far jamb needs 0.92m, the head 1.17m at a
 * portrait 30-degree half-frame, the sill 2.31m.
 *
 * `y = 1.94` keeps the standing eye on the top step. The camera passes the door
 * leaf's own plane 35cm clear of it, against a near plane of 0.14.
 */
const ST_MOUTH: Station = { p: [0.34, 1.94, 0.56], l: [-0.58, 1.66, -4.35] }

/**
 * THE THRESHOLD. Inside, a step past the wall, and the first thing lit is the
 * fire — which is what the aim is on: the firebox's own opening, at
 * (FIRE_X, 1.06, -5.7).
 *
 * `y = 2.05` is the same standing eye, now on a floor at 0.42.
 */
const ST_THRESH: Station = { p: [0.28, 2.05, -0.72], l: [-1.05, 1.5, -5.5] }

/**
 * ── THE ROOM ──────────────────────────────────────────────────────────────
 *
 * **This beat is a room seen at an angle now, not a table seen from above, and
 * that is the site owner's call:** "don't even show the top view of the table,
 * just show an angle inside the cabin and then continue with having the window
 * shot. So no more top view of the table."
 *
 * The station it replaces stood 1.97m ABOVE the table top and looked down at 59
 * degrees, which is a plan view of a surface. This pair stands at a person's
 * eye — 1.61m above the floor at the start, 1.54m at the end — beside the
 * table's east edge, and looks WEST across it. The eye height is the whole
 * difference: at 59 degrees a table is a shape, and at 25 the same table is a
 * plane running away from you with a room standing behind it.
 *
 * **The paper is still the card grid's backdrop and that has not moved.** The
 * owner cut the top view, not the table, and `T_PAPER`'s note is still the
 * reason the middle of this frame is one flat field. What changed is how much
 * of the frame it is, and WHEN — see the creep below.
 *
 * ── the arrival, at A ────────────────────────────────────────────────────
 *
 * 25 degrees below horizontal, due west, from 1.82m short of the aim along the
 * ground. The frame's top ray clears the table's far edge and runs on to the
 * west wall, so the top 262px of a 900px frame is the room itself: the wall,
 * the sill of the west window at the right-hand edge, the table's own far edge
 * cutting across under them. That is the "angle inside the cabin" the owner
 * asked for, and it is a legibility choice as well as a composition one —
 * measured off the live DOM, `#apps .card`'s union at this exact p is
 * 130..1310 by 464..1677, so the whole of that band is 202px above the first
 * card in the grid.
 *
 * `z = -1.25` and not -1.02, and that 23cm is the one number on this station
 * that was found by measuring rather than by composing. At -1.02 the frame's
 * left edge runs off the table's SOUTH end part way up the shot and picks up
 * the south wall behind it — a dark wedge reaching down to y = 500, which is
 * 38px inside the card box at this p and measured 46.3 on the step metric. At
 * -1.25 the same edge stays on the sheet and the whole beat measures 7.8 or
 * better. It costs nothing at the other end: the west window's own sill is
 * still in the top-right of the frame, and still above every card.
 *
 * ── the settle, A to A + 0.246(T - A) ────────────────────────────────────
 *
 * **`ROOM_SETTLE` is not a taste number: it is where the card grid's own top
 * edge reaches the top of the frame.** The grid's union in the viewport, read
 * off the live DOM at 1440x900, is 130..1310 by 464..1677 at p = A, and 464px
 * of scroll out of a 4287px pin is 0.1082 of the walk, which is 0.2456 of
 * (T - A). So the settle ends at exactly the p where the reader's cards first
 * cover the top of the shot — and what the settle does over its 465px is take
 * the room band out of that top. 25 degrees to 40, and 0.48m of dolly in and
 * down along its own sightline.
 *
 * The two ends are solved against each other and the render is the check.
 * `ST_ROOM_SET`'s whole frame lands on the paper with 0.21m to spare on its
 * tightest side; the largest luminance step inside the card box, sampled on a
 * 48 by 48 grid off the live canvas, runs 6.0 at p = A, 6.0 at 0.43, 7.0 at
 * 0.46, 6.0 at 0.50 and 6.0 everywhere after. The top-down station this
 * replaced measured 8.0 / 11.5 / 10.4 / 55.4 / 56.7 on the same metric at the
 * same five points, so the angled shot is FLATTER behind the cards than the
 * plan view was, at every point in the beat.
 *
 * ── the drift, on to A + 0.72(T - A) ─────────────────────────────────────
 *
 * "when the user is scrolling the cards, since there are more project cards,
 * you can still move with the camera but very slowly." This is the very
 * slowly: 0.45m over 895px, which is 0.5mm of camera per pixel of scroll and
 * 0.2 degrees of pan per sample of sixty. It is the slowest leg in the shot by
 * a factor of two, it is the only one nobody can see moving, and it is still
 * not a hold — over the whole of it the frame closes 2 degrees and the table's
 * near edge travels a fifth of the frame's width.
 *
 * It is also what the SPEED curve wants. The turn arrives at 7.7 m per unit of
 * walk progress and the lift leaves at 8.5, and 2.2 in between is the dip the
 * reading beat is; `CORNER` rounds both changes over about 450px. A drift a
 * tenth of this length would have been a hold with a rounding error on it.
 */
/* ── the three room stations FACE THE FIRE, and that is the owner's call ────
 * They used to aim due WEST at y = 1.18, which is the table's own top surface
 * (TABLE_Y), from an eye at 1.90-2.03 — a metre above it. That is a shot of a
 * tabletop seen from above with the room behind the camera, and the owner
 * reported it twice: "the camera facing the desk, instead just show a nice
 * scene with the campfire and inside of cabin while showing edge of table with
 * a paper on it".
 *
 * So the aim swings NORTH to the hearth. The firebox is at FIRE_X = -1.25 and
 * FIRE_Z = FP_BZ + 0.34, and every `l` below points within a few centimetres of
 * it, which makes the fire the subject of the frame and the room around it the
 * picture. The eye drops to 1.74-1.84 — a standing person rather than someone
 * leaning over a table — so the walls have height and the roofline is above the
 * frame instead of the floor filling it.
 *
 * The aim sits at y 1.66-1.68, a few centimetres BELOW the eye rather than the
 * half-metre a level shot would put there, and that is composition rather than
 * physics: the card grid takes the middle 82% of the frame at this beat, so a
 * hearth aimed at dead centre is a hearth behind four cards. Aiming a shade
 * high drops the firebox and its light into the lower third, where the grid's
 * floor and the gaps between its columns let it read.
 *
 * **The table did not move and it is still in shot.** It spans x -2.96..-0.97
 * and z -0.1..-2.88; the eye sits EAST of it at x -0.10..-0.75 and drifts north
 * past it, so its east edge and the paper on it enter the lower left of the
 * frame as foreground and stay there for the whole beat. That is the "edge of
 * table with a paper on it" half of the note, and it is what the image the
 * owner is sending will land on — see PAPER_X0/PAPER_Z0 and the `sheet()` call
 * they feed, which is deliberately ONE flat quad with its own colour constant
 * so a texture can be dropped onto that face later without touching anything
 * else. This file still loads zero textures, on purpose; its header argues it.
 *
 * The drift is west and slightly UP across the beat, ending 0.4m from
 * ST_WINDOW's eye so the swing onto the west window is short and the speed
 * curve does not have to spike to cover it.
 */
const ST_ROOM: Station = { p: [-0.1, 1.74, -0.8], l: [-1.05, 1.66, -5.9] }
const ST_ROOM_SET: Station = { p: [-0.38, 1.78, -1.3], l: [-1.2, 1.66, -5.95] }
/* ── the aim is ALREADY turning when this station is reached ───────────────
 * It used to end aimed at [-1.5, 1.68, -6], due north at the hearth, and the
 * next station is [-3.14, 1.82, -3.1], due west at the window. Interpolating a
 * look-AT point in a straight line between those two swings it through the
 * middle of the room — the aim tracks the chord rather than the arc, so the
 * frame kicks right before it comes back left. The owner saw exactly that:
 * "the camera jolts a little bit to the right then moves to the left quickly,
 * it should just smoothly focus and turn to the left cleanly to the window".
 *
 * Ending part-way round removes the kick without needing a slerp: from
 * [-2.42, 1.74, -4.55] the rest of the path to the window is a short arc a
 * straight line already approximates well, and the leg BEFORE it turns
 * gradually across the whole Apps beat instead of holding north and then
 * snapping. The eye barely moves, which is what keeps the room steady behind
 * the cards while the aim does the work. */
const ST_ROOM_END: Station = { p: [-0.78, 1.86, -2.2], l: [-2.42, 1.74, -4.55] }

/**
 * THE WINDOW. The west window is 1.66 wide and 1.26 tall centred at
 * (-3.14, 1.79, -3.03), and this is where the reader arrives at it.
 *
 * The eye is level with the window's own centre and 1.9m off it, square to the
 * wall to within 9 degrees. At that distance the opening is 47 degrees wide
 * against a 54-degree frame, so it fills the middle of the shot with its own
 * light and the wall carries the corners — which is the same job the paper
 * does one beat earlier, done by the brightest field in the room instead of by
 * the flattest one.
 */
const ST_WINDOW: Station = { p: [-0.85, 1.9, -2.6], l: [-3.14, 1.82, -3.1] }

/**
 * And the dolly, which is now the WHOLE of the tools section rather than the
 * last fifth of it. The owner: "the window shot, have it look at the window,
 * and getting closer with the scrolls slowly for the small tools section."
 *
 * It used to hold at `ST_WINDOW` for 657px and then push 165px. It now runs the
 * full 686px from T to the release, at 7.0 m per unit of walk progress — the
 * second slowest leg in the shot, and slower than the 8.5 of the lift that
 * hands over to it, so the reader feels the camera settle rather than start.
 *
 * **What that costs, measured, and what it buys.** A dolly changes what is
 * behind the tools cards every frame, so the honest number is the worst frame
 * rather than the settled one. Sampled on a 48 by 48 grid inside `#tools
 * .card`'s own union at 1440x900, the largest luminance step behind the cards
 * runs 107 at the arrival, 109 at 0.90, 97 at 0.95 and 153 at 0.99. The build
 * this replaced held at `ST_WINDOW` and then pushed, which puts 107 / 109 / 49
 * at the same first three and reaches this same station — and its own 162 — at
 * the release. So the worst frame of the beat is 9 values BETTER than it was
 * (`FOG_OUT_NEAR` is why), and the price is the middle of the dolly, where a
 * frame that used to be a window in a wall is now the forest through it.
 *
 * It closes to 1.22m off the wall and the opening overflows the frame on all
 * four sides — measured from this station, the window's south jamb is 31.6
 * degrees off the axis against a 23.7 degree frame edge, its north jamb 36.7
 * against 30.3, its head 23.9 up against 7.5 and its sill 30.5 down against
 * 27.9. Not one edge of the window is left in the picture: it stops being a
 * thing in a wall and becomes the field the canvas fades out of, with nothing
 * anywhere in frame for the section below to cut against.
 *
 * It also tilts 10 degrees DOWN, which is the "washes toward the outside light"
 * of the brief taken literally. At night the brightest thing out there is the
 * snow, not the sky: aimed level, the frame came out half dark treeline and
 * half snowfield with the horizon straight across the middle of it, which is a
 * cut edge by another name. Aimed down, the snow is the bottom three quarters.
 */
const ST_WINDOW_IN: Station = { p: [-1.92, 1.88, -2.95], l: [-3.14, 1.66, -3.02] }

/**
 * The legs, in order, from the door onward. Leg `i` of `shotAt` runs
 * `LEGS[i - 2]` to `LEGS[i - 1]`; legs 0 and 1 are the orbit and the run-in,
 * which are not a pair of stations.
 *
 * A table rather than a chain of `if`s because the corner rounding evaluates
 * TWO legs per frame and one of them is always the neighbour of the other.
 */
const LEGS: Station[] = [
  ST_DOOR,
  ST_MOUTH,
  ST_THRESH,
  ST_ROOM,
  ST_ROOM_SET,
  ST_ROOM_END,
  ST_WINDOW,
  ST_WINDOW_IN,
]

/**
 * Where the approach rests for a reduced-motion visitor, as a fraction of the
 * ORBIT's own leg.
 *
 * `WALK_REST` is 0.62 and its note carries what that frame is: the camera 17.6m
 * out and 16.1 degrees off axis, the cabin whole in the frame with its windows
 * already warm. That is a DISTANCE, and the distance is what has to survive —
 * the approach's parameter changed in this pass and the frame must not. So the
 * distance is computed from the ramp `WALK_REST` used to mean, and then the new
 * ease is inverted to find the parameter that reaches it. Nothing is typed
 * twice and the rest frame is the same picture it was.
 */
const REST_DIST = 1 / (1 / Z_FAR + smooth(WALK_REST) * (1 / Z_NEAR - 1 / Z_FAR))
const REST_K = approachEaseInv(
  (1 / REST_DIST - 1 / Z_FAR) / (1 / Z_NEAR - 1 / Z_FAR),
)

/**
 * How the INTERIOR stations answer a narrow frame — and it is the OPPOSITE of
 * how the exterior does, which is the whole reason it is its own number and
 * carries a sign.
 *
 * Outside, a narrow frame stands FURTHER BACK so the cabin still fits: that is
 * `pullFor`, and its exponent is positive. Inside, backing off is exactly wrong
 * and the measurement is unambiguous. `fovFor` clamps the vertical angle at
 * FOV_MAX, so a portrait frame does not get narrower, it gets TALLER: at a
 * 390x780 slice the vertical field is 60 degrees against a desktop's 35, and a
 * camera looking down at a table then sees the floor from its own feet out to
 * several metres — the paper is 2.5m long and it cannot fill that whatever tone
 * it is. Measured, at the room beat, as the fraction of the card area that is
 * NOT paper:
 *
 * ```
 *   scale about the aim   1.40  1.20  1.00  0.80  0.70  0.60  0.55  0.50
 *   phone, card area      50%   41%   30%   14%   2.5%   0%    0%    0%
 *   phone, whole frame    56%   49%   39%   24%   13%   3.8%  1.3%   0%
 * ```
 *
 * So the interior moves IN, and it is keyed on the VERTICAL field rather than
 * on `framePull`. That distinction was measured too, and it is the difference
 * between working and not: `framePull` is derived from the HORIZONTAL half
 * angle, and a 768x1024 tablet has the same 60-degree vertical field as a
 * 390x780 phone while its `framePull` is 1.10 against the phone's 1.41. Keyed
 * on `framePull` the tablet got a pull of 0.89 and framed 21.3% non-paper; on
 * the vertical field both get 0.55 and both frame 0.0%.
 *
 * `V_REF / tan(vHalf)` is that rule, and what it means is "keep the same
 * footprint on the table however tall the frame gets": the far edge of what a
 * downward camera sees is `height / tan(pitch - vHalf)`, and scaling the
 * station about its aim scales that height by exactly this factor.
 *
 * The floor at 0.5 is not decoration. The vertical field is clamped at FOV_MAX
 * so this bottoms out at 0.55 today, but a future FOV_MAX would keep going, and
 * unchecked it would take the room station's eye under the table top.
 */
const V_REF = Math.tan(((fovFor(16 / 10) * Math.PI) / 180) / 2)
const IN_PULL_MIN = 0.5
function inPullFor(fov: number) {
  return Math.max(IN_PULL_MIN, Math.min(1, V_REF / Math.tan(((fov * Math.PI) / 180) / 2)))
}

/**
 * Keep the eye off the surfaces. Every station is inside the room by
 * construction, so this only ever bites after `inPullFor` or the corner
 * rounding has moved one, and it is a guard rather than a shaper: at 320x800,
 * the narrowest slice this site supports, `inPullFor` returns 0.552 and the
 * room station lands 1.00m off its aim, where every margin here is still slack.
 * The margins are the near plane plus a hand's width.
 *
 * **It runs only from the THRESHOLD knot onward**, and the note at the call
 * site has the render that proved that gate has to exist: applied to the
 * threshold, its `IN_Z0 - 0.25` snapped the camera from the door mouth to
 * inside the room on the first frame of the beat and the walk through the
 * doorway never happened.
 */
function clampRoom(e: V) {
  e[0] = Math.min(IN_X - 0.3, Math.max(-IN_X + 0.3, e[0]))
  e[2] = Math.min(IN_Z0 - 0.25, Math.max(IN_Z1 + 0.35, e[2]))
  e[1] = Math.min(ceilAt(e[0]) - 0.25, Math.max(IN_Y + 0.55, e[1]))
}

/**
 * The orbit, as a function of its own 0..1 ease.
 *
 * Apparent size, not distance, is what the eye reads on an approach, and
 * apparent size goes as 1/d. Interpolating the RECIPROCAL of the distance means
 * the cabin grows at an even rate across the scroll; interpolating the distance
 * itself makes the last third of the walk lunge.
 *
 * `u` is linear in DISTANCE rather than in apparent size, which is what puts
 * the swing at the far end of the walk and leaves the last third a clean
 * straight push-in. See `AZ_FAR`.
 *
 * It is clamped at 1, so past its own end the orbit holds its last pose and the
 * run-in takes over — which is exactly what the shipped spline did, and the
 * reason it must keep doing it is `Y_NEAR`: extrapolated, the eye height keeps
 * falling and the camera would dip to 0.69 before rising to the door step.
 * The corner rounding at `KNOT[1]` is what makes the hand-over C1 without an
 * extrapolation, and it is why this can be clamped and still not jolt.
 */
function orbitAt(ease: number, framePull: number, e: V, l: V) {
  const near = Z_NEAR * framePull
  const dist = 1 / (1 / Z_FAR + (1 / near - 1 / Z_FAR) * clamp01(ease))
  const u = clamp01((Z_FAR - dist) / (Z_FAR - near))
  const az = AZ_FAR + (AZ_NEAR - AZ_FAR) * u
  e[0] = Math.sin(az) * dist
  e[1] = Y_FAR + (Y_NEAR - Y_FAR) * u
  e[2] = LOOK_Z + Math.cos(az) * dist
  l[0] = 0
  l[1] = LOOK_Y_FAR + (LOOK_Y_NEAR - LOOK_Y_FAR) * u
  l[2] = LOOK_Z
}

/** Scratch for the orbit's end pose and its finite difference. */
const ORB_P: V = [0, 0, 0]
const ORB_L: V = [0, 0, 0]
/**
 * ── the aim is a DIRECTION, not a point ───────────────────────────────────
 *
 * `lookAt` only ever reads the direction, so where along its own sightline a
 * station's aim point sits is free — and interpolating the POINT makes that
 * free choice steer the pan. Measured on the first build of this spline, at 60
 * samples across the walk: the turn's own aim ran from the firebox 5.00m off
 * the eye to the table 2.01m off it, and because the same linear travel
 * subtends more angle the nearer it gets, the pan came out at 4.5, 6.4, 9.0,
 * 15.2 and 21.6 degrees per sample. A pan that accelerates fivefold into its
 * own end is the "jolts too quickly" of the owner's note, and no amount of
 * corner rounding fixes it, because the speed of the EYE was smooth the whole
 * way through.
 *
 * So every station's aim is stored as written — the numbers above are all
 * solved against something real and must stay readable — and converted once, at
 * import, into a unit direction from its own eye. The legs interpolate that and
 * re-normalise (`nlerp`, which is inside 4% of a true slerp below 90 degrees
 * and costs one square root), and the aim point handed to `lookAt` is put a
 * fixed 2m along it. Every composed frame is identical; only the path between
 * two of them changes, and it changes from "swings faster the closer it gets"
 * to "turns at an even rate".
 */
const AIM_D = 2
const AIM_DIR: V[] = LEGS.map((st) =>
  norm([st.l[0] - st.p[0], st.l[1] - st.p[1], st.l[2] - st.p[2]]),
)
const aimAlong = (e: V, dx: number, dy: number, dz: number, l: V) => {
  const n = Math.hypot(dx, dy, dz) || 1
  l[0] = e[0] + (dx / n) * AIM_D
  l[1] = e[1] + (dy / n) * AIM_D
  l[2] = e[2] + (dz / n) * AIM_D
}

/**
 * One leg of the path at its own parameter `k`, which is LINEAR in walk
 * progress and is allowed outside 0..1 so a corner can be rounded by
 * cross-fading two legs' extrapolations.
 *
 * Leg 0 is the orbit; leg `i` after that runs `LEGS[i - 2]` to `LEGS[i - 1]`,
 * with the orbit's own end pose standing in for `LEGS[-1]` on leg 1. Straight
 * lines for the eye and `nlerp` for the aim, and no `smooth` anywhere: the
 * easing in this shot is the corner rounding and the approach's own 1/d law,
 * and nothing else.
 */
const ORB_H = 0.004
const ORB_D: V = [0, 0, 0]
function legAt(i: number, k: number, framePull: number, e: V, l: V) {
  if (i === 0) {
    if (k <= 1) {
      orbitAt(approachEase(k), framePull, e, l)
      aimAlong(e, l[0] - e[0], l[1] - e[1], l[2] - e[2], l)
      return
    }
    /*
     * Past its own end the orbit is CLAMPED — `orbitAt` says why the eye height
     * cannot be extrapolated round the circle — so the corner rounding gets a
     * straight continuation of the orbit's last velocity instead, by finite
     * difference off its own end. This is only ever asked for inside `KNOT[1]`'s
     * window, and it is what makes the hand-over C1: a clamped curve has ZERO
     * velocity past its clamp, and blending against zero would throw away 46% of
     * the approach's arriving speed on one frame, which is a jolt in the middle
     * of the one stretch of this shot nobody is allowed to touch.
     */
    orbitAt(1, framePull, e, l)
    aimAlong(e, l[0] - e[0], l[1] - e[1], l[2] - e[2], l)
    orbitAt(1 - ORB_H, framePull, ORB_P, ORB_L)
    aimAlong(ORB_P, ORB_L[0] - ORB_P[0], ORB_L[1] - ORB_P[1], ORB_L[2] - ORB_P[2], ORB_L)
    const g = ((k - 1) * (2 - APPROACH_EASE)) / ORB_H
    for (let j = 0; j < 3; j++) {
      e[j] += (e[j] - ORB_P[j]) * g
      l[j] += (l[j] - ORB_L[j]) * g
    }
    return
  }
  let ap: V
  let ad: V
  if (i === 1) {
    orbitAt(1, framePull, ORB_P, ORB_L)
    ORB_D[0] = ORB_L[0] - ORB_P[0]
    ORB_D[1] = ORB_L[1] - ORB_P[1]
    ORB_D[2] = ORB_L[2] - ORB_P[2]
    const n = Math.hypot(ORB_D[0], ORB_D[1], ORB_D[2]) || 1
    ORB_D[0] /= n
    ORB_D[1] /= n
    ORB_D[2] /= n
    ap = ORB_P
    ad = ORB_D
  } else {
    ap = LEGS[i - 2].p
    ad = AIM_DIR[i - 2]
  }
  const b = LEGS[i - 1]
  const bd = AIM_DIR[i - 1]
  for (let j = 0; j < 3; j++) e[j] = ap[j] + (b.p[j] - ap[j]) * k
  aimAlong(
    e,
    ad[0] + (bd[0] - ad[0]) * k,
    ad[1] + (bd[1] - ad[1]) * k,
    ad[2] + (bd[2] - ad[2]) * k,
    l,
  )
}

/** Scratch for the corner rounding's second evaluation. Nothing allocates. */
const CRN_P: V = [0, 0, 0]
const CRN_L: V = [0, 0, 0]

/**
 * The whole camera, as a function of walk progress.
 *
 * Every leg is linear in `t`, so its speed is a positive constant, and every
 * station is rounded by an asymmetric `smooth` cross-fade of the two legs that
 * meet there — so the speed curve is continuous, is never zero, and still
 * passes through every composed station exactly. `CORNER` and the header at the
 * top of this section have the argument and the measurements.
 *
 * `knotsOf` has to have run. The eye and the aim come back in the two arrays
 * passed in; nothing here allocates.
 *
 * Two narrow-frame corrections, and they pull in OPPOSITE directions: the
 * approach takes `framePull` (stand further back so the cabin fits) and the
 * interior takes `inPull` (move closer so the paper fills). `IN_PULL_MIN`'s
 * note is why that is not a contradiction.
 */
function shotAt(t: number, framePull: number, inPull: number, e: V, l: V) {
  let i = 0
  while (i < SEGS - 1 && t >= KNOT[i + 1]) i++
  const span = Math.max(1e-6, KNOT[i + 1] - KNOT[i])
  legAt(i, (t - KNOT[i]) / span, framePull, e, l)

  /*
   * The corner. Only one station can be near enough to matter — `CORNER` is
   * under a half, so the two windows on a leg cannot meet — so this finds the
   * nearer end of the current leg and blends across it if `t` is inside.
   *
   * `w` is `smooth`, so it is 0 with zero slope at the window's start and 1
   * with zero slope at its end: the path leaves the window with the incoming
   * leg's velocity and enters with the outgoing leg's, which is the C1 the
   * whole rebuild is for. At the station itself both lines evaluate to the
   * station, so `w` there is free and the station is hit exactly.
   */
  const lo = t - KNOT[i] < KNOT[i + 1] - t
  const j = lo ? i : i + 1
  if (j > 0 && j < SEGS) {
    const prev = Math.max(1e-6, KNOT[j] - KNOT[j - 1])
    const next = Math.max(1e-6, KNOT[j + 1] - KNOT[j])
    const hPrev = Math.min(CORNER * prev, REACH * next)
    const hNext = Math.min(CORNER * next, REACH * prev)
    if (t > KNOT[j] - hPrev && t < KNOT[j] + hNext) {
      const w = smooth((t - KNOT[j] + hPrev) / (hPrev + hNext))
      // The leg the current one is being blended against: the earlier one if we
      // are past the station, the later one if we are short of it.
      if (lo) legAt(j - 1, (t - KNOT[j - 1]) / prev, framePull, CRN_P, CRN_L)
      else legAt(j, (t - KNOT[j]) / next, framePull, CRN_P, CRN_L)
      const k = lo ? 1 - w : w
      for (let n = 0; n < 3; n++) {
        e[n] += (CRN_P[n] - e[n]) * k
        l[n] += (CRN_L[n] - l[n]) * k
      }
    }
  }

  /*
   * The narrow-frame pull, along the station's own sightline, and then back
   * inside the walls. Both are no-ops on anything as wide as the shot was
   * composed for: `pullFor` returns 1 there.
   *
   * It ramps in across the TURN rather than applying from the threshold, and
   * that is not tidiness. The approach hands over at `ST_DOOR` un-pulled — it
   * has to, because the exterior takes `framePull` at full strength and a step
   * in the pull at that knot would be a jump in the middle of a move. Pulling
   * the threshold would also compress the one part of this shot with no room to
   * spare: the camera passes the door leaf's free edge with 15cm to spare on
   * the line it is on, and a station shifted toward a fireplace 5m to the
   * north-west is a station that clips it. So the door and the threshold are
   * always as composed, and the pull arrives over the turn, where the camera is
   * in open room.
   *
   * `smooth` here is not a hold: it weights a CORRECTION rather than the path,
   * and its zero slope at the threshold knot is exactly what keeps the pull
   * from stepping the velocity as it arrives.
   */
  if (t <= KNOT[4]) return
  const ramp = smooth((t - KNOT[4]) / Math.max(1e-4, KNOT[5] - KNOT[4]))
  if (inPull < 0.999) {
    const pull = 1 + (inPull - 1) * ramp
    for (let n = 0; n < 3; n++) e[n] = l[n] + (e[n] - l[n]) * pull
  }
  /*
   * And back inside the walls — also only from the turn, and that gate is not
   * optional. `clampRoom` pins z to `IN_Z0 - 0.25`, which is 25cm inside the
   * south wall; run over the THRESHOLD leg it snaps the camera from the door
   * mouth to just inside the room on the first frame of the beat, and the whole
   * walk through the doorway never happens. It was written that way and the
   * render caught it: at walk 0.34 the shot was already at the fireplace with
   * `insideness` still reading 0.12, so the fire was at a tenth of its opacity
   * in a frame that was entirely interior.
   */
  clampRoom(e)
}

/**
 * Is a world point inside the room's own footprint? Used by the snow, which
 * rides the camera in a 26m box and would otherwise fall indoors — see the tick.
 *
 * The margin is generous on purpose: a flake half a metre outside a wall is
 * seen through a window at a glancing angle where it reads as a flake in the
 * WALL, and a flake half a metre outside the south wall is standing in the
 * doorway.
 */
function inRoom(x: number, z: number) {
  return x > -IN_X - 0.5 && x < IN_X + 0.5 && z < IN_Z0 + 0.5 && z > IN_Z1 - 0.5
}

/* ────────────────────────────────────────────────────────────────────────────
   Smoke
   ──────────────────────────────────────────────────────────────────────────*/

/**
 * How the chimney smoke moves. Slow, on purpose: this sits behind seven
 * chapters of prose, and the one thing a backdrop must never do is ask to be
 * watched. A puff takes about eleven seconds to cross its whole life, which is
 * slower than the eye follows unless it is asked to.
 */
const SMOKE_RATE = 0.085
/**
 * It leans far more than it climbs, and that is framing rather than weather.
 * A plume rising 7.6m straight up left the frame after its first metre and a
 * half and the rest of it was drawn for nobody. Leaning it downwind keeps the
 * whole life of a puff inside the band of sky over the roof, and a plume
 * bending off a chimney is what the reference paintings draw anyway; smoke
 * going straight up is smoke on a windless day, which this is visibly not.
 *
 * **Lowering the eye took a degree and a half of that band, so these moved.**
 * They were 3.6 / 5.4 / 2.2, solved against a camera whose axis at the rest
 * pose pointed 2.9 degrees DOWN; it now points 0.7 degrees up, which lifts
 * everything above the horizon toward the top edge. Re-measured on a 1440x900
 * slice, as the fraction of the frame's half-height each puff reaches (1.0 is
 * the top edge):
 *
 * ```
 *   puff age q        0.10  0.25  0.40  0.55  0.70  0.85
 *   its own alpha     0.57  0.56  0.36  0.20  0.09  0.02
 *   was, at rest      0.69  0.78  0.87  0.97  1.07  1.17
 *   is, at rest       0.67  0.74  0.81  0.88  0.96  1.04
 *   is, at the door   0.87  0.96  1.05  1.15  1.26  1.37
 * ```
 *
 * At the rest pose — the frame a reduced-motion visitor gets, and the one this
 * was solved for before — the whole plume is now inside the frame instead of
 * losing its last third. At the door it climbs out of shot from about q 0.4,
 * and that is correct rather than a failure: the reader is standing at the
 * house looking up at it, and smoke going over your head is what that looks
 * like. Every puff still leaves the chimney inside the frame, which is the
 * part that has to read.
 */
const SMOKE_RISE = 2.7
const SMOKE_WIND_X = 6.6
const SMOKE_WIND_Z = 2.6
const SMOKE_R0 = 0.34
const SMOKE_R1 = 3.1
/**
 * Rim points on a puff, which is also its triangle count. See `layoutSmoke`.
 *
 * The FIRE's ember bed reads it too — it is the same fan built the same way,
 * for the same reason (a shape with no edge anywhere), and giving it a second
 * constant of its own would be one number kept in two places that must agree
 * about nothing.
 */
const SMOKE_TRIS = 5

const SNOW_HX = 13
const SNOW_HY = 14
const SNOW_HZ = 15
/**
 * How far ahead of the camera the flake box sits, ALONG THE LOOK DIRECTION.
 *
 * It was -7 and it is 7, and nothing about the picture changed: the tick used
 * to push the box with the orbit's own azimuth, where "ahead" came out with the
 * opposite sign, and it now pushes it with the normalised forward vector, where
 * a positive number means forward. The old form could not survive a camera that
 * turns in a room; see the note where `fwdX` is computed.
 */
const SNOW_AHEAD = 7
const SNOW_SIZE = 0.055
