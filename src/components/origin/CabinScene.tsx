import { useEffect, useRef } from 'react'
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Fog,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Scene,
  WebGLRenderer,
} from 'three'
import { clamp01, onFrame, settle, wake } from '../../lib/motion'
import { MAX_DPR, onDprChange } from '../../lib/dpr'

/**
 * The Origin section's backdrop: a cabin in a snowy forest that the reader
 * walks toward as they read the seven chapters. Far, cold and seen from the
 * corner at the top of the section; at the door, close and still slightly
 * angled, by the bottom of it. It is also a nod to Makullveny's own flagship
 * theme, "Cozy Cabin".
 *
 * ## What is in the picture, and where it came from
 *
 * The composition answers two reference paintings the site owner supplied — a
 * log cabin in a snowy wood at night — and their contents are the spec:
 *
 * - a deep blue night sky, never black, with the distant hills a soft LIGHTER
 *   band on the horizon (`HILL_R`, and the tone ladder above `T_TREE`)
 * - a real forest in ranks: near pines almost black with visible bare trunks
 *   and cropped by the frame, and behind them ranks that go paler and bluer
 *   with distance (`TREES`, `RANKS`, `RANK_R`)
 * - the cabin in the middle distance, log-built, stone chimney, smoke rising,
 *   a porch, windows glowing warm
 * - the window light POOLING on the snow and falling off fast, which is the
 *   emotional centre of both paintings and of this scene (`pool`, `halo`)
 * - ground that has been walked on: drifts, a footpath trodden to the door,
 *   bare weeds and small rocks (`driftAt`, `PATH`, `WEEDS`, `STONES`)
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
 * The whole scene is **five draw calls**, and its triangle count is a range
 * rather than a number, because the tier decides it. Measured from
 * `renderer.info.render.triangles` on a frame that drew: **721 on `low`, 1084
 * on `mid`, 1467 on `high`**, plus 200 / 420 / 640 snow points. `low` is not an
 * edge case — it is every viewport under 760px and every machine with four
 * cores or fewer, which is most phones — so a single figure quoted from `high`
 * describes the scene most visitors never get.
 *
 * Those were 342 / 462 / 600 in four calls before the forest, the ground
 * detail and the chimney smoke, and the growth is where a low-poly scene
 * should spend: **more instances of cheap shapes, not detail on one.** A far
 * tree is one triangle, a weed is one, a rock is four; the two ranks of
 * treeline behind the cabin cost less between them than three near conifers.
 * The fifth draw call is the smoke, which needs its own material because it is
 * lit by the sky and everything else warm in the scene is lit by the fire.
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
 * `Origin.tsx` is the live mount:
 *
 * ```tsx
 * const CabinScene = lazy(() =>
 *   import('./origin/CabinScene').then((m) => ({ default: m.CabinScene })),
 * )
 * // ...inside <section id="origin" className="section section--blend stage-host origin">
 * <Stage className="origin__stage">
 *   {cabin ? (
 *     <Suspense fallback={null}>
 *       <CabinScene className="origin__cabin" />
 *     </Suspense>
 *   ) : null}
 * </Stage>
 * ```
 *
 * `.origin__cabin` in `Origin.css` is `position: absolute; inset: 0; width:
 * 100%; height: 100%; display: block`, and that is all it has to be:
 * `.stage__pin` is already sticky and one viewport tall. There is no
 * `margin-bottom: -100svh` anywhere and there must not be — `Stage`'s outer
 * box is `position: absolute; inset: 0`, so it takes no flow space and there is
 * nothing to cancel. (An earlier version of this header prescribed exactly that
 * negative margin, on a `.origin__scene` class that has never existed anywhere
 * in this repo. It was wrong before `Stage` was written and it is wronger now.)
 *
 * `cabin` is Origin's own deferred-mount flag and not part of this component's
 * contract: `React.lazy` splits the chunk but fires the import the moment the
 * component renders, so the flag is what stops a visitor who reads the hero and
 * leaves from downloading three.js. See `Origin.tsx`.
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
 *   the loop only while the damped camera is still converging, while snow is
 *   falling in view, or while a theme cross-fade is running — the chimney
 *   smoke adds no new reason to hold, because it only ever moves on frames
 *   the snow was already keeping alive — and it returns
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
 *   merges with the sky, and windows that read warm against daylight rather
 *   than as a beacon. See `ROLES`. Everything the art pass added goes through
 *   the same ramp, which is why the forest recedes correctly in both:
 *   dark's sky sits at the BOTTOM of that ramp and light's near the top, so
 *   one fog mix lifts a distant rank off the one and sinks it toward the
 *   other.
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
 * beyond the three.js module itself. Measured on this build: the lazy chunk is
 * **527 kB raw / 136.8 kB gzipped**, and `npm run build` puts three.js and
 * this file in it and neither in the entry bundle. It is a separate file only
 * because of the dynamic import — pull this in statically and all of that
 * lands in the entry bundle, which is already flagged at 500 kB. (The forest
 * and the ground detail cost 8 kB raw and 3.8 kB gzipped of that, over the
 * 519 / 133 it was before them. Geometry built from named constants
 * compresses; a mesh would not have.)
 */
export function CabinScene({ className }: { className?: string }) {
  const host = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const mount = host.current
    if (!mount) return
    const section = mount.closest('section')
    if (!section) return

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

    const camera = new PerspectiveCamera(FOV_MIN, 1, 0.6, 220)

    const geometries: BufferGeometry[] = []
    const materials: (MeshBasicMaterial | PointsMaterial)[] = []

    // The world: ground, cabin, trees. One merged non-indexed geometry with a
    // per-vertex tone, so the whole thing is one draw call and the facet steps
    // that make it read as low-poly art are baked in rather than lit at
    // runtime. `bodyTone` is kept because a theme change re-derives the colour
    // buffer from it — the shape never changes, only the two ends of the ramp.
    const world = buildWorld(tier)
    const bodyTone = new Float32Array(world.tone)
    const bodyGeo = new BufferGeometry()
    bodyGeo.setAttribute('position', new BufferAttribute(new Float32Array(world.pos), 3))
    const bodyColor = new BufferAttribute(new Float32Array(bodyTone.length * 3), 3)
    bodyGeo.setAttribute('color', bodyColor)
    const bodyMat = new MeshBasicMaterial({ vertexColors: true })
    const body = new Mesh(bodyGeo, bodyMat)
    scene.add(body)
    geometries.push(bodyGeo)
    materials.push(bodyMat)

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
      invalidate()
    })
    themes.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

    const applyPalette = (p: Palette) => {
      const span = p.ceil - p.floor
      const arr = bodyColor.array as Float32Array
      for (let i = 0; i < bodyTone.length; i++) {
        const t = p.floor + bodyTone[i] * span
        const at = i * 3
        arr[at] = toLinear(p.deep[0] + (p.pale[0] - p.deep[0]) * t)
        arr[at + 1] = toLinear(p.deep[1] + (p.pale[1] - p.deep[1]) * t)
        arr[at + 2] = toLinear(p.deep[2] + (p.pale[2] - p.deep[2]) * t)
      }
      bodyColor.needsUpdate = true
      setLinear(fog.color, p.sky)
      setLinear(coreMat.color, p.warm)
      setLinear(softMat.color, p.warm)
      // Falling snow has to be seen against BOTH the sky and the cabin. On the
      // night scene that is near-white. On the day scene near-white snow over a
      // near-white sky is invisible, so the flakes sit part way down the ramp:
      // clearly lighter than the walls, clearly darker than the sky.
      const f = p.flake
      snowMat.color.setRGB(
        toLinear(p.deep[0] + (p.pale[0] - p.deep[0]) * f),
        toLinear(p.deep[1] + (p.pale[1] - p.deep[1]) * f),
        toLinear(p.deep[2] + (p.pale[2] - p.deep[2]) * f),
      )
      snowMat.opacity = p.snowAlpha
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
      smokeMat.opacity = p.smokeAlpha
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
      if (area > MAX_PIXELS) dpr = Math.max(0.75, dpr * Math.sqrt(MAX_PIXELS / area))
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

    const stop = onFrame(({ vh, mi, dt, now, hold }) => {
      if (!alive || !cssW || !cssH) return
      const rect = section.getBoundingClientRect()

      // 0 as the section's top reaches the viewport bottom, 1 as its bottom
      // reaches the viewport top — the same measure `useSectionProgress` makes
      // a hook of, and for the same reason: it is a rect, not a scroll offset,
      // so it does not care which element owns the scroll.
      //
      // The walk itself is mapped onto a SUB-RANGE of that. At progress 1 the
      // section is entirely above the viewport, so a walk that finished there
      // would finish where nobody could see it. WALK_OUT puts the reader at the
      // door at roughly the moment the last chapter reaches the bottom of the
      // screen, and holds them there while the section leaves.
      const p = (vh - rect.top) / (vh + rect.height)
      const wanted =
        mi === 0
          ? WALK_REST
          : clamp01((clamp01(p) - WALK_IN) / (WALK_OUT - WALK_IN))

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
        return
      }

      /*
       * Reduced motion SNAPS to the rest frame. It does not ease to it.
       *
       * `wanted` is already WALK_REST at mi 0, but the damped `walk` below is
       * not, and letting it converge is a camera pulling back over about a
       * second: `motion.ts` wakes the loop for a full second on the media-query
       * change and this tick holds it, so the whole move plays out. The one
       * moment that move would ever happen is the moment somebody standing at
       * the cabin door turned "Reduce motion" ON. `hooks/usePointer.ts` states
       * the rule next door in this same pass and it is the same rule for the
       * same reason: an eased return IS motion, and this is the one time it
       * would ever play.
       *
       * `walk < 0` is the other snap, and always was one: the first frame lands
       * on target rather than flying in from nowhere.
       *
       * Every other time-varying term in this tick already stops dead at mi 0
       * rather than easing. The snow's fall is `fall * step * mi`; its sway is
       * frozen by `t` below; the window opacities are pure functions of `walk`,
       * so they arrive the moment it does. The theme cross-fade is the single
       * exception and it is deliberate — the note on it says why.
       */
      if (walk < 0 || (mi === 0 && walk !== wanted)) {
        walk = wanted
        // The canvas is still showing where the camera used to be, and under
        // reduced motion there is no next frame coming to fix it.
        settled = false
        urgent = true
      }

      // The CANVAS's rect, not the section's. The two are the same thing when
      // this is mounted `inset: 0` over the section and are not when it is
      // mounted in a `Stage`, and it is the painted box that has to be framed.
      // Before the gates rather than after them; frameSlice says why, and what
      // it costs on the mount that ships.
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
       * which both bypassed SCENE_HZ and re-ran applyPalette's ~1670 vertex
       * colours at display refresh — and on a fast display most of those frames
       * were painting a mix that had not started moving. `holding` keeps the
       * loop alive across the wait without drawing into it; `fading` is what
       * says there is something new to draw.
       */
      const holding = fadeFrom !== null
      if (holding) fadeK += dt / THEME_FADE
      const fading = holding && fadeK > 0

      const converging = Math.abs(wanted - walk) > WALK_EPS
      const snowing = mi > 0
      if (converging || snowing || holding) hold()
      if (!converging && !snowing && !fading && settled && !dirty) return

      // 30Hz, this section's existing number. A camera on a damped scalar and
      // snow drifting at about a metre a second are both well inside what that
      // reads as, and it is half the GPU work of an uncapped scene sitting
      // behind prose. A scroll that outruns it is absorbed by the damping,
      // which is the other half of why this does not judder on a trackpad.
      //
      // `urgent` is the bypass, and `dirty` is not. A blanked drawing buffer
      // has to be repainted now; a cross-fade is motion, and motion waits its
      // turn like the rest of the motion in here.
      pending += dt
      if (pending < 1 / SCENE_HZ && !urgent) return
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
      // shot: a disclosure growing the section changes `rect.height`, which
      // steps the target, and a welded camera would jump on the frame it
      // happens.
      walk += (wanted - walk) * settle(WALK_RATE, step)

      // Apparent size, not distance, is what the eye reads on an approach, and
      // apparent size goes as 1/d. Interpolating the RECIPROCAL of the distance
      // means the cabin grows at an even rate across the scroll; interpolating
      // the distance itself makes the last third of the walk lunge. The
      // smoothstep on top is the "unhurried" part — it eases in and out of the
      // move so neither end starts or stops on a hard edge.
      const e = walk * walk * (3 - 2 * walk)
      const near = Z_NEAR * framePull
      const inv = 1 / Z_FAR + (1 / near - 1 / Z_FAR) * e
      const dist = 1 / inv
      const u = clamp01((Z_FAR - dist) / (Z_FAR - near))

      // The orbit. See AZ_FAR: `u` is linear in DISTANCE rather than in
      // apparent size, which is what puts the swing at the far end of the walk
      // and leaves the last third a clean straight push-in.
      const az = AZ_FAR + (AZ_NEAR - AZ_FAR) * u
      const sinA = Math.sin(az)
      const cosA = Math.cos(az)
      const camX = sinA * dist
      const camZ = LOOK_Z + cosA * dist
      const camY = Y_FAR + (Y_NEAR - Y_FAR) * u
      camera.position.set(camX, camY, camZ)
      camera.lookAt(0, LOOK_Y_FAR + (LOOK_Y_NEAR - LOOK_Y_FAR) * u, LOOK_Z)

      // The windows warm and brighten as the door gets closer, but the FLOOR
      // matters more than the ramp: at the far end of the walk the cabin is a
      // 100px shape in fog, and the one thing that says "somebody is in" is a
      // warm point of light. At 0.16 it was a smudge; at 0.4 it is a lit
      // window seen through weather. The halo keeps its low
      // floor, because a bloom on something that small is just a blur.
      const lit = e * e * (3 - 2 * e)
      coreMat.opacity = shown.core * (0.4 + 0.6 * lit)
      softMat.opacity = shown.halo * (0.12 + 0.88 * lit)

      // Snow. The box rides the camera; the camera's displacement is taken back
      // out of the flakes so they stay put in the world. It is pushed along the
      // LOOK direction rather than down -z: once the camera orbits, "ahead" and
      // "-z" are up to 38 degrees apart, and a box pushed down -z would sit off
      // to one side of the shot with its near edge inside the frame.
      const boxX = camX + sinA * SNOW_AHEAD
      const boxZ = camZ + cosA * SNOW_AHEAD
      const dx = boxed ? boxX - prevBoxX : 0
      const dz = boxed ? boxZ - prevBoxZ : 0
      prevBoxX = boxX
      prevBoxZ = boxZ
      boxed = true
      snow.position.set(boxX, 0, boxZ)
      // The sway is frozen at mi 0 rather than merely slowed. Left running it
      // would move the flakes sideways on any frame something else forced a
      // redraw — a resize, a theme change — for a visitor who asked for no
      // motion at all.
      const t = mi > 0 ? now * 0.001 : 0
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
        const at = i * 3
        snowPos[at] = x + Math.sin(t * 0.6 + phase[i]) * sway[i]
        snowPos[at + 1] = y
        snowPos[at + 2] = z + Math.cos(t * 0.45 + phase[i]) * sway[i] * 0.6
      }
      snowAttr.needsUpdate = true

      // Smoke. The clock advances only while motion is wanted, exactly like
      // the snow's sway two lines up, and for the same reason: a frame forced
      // by a resize or a theme change must not move anything for a visitor who
      // asked for no motion. The layout still runs, because that ONE frame is
      // the whole picture they get.
      if (mi > 0) smokeT += step
      else smokeT = 0
      layoutSmoke(cosA, -sinA)

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
const Y_FAR = 7.4
const Y_NEAR = 2.45
const LOOK_Y_FAR = 2.9
const LOOK_Y_NEAR = 2
/**
 * The orbit's pivot, and the point the camera looks at. Between the front wall
 * (z = 0) and the cabin's own centre (z = -3): pivot on the centre and the
 * front wall swings across the frame as the camera comes round, pivot on the
 * wall and the swing reads as the cabin sliding sideways.
 */
const LOOK_Z = -2

/**
 * Where in the section's own 0..1 traversal the walk starts and finishes.
 *
 * Progress 0 is the section's top at the viewport bottom and progress 1 is its
 * bottom at the viewport top, so the last fifth of that range happens with the
 * section already above the screen. WALK_OUT lands the reader at the door while
 * they can still see it; after that the shot simply holds.
 */
const WALK_IN = 0.06
const WALK_OUT = 0.8

/**
 * Where the scene rests for a visitor who asked for less motion.
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
 * bring it back. Solved from the ladder: three ranks and a hill band need the
 * factor to still be worth 0.45 at 60m, which is FOG_FAR ≈ 100.
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
 * Ceiling on the backing store, in device pixels. 1.5x on a 1440x900 viewport
 * is 2.9M and clears this; a canvas stretched over a whole 2400px section does
 * not, and this is what stops that mount from allocating a 40MB buffer and
 * filling it thirty times a second — SCENE_HZ, which is the rate this file
 * actually runs at.
 */
const MAX_PIXELS = 2_400_000

/* ────────────────────────────────────────────────────────────────────────────
   Budget
   ──────────────────────────────────────────────────────────────────────────*/

type Quality = {
  /** How many of `TREES` get built, best composition first. */
  trees: number
  /** Treeline teeth in the nearest rank; the outer rank gets a quarter more. */
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
 * Measured per tier, on a frame that drew, by counting each section of
 * `buildWorld` as it was emitted:
 *
 * ```
 *                      low     mid    high
 *   ground + drifts     98     178     282
 *   path + footprints   32      44      60
 *   stones + weeds      20      36      56
 *   cabin              244     264     270
 *   trees              222     418     637
 *   treeline teeth      16      50      63
 *   hills               14      14      14
 *   light + smoke       75      80      85
 *                     ----    ----    ----
 *   total              721    1084    1467
 *   snow points        200     420     640
 *   draw calls           5       5       5
 * ```
 *
 * The shape of that table is the budget policy. `low` spends a third of itself
 * on the cabin, because the cabin is the subject and the subject cannot be
 * cheap; everything that scales is a COUNT of something cheap rather than
 * detail on something expensive. It is also why the hills never move: fourteen
 * triangles is already the whole horizon.
 */
const TIERS: Record<'low' | 'mid' | 'high', Quality> = {
  low: { trees: 7, teeth: 16, ranks: 1, stones: 3, weeds: 4, logs: 4, corners: 2, prints: 5, puffs: 3, flakes: 200, patchX: 8, patchZ: 6, cone: 4, aa: false },
  mid: { trees: 13, teeth: 22, ranks: 2, stones: 5, weeds: 8, logs: 5, corners: 3, prints: 8, puffs: 4, flakes: 420, patchX: 11, patchZ: 8, cone: 5, aa: true },
  high: { trees: 20, teeth: 28, ranks: 2, stones: 8, weeds: 12, logs: 6, corners: 3, prints: 12, puffs: 5, flakes: 640, patchX: 14, patchZ: 10, cone: 6, aa: true },
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
  /** What distance dissolves into. The section's own band. */
  sky: RGB
  /** Window light. */
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
 * cut-outs on white. The windows stay warm but stop being a beacon — they read
 * as warm against daylight — and the bloom around them drops to a third,
 * because a halo that is atmosphere at night is a smudge at noon.
 *
 * Every entry is a token name. There is no colour in this file.
 */
const ROLES = {
  dark: {
    pale: '--text',
    deep: '--band-origin',
    sky: '--band-origin',
    warm: '--warm',
    floor: 0.03,
    ceil: 0.55,
    flake: 1,
    snowAlpha: 0.8,
    smoke: 0.5,
    smokeAlpha: 0.42,
    core: 0.95,
    halo: 1,
  },
  light: {
    pale: '--surface',
    deep: '--accent-2',
    sky: '--band-origin',
    warm: '--warm',
    floor: 0.26,
    ceil: 1,
    flake: 0.72,
    snowAlpha: 0.7,
    smoke: 0.72,
    smokeAlpha: 0.46,
    core: 0.74,
    halo: 0.3,
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
  const warm = parseColor(cs.getPropertyValue(role.warm))
  if (!pale || !deep || !sky || !warm) return null
  return {
    pale,
    deep,
    sky,
    warm,
    floor: role.floor,
    ceil: role.ceil,
    flake: role.flake,
    snowAlpha: role.snowAlpha,
    smoke: role.smoke,
    smokeAlpha: role.smokeAlpha,
    core: role.core,
    halo: role.halo,
  }
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
    warm: mixRGB(a.warm, b.warm, k),
    floor: n(a.floor, b.floor),
    ceil: n(a.ceil, b.ceil),
    flake: n(a.flake, b.flake),
    snowAlpha: n(a.snowAlpha, b.snowAlpha),
    smoke: n(a.smoke, b.smoke),
    smokeAlpha: n(a.smokeAlpha, b.smokeAlpha),
    core: n(a.core, b.core),
    halo: n(a.halo, b.halo),
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
type Solid = { pos: number[]; tone: number[] }

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
const T_TRACK = 0.85
const T_PRINT = 0.68
const T_WALL = 0.46
const T_HILL = 0.85
const T_TRIM = 0.34
const T_STONE = 0.3
const T_ROOF = 0.24
const T_DOOR = 0.19
const T_WEED = 0.14
/**
 * Near / mid / far / farthest, palest last, and the numbers are derived rather
 * than picked. `tri` scales each by its own facet's light, and then the fog
 * mixes the result back toward the sky, so what the eye finally gets is
 *
 *     lift above the sky  =  (floor + toneEffective * span) * (pale - sky) * (1 - fog)
 *
 * A ladder that ignores the `(1 - fog)` term is not a ladder: at the old
 * spacing the mid rank came out at 20 against the near rank's 22 and the two
 * were indistinguishable. Measured on the dark theme's green channel at each
 * rank's typical distance from the near camera, these give 17 / 22 / 32 / 38,
 * with the hills at 47 — five separations that hold.
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
/** The chimney, on the camera's side of the ridge. `buildSmoke` reads these. */
const CHIM_X = -1.95
const CHIM_Z = -3.6
const CHIM_Y = 5.8

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
  const t = clamp01(base * (SHADE_FLOOR + (1 - SHADE_FLOOR) * Math.max(0, d)))
  for (const q of p) s.pos.push(q[0], q[1], q[2])
  s.tone.push(t, t, t)
}

function quad(s: Solid, a: V, b: V, c: V, d: V, base: number, out?: V) {
  tri(s, a, b, c, base, out)
  tri(s, a, c, d, base, out)
}

/**
 * A box standing on `yBase`. No bottom face: everything built with this stands
 * on the snow or on the deck, and the camera never drops below y = 2.5, so two
 * triangles per box would pay for a surface nobody can reach.
 */
function box(s: Solid, x: number, yBase: number, z: number, w: number, h: number, d: number, base: number) {
  const x0 = x - w / 2
  const x1 = x + w / 2
  const y0 = yBase
  const y1 = yBase + h
  const z0 = z - d / 2
  const z1 = z + d / 2
  quad(s, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], base, [0, 1, 0])
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
 * constant — but it is very nearly one, because everything using this stands
 * more than 20m from the arc and the arc subtends a narrow angle from there.
 * This is a point on the walk at about progress 0.35, and measured against it
 * the worst case over the whole walk is 14 degrees off face-on, which a flat
 * triangle does not betray.
 *
 * Billboarding them per frame is the alternative and it is the wrong trade:
 * these live in the merged static world mesh, and orienting them would mean
 * rewriting a few hundred vertices every frame for an error nobody can see.
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
function driftAt(x: number, z: number) {
  const edge =
    smooth((PATCH_HX - Math.abs(x - PATCH_CX)) / 5) *
    smooth((z - PATCH_Z0) / 5) *
    smooth((PATCH_Z1 - z) / 5)
  const d = Math.max(Math.abs(x) / 5.2, Math.max(-z / 7.4, z / 9))
  const trodden = smooth((d - 0.8) / 0.4)
  // The footpath is flat for the same reason the yard is: it is walked on. It
  // is also what keeps the path's own quads from being buried — see `patchTop`.
  const walked = smooth((distToPath(x, z) - PATH_FLAT) / PATH_FADE)
  const h =
    0.22 * Math.sin(x * 0.36 + 1.7) * Math.cos(z * 0.29 - 0.6) +
    0.13 * Math.sin(x * 0.9 + z * 0.7) +
    // Banked drifts. The sines above are weather; these are the places snow
    // actually piles up, which is wherever something has been standing in the
    // wind all winter. The third is out where the walk begins, so the opening
    // shot has relief in its foreground rather than a flat sheet.
    bank(x, z, -12.5, -3, 7, 4.2, 0.55) +
    bank(x, z, 10.5, 6, 6.5, 4.6, 0.45) +
    bank(x, z, -22, 22, 9, 7, 0.6) +
    bank(x, z, -28, 30, 9, 8, 0.75)
  return Math.max(0, h * edge * trodden * walked)
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
 */
const TREES: [number, number, number, number][] = [
  [-29.4, 27.4, 2.6, 0],
  [-8.8, 3.5, 2.2, 0],
  [5.2, 6, 2.4, 0],
  [-9.5, -6, 1.5, 1],
  [8.2, -4.6, 1.35, 1],
  [-19.5, 14, 2.4, 1],
  [-6.2, -12.5, 1.7, 2],
  [-25.7, 20.1, 2.2, 1],
  [2, 26, 2.3, 1],
  [11.2, -9.5, 1.5, 1],
  [-13.4, 1.5, 1.2, 1],
  [12.8, 2.4, 1.3, 1],
  [-4, -17, 1.8, 2],
  [7.5, 18, 2.1, 1],
  [-12.5, 6, 2, 1],
  [3.5, -16, 1.6, 2],
  [-15, -8, 1.4, 2],
  [16, -14, 1.5, 2],
  [-19, -18, 1.6, 2],
  [18, 6, 1.6, 2],
]

/** Skirt tiers and segments per rank. See `TREES`. */
const RANKS = [
  { tiers: 7, seg: 5, tone: T_TREE, snow: true },
  { tiers: 5, seg: 4, tone: T_TREE_MID, snow: false },
  { tiers: 3, seg: 3, tone: T_TREE_FAR, snow: false },
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
 * The ranks the reader never walks into: two arcs of single-triangle trees and
 * a band of hills behind them, all of it standing round the clearing.
 *
 * **One triangle per tree.** `landscapes/mountain-ridge-dark.webp` draws its
 * whole treeline as a serrated fringe along the foot of the ridge, and that is
 * exactly the right amount of tree for something forty metres off — it is a
 * shape, not an object. Fifty-four of these cost what two near conifers do,
 * and they are the thing that makes the cabin sit IN a forest rather than in
 * front of a few of them.
 *
 * The arc skips the wedge in front of the cabin, which is the clearing the
 * camera stands in and walks through. A tooth is flat, so it must never be
 * near enough to be caught side-on; the nearest any of them comes to the arc
 * is about 20m, where a 4m triangle is a distant tree and not a piece of card.
 */
const RANK_R = [26, 34]
const RANK_TONE = [T_TREE_FAR, T_TREE_RIM]
/** The arc the teeth stand on, in radians, measured from +z round through the back. */
const TEETH_A0 = 1.08
const TEETH_A1 = 5.2
/** The hills, further out and paler again. */
const HILL_R = 48
const HILL_STEPS = 7

function buildWorld(tier: Quality): Solid {
  const s: Solid = { pos: [], tone: [] }

  // ── ground ───────────────────────────────────────────────────────────────
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
        T_SNOW,
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

  // ── what is lying in the snow ────────────────────────────────────────────
  const propSeed = rng(0x9a17)
  for (let i = 0; i < tier.stones && i < STONES.length; i++) {
    const [sx, sz, sr] = STONES[i]
    stone(s, sx, sz, PLANT_Y, sr, sr * (0.6 + propSeed() * 0.5), T_STONE, propSeed() * 6.28)
  }
  for (let i = 0; i < tier.weeds && i < WEEDS.length; i++) {
    const [wx, wz, wh] = WEEDS[i]
    weeds(s, wx, wz, PLANT_Y, wh, 2, propSeed)
  }

  // ── front wall, with its openings cut ────────────────────────────────────
  // Vertical strips, because that is the decomposition a wall with a door and
  // two windows falls into with the fewest triangles and no T-junctions.
  panel(s, -CAB_HW, -WIN_X - WIN_HW, 0, WALL_H, CAB_Z0, T_WALL)
  panel(s, -WIN_X - WIN_HW, -WIN_X + WIN_HW, 0, WIN_Y0, CAB_Z0, T_WALL)
  panel(s, -WIN_X - WIN_HW, -WIN_X + WIN_HW, WIN_Y1, WALL_H, CAB_Z0, T_WALL)
  panel(s, -WIN_X + WIN_HW, -DOOR_HW, 0, WALL_H, CAB_Z0, T_WALL)
  panel(s, -DOOR_HW, DOOR_HW, 0, DECK_Y, CAB_Z0, T_WALL)
  panel(s, -DOOR_HW, DOOR_HW, DECK_Y + DOOR_H, WALL_H, CAB_Z0, T_WALL)
  panel(s, DOOR_HW, WIN_X - WIN_HW, 0, WALL_H, CAB_Z0, T_WALL)
  panel(s, WIN_X - WIN_HW, WIN_X + WIN_HW, 0, WIN_Y0, CAB_Z0, T_WALL)
  panel(s, WIN_X - WIN_HW, WIN_X + WIN_HW, WIN_Y1, WALL_H, CAB_Z0, T_WALL)
  panel(s, WIN_X + WIN_HW, CAB_HW, 0, WALL_H, CAB_Z0, T_WALL)
  // the gable above it, with two course lines across it — the one face of the
  // front wall wide enough and empty enough to carry them
  tri(s, [-CAB_HW, WALL_H, CAB_Z0], [CAB_HW, WALL_H, CAB_Z0], [0, RIDGE_Y, CAB_Z0], T_WALL, [0, 0, 1])
  for (let i = 0; i < 2; i++) {
    const gy = WALL_H + 0.34 + i * 0.62
    const gw = CAB_HW * (1 - (gy - WALL_H) / (RIDGE_Y - WALL_H)) - 0.06
    if (gw > 0.2) panel(s, -gw, gw, gy, gy + 0.08, 0.012, T_TRIM)
  }

  // back wall and gable
  quad(
    s,
    [-CAB_HW, 0, CAB_Z1],
    [CAB_HW, 0, CAB_Z1],
    [CAB_HW, WALL_H, CAB_Z1],
    [-CAB_HW, WALL_H, CAB_Z1],
    T_WALL,
    [0, 0, -1],
  )
  tri(s, [-CAB_HW, WALL_H, CAB_Z1], [CAB_HW, WALL_H, CAB_Z1], [0, RIDGE_Y, CAB_Z1], T_WALL, [0, 0, -1])

  // side walls. The left one carries a window, because the walk comes in from
  // the left and that side is what the reader sees for most of it. Its four
  // numbers are module constants now, beside `buildGlowCore`, because the
  // glow layer has to light the same hole this cuts.
  const sideL = (z0: number, z1: number, y0: number, y1: number) =>
    quad(s, [-CAB_HW, y0, z0], [-CAB_HW, y0, z1], [-CAB_HW, y1, z1], [-CAB_HW, y1, z0], T_WALL, [-1, 0, 0])
  sideL(CAB_Z1, SW_Z0, 0, WALL_H)
  sideL(SW_Z0, SW_Z1, 0, SW_Y0)
  sideL(SW_Z0, SW_Z1, SW_Y1, WALL_H)
  sideL(SW_Z1, CAB_Z0, 0, WALL_H)
  quad(
    s,
    [CAB_HW, 0, CAB_Z1],
    [CAB_HW, 0, CAB_Z0],
    [CAB_HW, WALL_H, CAB_Z0],
    [CAB_HW, WALL_H, CAB_Z1],
    T_WALL,
    [1, 0, 0],
  )

  // ── roof ─────────────────────────────────────────────────────────────────
  // Two slanted slabs: the shingle plane, its underside (visible from the last
  // few metres of the walk, where the camera is below the eave) and the fascia
  // that joins them. Then a snow cap laid over each, inset from the ridge and
  // stopping short of the eave so a dark strip of shingle still reads at the
  // bottom edge — which is how a snowy roof actually looks and is the cheapest
  // possible way to say "snow" on a slope.
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

  // ── chimney ──────────────────────────────────────────────────────────────
  // On the LEFT slope, because the walk comes in from the left and stays
  // there: a chimney on the far side is a chimney whose smoke rises out of
  // nothing. It is also the reason CHIM_X is a constant now rather than a
  // literal — the smoke has to be able to find it. See `buildSmoke`.
  //
  // A stack, a wider footing where it meets the roof, and four stones set
  // proud. One box is a pipe; the footing and the proud stones are what make
  // it masonry at 12 metres, which is the only distance it is ever read at.
  box(s, CHIM_X, 1.9, CHIM_Z, 0.78, 1.5, 0.78, T_STONE)
  box(s, CHIM_X, 3.3, CHIM_Z, 0.64, 2.6, 0.64, T_STONE)
  box(s, CHIM_X, CHIM_Y - 0.22, CHIM_Z, 0.82, 0.24, 0.82, T_STONE)
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
  box(s, 0, DECK_Y + 2.5, DECK_Z / 2 + 0.25, 2.5, 0.18, DECK_Z + 0.5, T_ROOF)
  box(s, 0, DECK_Y + 2.68, DECK_Z / 2 + 0.25, 2.3, 0.1, DECK_Z + 0.2, T_SNOW)
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
    box(s, 0, 0, DECK_Z + 0.24 + i * 0.42, 2.4, h, 0.42, T_SNOW)
  }

  // window frames, as a thin surround on the wall plane
  for (const sign of [-1, 1]) {
    const cx = sign * WIN_X
    panel(s, cx - WIN_HW - 0.09, cx + WIN_HW + 0.09, WIN_Y1, WIN_Y1 + 0.09, 0.01, T_TRIM)
    panel(s, cx - WIN_HW - 0.09, cx + WIN_HW + 0.09, WIN_Y0 - 0.11, WIN_Y0, 0.01, T_SNOW)
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
  // and one on the flank window, which the angled approach looks straight at
  quad(
    s,
    [-CAB_HW - 0.04, SW_Y0, (SW_Z0 + SW_Z1) / 2 - 0.045],
    [-CAB_HW - 0.04, SW_Y0, (SW_Z0 + SW_Z1) / 2 + 0.045],
    [-CAB_HW - 0.04, SW_Y1, (SW_Z0 + SW_Z1) / 2 + 0.045],
    [-CAB_HW - 0.04, SW_Y1, (SW_Z0 + SW_Z1) / 2 - 0.045],
    T_TRIM,
    [-1, 0, 0],
  )

  /*
   * ── the backs of the openings ────────────────────────────────────────────
   *
   * Every wall here is single-sided and facing out, so an opening cut in one
   * is a hole THROUGH the cabin: the far wall's inside face is back-facing and
   * culled, and what shows in the gap is the forest behind the building.
   *
   * That was true from the day the flank window was cut and it never showed,
   * because the old camera sat 9 degrees off the front axis and could barely
   * see that wall at all. The orbit puts it in the shot for the whole first
   * half of the walk, which is exactly the kind of latent bug a camera change
   * exposes — the geometry did not become wrong, it became visible.
   *
   * One quad behind each opening, WIDER than the opening on every side. The
   * width is the fix rather than the depth: a backing panel set 25cm behind a
   * hole seen from 38 degrees shifts 20cm across it in projection, which on a
   * 49cm half-window leaves a slot of daylight down one edge. The overhang is
   * buried in the wall, so it costs nothing to be generous with it.
   */
  for (const sign of [-1, 1]) {
    const cx = sign * WIN_X
    panel(s, cx - WIN_HW - 0.4, cx + WIN_HW + 0.4, WIN_Y0 - 0.4, WIN_Y1 + 0.4, -0.25, T_DOOR)
  }
  panel(s, -DOOR_HW - 0.5, DOOR_HW + 0.5, DECK_Y - 0.3, DECK_Y + DOOR_H + 0.4, -0.4, T_DOOR)
  quad(
    s,
    [-CAB_HW + 0.3, SW_Y0 - 0.4, SW_Z0 - 0.4],
    [-CAB_HW + 0.3, SW_Y0 - 0.4, SW_Z1 + 0.4],
    [-CAB_HW + 0.3, SW_Y1 + 0.4, SW_Z1 + 0.4],
    [-CAB_HW + 0.3, SW_Y1 + 0.4, SW_Z0 - 0.4],
    T_DOOR,
    [-1, 0, 0],
  )

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

  // ── trees ────────────────────────────────────────────────────────────────
  const treeSeed = rng(0xc4b1)
  for (let i = 0; i < tier.trees && i < TREES.length; i++) {
    const [tx, tz, ts, rk] = TREES[i]
    const r = RANKS[rk]
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
    )
    // Snow banked against the foot of the near ones. The reference art draws
    // this too — `props/pine-faceted-pair-dark.webp` has a whole shelf of
    // faceted snow chunks at the base — and four triangles is what stops a
    // trunk from looking pushed into the ground like a pin.
    if (rk === 0) stone(s, tx, tz, PLANT_Y, 0.62 * ts, 0.3 * ts, T_SNOW, treeSeed() * 6.28)
  }

  // ── the ranks behind them ────────────────────────────────────────────────
  const rankSeed = rng(0x71d3)
  for (let r = 0; r < tier.ranks && r < RANK_R.length; r++) {
    const n = Math.round(tier.teeth * (r === 0 ? 1 : 1.25))
    for (let i = 0; i < n; i++) {
      const a = TEETH_A0 + ((i + 0.5) / n) * (TEETH_A1 - TEETH_A0)
      const rad = RANK_R[r] + (rankSeed() * 2 - 1) * 3.4
      const tx = Math.sin(a) * rad
      const tz = LOOK_Z + Math.cos(a) * rad
      tooth(
        s,
        tx,
        tz,
        PLANT_Y,
        0.85 + rankSeed() * 1.05,
        2.6 + rankSeed() * 2.9,
        RANK_TONE[r],
      )
    }
  }

  // ── and the hills ────────────────────────────────────────────────────────
  // A single band of facets on the horizon, standing on nothing and reaching
  // nowhere: the fog turns it into the soft lighter edge the reference
  // paintings put behind their trees, and that is all it has to be.
  const hillSeed = rng(0x2f8c)
  let prev: [number, number, number] | null = null
  for (let i = 0; i <= HILL_STEPS; i++) {
    const a = TEETH_A0 + (i / HILL_STEPS) * (TEETH_A1 - TEETH_A0)
    const rad = HILL_R + (hillSeed() * 2 - 1) * 5
    const hx = Math.sin(a) * rad
    const hz = LOOK_Z + Math.cos(a) * rad
    const hy = 5.5 + hillSeed() * 6
    if (prev) {
      quad(
        s,
        [prev[0], PLANT_Y, prev[2]],
        [hx, PLANT_Y, hz],
        [hx, hy, hz],
        [prev[0], prev[1], prev[2]],
        T_HILL,
        [-Math.sin(a), 0.35, -Math.cos(a)],
      )
    }
    prev = [hx, hy, hz]
  }

  return s
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
) {
  const top = 4.3 * scale
  const bare = 1.15 * scale
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
 * The flank window's opening. It lives in `buildWorld` as three wall strips
 * around a gap; these are the numbers, hoisted so the glow layer can find the
 * same hole rather than a second set that agrees with it by hand.
 */
const SW_Y0 = 1.5
const SW_Y1 = 2.4
const SW_Z0 = -3
const SW_Z1 = -1.8

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
   * It was `2.9 -> 7.4` and it is now shorter, wider and brighter, because the
   * shot moved. The camera arrives 11m from the wall at eye height 2.45, which
   * puts the bottom edge of the frame on the ground 6.8m away — measured — so
   * the old pool spent its last two and a half metres below the picture. What
   * was left in frame was 12,245 lit pixels of a 78,763-pixel pool.
   *
   * Widening it rather than lengthening it puts the light back where the
   * reference paintings put it: a broad warm patch spreading sideways from the
   * door across cold ground, not a carpet runner pointing at the reader.
   */
  pool(g, DOOR_SLOT * 0.6, 1.6, 6.4, 1.5, 4.1, 0.62)
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

/* ────────────────────────────────────────────────────────────────────────────
   Snow
   ──────────────────────────────────────────────────────────────────────────*/

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
 *
 * Measured at the rest pose: the chimney's cap sits 9.7 degrees above the view
 * axis and the top of the frame is at 14.9, so there are five degrees of sky
 * over it — about 130px. A plume rising 7.6m straight up left the frame after
 * its first metre and a half and the rest of it was drawn for nobody. Leaning
 * it downwind keeps the whole life of a puff inside that band, and a plume
 * bending off a chimney is what the reference paintings draw anyway; smoke
 * going straight up is smoke on a windless day, which this is visibly not.
 */
const SMOKE_RISE = 3.6
const SMOKE_WIND_X = 5.4
const SMOKE_WIND_Z = 2.2
const SMOKE_R0 = 0.34
const SMOKE_R1 = 3.1
/** Rim points on a puff, which is also its triangle count. See `layoutSmoke`. */
const SMOKE_TRIS = 5

const SNOW_HX = 13
const SNOW_HY = 14
const SNOW_HZ = 15
/** The box sits ahead of the camera, which is looking down -z. */
const SNOW_AHEAD = -7
const SNOW_SIZE = 0.055
