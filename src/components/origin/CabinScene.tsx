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
import { clamp01, onFrame, wake } from '../../lib/motion'
import { onDprChange } from '../../lib/dpr'

/**
 * The Origin section's backdrop: a cabin in the snow that the reader walks
 * toward as they read the seven chapters. Far and cold at the top of the
 * section, at the door with the windows lit by the bottom of it. It is also a
 * nod to Makullveny's own flagship theme, "Cozy Cabin".
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
 * The whole scene is ~540 triangles in four draw calls. That is deliberate:
 * this is a silhouette with warm windows, not an architectural render, and it
 * sits behind seven chapters of prose that have to stay the thing you read.
 *
 * ## The mount this expects
 *
 * `CabinScene` takes a `className` and lets the caller place it. The framing it
 * was composed for is **a viewport-sized box** — a `position: sticky` /
 * `height: 100svh` layer inside `#origin` is the natural one.
 *
 * It does not *require* that. A canvas stretched over the whole section (the
 * `inset: 0` shape `OriginField` used) is several times taller than the
 * viewport, and a 3D composition painted once across a box like that would
 * scroll away from the reader instead of staying in front of them. So the
 * camera composes for the SLICE of itself that is currently on screen, via an
 * off-centre frustum (`setViewOffset`, see `frameSlice`), and the scene stays
 * put in the viewport either way. The cost of the tall mount is real, though —
 * every frame fills the whole canvas, most of which nobody can see — so the
 * backing store is capped by area as well as by dpr, and a sticky mount is
 * still the one to give it.
 *
 * ## Rules this is holding to (AGENTS.md §2)
 *
 * - **Rule 9, all motion through the one loop.** One `onFrame` subscriber. No
 *   `requestAnimationFrame`, no `THREE.Clock`, no `setAnimationLoop`. It holds
 *   the loop only while the damped camera is still converging, while snow is
 *   falling in view, or while a theme cross-fade is running — and it returns
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
 *   than as a beacon. See `ROLES`.
 * - **Rule 5, every state gets a face.** No WebGL, a refused context, a lost
 *   context and an unreadable palette all resolve to the same face: an empty
 *   transparent canvas. The section keeps its own gradients, its art kit and
 *   its prose and simply has no cabin. It is never a black rectangle.
 *
 * **The caller must lazy-load this.** three.js is the heaviest thing that could
 * be on this page, and `hero/PointCloud.tsx` is already `React.lazy` +
 * `<Suspense fallback={null}>` for exactly that reason. Mount this the same
 * way; nothing in here runs at import time beyond the three.js module itself.
 * Measured: the lazy chunk is 520 kB raw / 134 kB gzipped, and it is a separate
 * file only because of the dynamic import — pull this in statically and all of
 * that lands in the entry bundle, which is already flagged at 500 kB.
 *
 * ```tsx
 * const CabinScene = lazy(() =>
 *   import('./origin/CabinScene').then((m) => ({ default: m.CabinScene })),
 * )
 * // ...inside #origin, as the first flow child:
 * <Suspense fallback={null}>
 *   <CabinScene className="origin__scene" />
 * </Suspense>
 * ```
 *
 * ```css
 * .origin__scene {
 *   position: sticky;
 *   top: 0;
 *   height: 100svh;
 *   width: 100%;
 *   margin-bottom: -100svh;
 * }
 * ```
 *
 * The negative margin is what makes a sticky backdrop add no height of its own.
 * Sticky needs a flow child, so this cannot be `position: absolute` the way the
 * art layers around it are.
 */
export function CabinScene({ className }: { className?: string }) {
  const canvas = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const cv = canvas.current
    if (!cv) return
    const section = cv.closest('section')
    if (!section) return

    // ── palette ───────────────────────────────────────────────────────────
    // Read before anything is built: with no palette there is nothing to draw,
    // and an empty transparent canvas is this component's honest failure face.
    const first = readPalette(section)
    if (!first) return
    let target: Palette = first
    let shown: Palette = { ...first }

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
    } catch {
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
    // Points object either way.
    snowGeo.boundingSphere = null
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
    let dirty = true
    const invalidate = () => {
      settled = false
      dirty = true
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
    }

    // ── size ──────────────────────────────────────────────────────────────
    let cssW = 0
    let cssH = 0
    const resize = () => {
      cssW = cv.clientWidth
      cssH = cv.clientHeight
      if (!cssW || !cssH) return
      // 1.5 is this site's cap and the reasoning is in lib/dpr.ts and
      // hero/PointCloud.tsx: flat-shaded facets gain very little from 2x and it
      // costs four times the fill. The AREA cap is this component's own, and it
      // is what makes a canvas stretched over a whole tall section survivable —
      // see the mount note in the header.
      let dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
      const area = cssW * cssH * dpr * dpr
      if (area > MAX_PIXELS) dpr = Math.max(0.75, dpr * Math.sqrt(MAX_PIXELS / area))
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
     */
    const frameSlice = (rect: DOMRect, vw: number, vh: number) => {
      const sliceW = Math.min(vw, cssW)
      const sliceH = Math.min(vh, cssH)
      const aspect = sliceW / Math.max(1, sliceH)
      camera.aspect = aspect
      camera.fov = fovFor(aspect)
      const offX = Math.max(0, Math.min(cssW - sliceW, -rect.left))
      const offY = Math.max(0, Math.min(cssH - sliceH, -rect.top))
      if (offX < 0.5 && offY < 0.5 && cssW - sliceW < 0.5 && cssH - sliceH < 0.5) {
        camera.clearViewOffset()
      } else {
        // Negative offsets are the whole trick: they grow the frustum outwards
        // from the slice instead of cropping into it.
        camera.setViewOffset(sliceW, sliceH, -offX, -offY, cssW, cssH)
      }
      camera.updateProjectionMatrix()
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

      // Theme cross-fade. It runs under reduced motion too, because the page's
      // own colour transitions do — base.css pauses animations for a
      // reduced-motion visitor, never transitions.
      let fading = false
      if (fadeFrom) {
        fadeK += dt / THEME_FADE
        if (fadeK >= 1) {
          shown = { ...target }
          fadeFrom = null
          fadeK = 1
        } else {
          const k = clamp01(fadeK)
          shown = lerpPalette(fadeFrom, target, k * k * (3 - 2 * k))
          fading = true
        }
        dirty = true
      }

      const converging = walk < 0 || Math.abs(wanted - walk) > WALK_EPS
      const snowing = mi > 0
      if (converging || snowing || fading) hold()
      if (!converging && !snowing && !fading && settled && !dirty) return

      // 30Hz, this section's existing number. A camera on a damped scalar and
      // snow drifting at about a metre a second are both well inside what that
      // reads as, and it is half the GPU work of an uncapped scene sitting
      // behind prose. A scroll that outruns it is absorbed by the damping,
      // which is the other half of why this does not judder on a trackpad.
      pending += dt
      if (pending < 1 / SCENE_HZ && !dirty) return
      const step = pending
      pending = 0

      // The damped camera. `settle` is useParallax's per-second lerp, restated
      // here rather than imported because that hook owns a DOM element and this
      // owns a frustum; what carries across is the rate law, not the code.
      // Damping is also what stops an opening chapter from snapping the shot:
      // a disclosure growing the section changes `rect.height`, which steps the
      // target, and a welded camera would jump on the frame it happens.
      if (walk < 0) walk = wanted
      else walk += (wanted - walk) * settle(WALK_RATE, step)

      // Apparent size, not distance, is what the eye reads on an approach, and
      // apparent size goes as 1/d. Interpolating the RECIPROCAL of the distance
      // means the cabin grows at an even rate across the scroll; interpolating
      // the distance itself makes the last third of the walk lunge. The
      // smoothstep on top is the "unhurried" part — it eases in and out of the
      // move so neither end starts or stops on a hard edge.
      const e = walk * walk * (3 - 2 * walk)
      const inv = 1 / Z_FAR + (1 / Z_NEAR - 1 / Z_FAR) * e
      const dist = 1 / inv
      const u = clamp01((Z_FAR - dist) / (Z_FAR - Z_NEAR))

      const camX = X_FAR + (X_NEAR - X_FAR) * u
      const camY = Y_FAR + (Y_NEAR - Y_FAR) * u
      const camZ = dist
      camera.position.set(camX, camY, camZ)
      camera.lookAt(0, LOOK_Y_FAR + (LOOK_Y_NEAR - LOOK_Y_FAR) * u, LOOK_Z)

      // The windows warm and brighten as the door gets closer. At the far end
      // they are barely lit — and the fog has most of them anyway, which is the
      // "cold and distant" half of the brief doing itself.
      const lit = e * e * (3 - 2 * e)
      coreMat.opacity = shown.core * (0.16 + 0.84 * lit)
      softMat.opacity = shown.halo * (0.1 + 0.9 * lit)

      // Snow. The box rides the camera; the camera's displacement is taken back
      // out of the flakes so they stay put in the world.
      const boxX = camX
      const boxZ = camZ + SNOW_AHEAD
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

      if (dirty) {
        applyPalette(shown)
        dirty = false
      }
      // The CANVAS's rect, not the section's. The two are the same thing when
      // this is mounted `inset: 0` over the section and are not when it is
      // mounted sticky, and it is the painted box that has to be framed. Read
      // here rather than at the top of the tick so it is only paid for on
      // frames that actually draw.
      frameSlice(cv.getBoundingClientRect(), window.innerWidth || 1200, vh)
      renderer.render(scene, camera)
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
    }
  }, [])

  return (
    <canvas
      ref={canvas}
      className={className}
      aria-hidden="true"
      // Not in a stylesheet, because this component does not own one and does
      // not want to depend on the caller having written it: a full-bleed canvas
      // that can take a pointer event is a canvas that can eat a click on the
      // prose behind it. Decorative means decorative.
      style={{ pointerEvents: 'none' }}
    />
  )
}

/* ────────────────────────────────────────────────────────────────────────────
   The walk
   ──────────────────────────────────────────────────────────────────────────*/

/** Distance from the cabin's front wall at the two ends of the walk, in metres. */
const Z_FAR = 52
const Z_NEAR = 14.6
/** The approach is slightly off-axis and straightens up, so it reads as walking. */
const X_FAR = -8.5
const X_NEAR = -1.1
const Y_FAR = 6.4
const Y_NEAR = 2.55
const LOOK_Y_FAR = 2.6
const LOOK_Y_NEAR = 2.05
const LOOK_Z = -1

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
 */
const WALK_REST = 0.62

/** Per-frame lerp expressed per second, so 144Hz settles like 60Hz does. */
const settle = (rate: number, dt: number) => 1 - Math.pow(1 - rate, dt * 60)
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
const FOG_FAR = 74

const MAX_DPR = 1.5
/**
 * Ceiling on the backing store, in device pixels. 1.5x on a 1440x900 viewport
 * is 2.9M and clears this; a canvas stretched over a whole 2400px section does
 * not, and this is what stops that mount from allocating a 40MB buffer and
 * filling it sixty times a... thirty times a second.
 */
const MAX_PIXELS = 2_400_000

/* ────────────────────────────────────────────────────────────────────────────
   Budget
   ──────────────────────────────────────────────────────────────────────────*/

type Quality = {
  trees: number
  flakes: number
  patchX: number
  patchZ: number
  cone: number
  aa: boolean
}

/**
 * Same shape as PointCloud's `pointBudget`: cores and viewport width, because
 * those are the two things a browser will actually tell you about a machine.
 * The cabin itself never changes — it is the thing being looked at — so what
 * scales is the count of trees, the resolution of the snow field, the number of
 * flakes and whether the driver is asked for multisampling.
 */
const TIERS: Record<'low' | 'mid' | 'high', Quality> = {
  low: { trees: 3, flakes: 200, patchX: 6, patchZ: 5, cone: 4, aa: false },
  mid: { trees: 6, flakes: 420, patchX: 8, patchZ: 6, cone: 5, aa: true },
  high: { trees: 8, flakes: 640, patchX: 10, patchZ: 8, cone: 6, aa: true },
}

function tierOf(): 'low' | 'mid' | 'high' {
  if (typeof window === 'undefined') return 'mid'
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

/** Base tones, before the theme's ramp. These are the scene's tone design. */
const T_SNOW = 0.94
const T_WALL = 0.46
const T_TRIM = 0.34
const T_STONE = 0.3
const T_ROOF = 0.24
const T_DOOR = 0.19
const T_TREE = 0.16
const T_TRUNK = 0.11

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
 * The snowfield's drift, as two sines — deterministic, so the snow lies the
 * same way on every load.
 *
 * Two masks multiply it away. One tapers it to nothing at the patch's own edge,
 * so the faceted patch and the flat plane beyond it meet on the same height and
 * the join can never show. The other flattens it around the cabin, which is
 * partly so nothing has to stand on a slope and partly because it is true: the
 * snow in front of a door somebody uses is trodden flat.
 */
function driftAt(x: number, z: number) {
  const edge =
    smooth((PATCH_HX - Math.abs(x)) / 5) * smooth((z - PATCH_Z0) / 5) * smooth((PATCH_Z1 - z) / 5)
  const d = Math.max(Math.abs(x) / 5.2, Math.max(-z / 7.4, z / 9))
  const trodden = smooth((d - 0.8) / 0.4)
  const h =
    0.16 * Math.sin(x * 0.36 + 1.7) * Math.cos(z * 0.29 - 0.6) + 0.09 * Math.sin(x * 0.9 + z * 0.7)
  return h * edge * trodden
}

const PATCH_HX = 17
const PATCH_Z0 = -16
const PATCH_Z1 = 21
const PLANE_HX = 58
const PLANE_Z0 = -54
const PLANE_Z1 = 72

/**
 * Where the trees stand, best composition first: the tier budget takes the
 * first N. None of them sits on the camera's path, and the two nearest the
 * front frame the shot from outside it at the end of the walk.
 */
const TREES: [number, number, number][] = [
  [-9.5, -6, 1.3],
  [8.2, -4.6, 1.05],
  [-6.2, -12.5, 1.55],
  [11.2, -9.5, 1.35],
  [-13.4, 1.5, 0.95],
  [12.8, 2.4, 1.1],
  [-4, -17, 1.7],
  [3.5, -16, 1.45],
]

function buildWorld(tier: Quality): Solid {
  const s: Solid = { pos: [], tone: [] }

  // ── ground ───────────────────────────────────────────────────────────────
  // One enormous flat quad for everything the fog is going to eat anyway, and a
  // faceted patch around the cabin where the reader can actually see the snow.
  // The patch sits a hair above the plane so the two cannot z-fight, and its
  // drift tapers to zero at its own border so the join is invisible.
  quad(
    s,
    [-PLANE_HX, -0.02, PLANE_Z1],
    [PLANE_HX, -0.02, PLANE_Z1],
    [PLANE_HX, -0.02, PLANE_Z0],
    [-PLANE_HX, -0.02, PLANE_Z0],
    T_SNOW,
    [0, 1, 0],
  )
  const nx = tier.patchX
  const nz = tier.patchZ
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const x0 = -PATCH_HX + (i / nx) * PATCH_HX * 2
      const x1 = -PATCH_HX + ((i + 1) / nx) * PATCH_HX * 2
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
  // the gable above it
  tri(s, [-CAB_HW, WALL_H, CAB_Z0], [CAB_HW, WALL_H, CAB_Z0], [0, RIDGE_Y, CAB_Z0], T_WALL, [0, 0, 1])

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
  // the left and that side is what the reader sees for most of it.
  const SW_Y0 = 1.5
  const SW_Y1 = 2.4
  const SW_Z0 = -3
  const SW_Z1 = -1.8
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
  box(s, 1.95, 2.1, -3.6, 0.72, 3.9, 0.72, T_STONE)
  box(s, 1.95, 5.99, -3.6, 0.86, 0.16, 0.86, T_SNOW)

  // ── porch ────────────────────────────────────────────────────────────────
  // The roof and its posts are narrow, over the door only. A porch wide enough
  // to reach the windows would put a post in front of each of them and the roof
  // over both, which is a porch that shades the two brightest things in the
  // scene — the posts at x = 1.0 clear the door at 0.6 and the window's inner
  // edge at 1.23 with room either side. The deck below is wide, because it is
  // at knee height and passes under the sills without touching anything.
  box(s, 0, 0.22, DECK_Z / 2, 4.4, DECK_Y - 0.22, DECK_Z, T_TRIM)
  box(s, 0, 0, DECK_Z / 2, 4.1, 0.22, DECK_Z, T_STONE)
  for (const sign of [-1, 1]) box(s, sign * 1, DECK_Y, DECK_Z - 0.3, 0.16, 2.5, 0.16, T_TRIM)
  box(s, 0, DECK_Y + 2.5, DECK_Z / 2 + 0.25, 2.5, 0.18, DECK_Z + 0.5, T_ROOF)
  box(s, 0, DECK_Y + 2.68, DECK_Z / 2 + 0.25, 2.3, 0.1, DECK_Z + 0.2, T_SNOW)

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
  }

  // ── the door, standing open ──────────────────────────────────────────────
  // The whole section is about arriving somewhere, so the door is ajar rather
  // than shut: it is two triangles, and it is the difference between a lit
  // house and a house somebody is expecting you at.
  const A = 0.55
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
    const [tx, tz, ts] = TREES[i]
    conifer(s, tx, tz, ts, tier.cone, treeSeed() * Math.PI * 2)
  }

  return s
}

/**
 * A conifer: a trunk and three stacked cones with a tone step between them.
 * That is the whole silhouette in `props/pine-faceted-pair-dark.webp` reduced to
 * what a backdrop needs — the reference has a dozen tiers because it is a
 * foreground prop being looked at, and these are 10 to 20 metres away in fog.
 */
function conifer(s: Solid, x: number, z: number, scale: number, seg: number, rot: number) {
  const trunkH = 1 * scale
  box(s, x, 0, z, 0.22 * scale, trunkH, 0.22 * scale, T_TRUNK)
  const tiers = 3
  for (let i = 0; i < tiers; i++) {
    const y0 = (0.55 + i * 1.05) * scale
    const r = (1.5 - i * 0.36) * scale
    const h = (1.85 - i * 0.2) * scale
    cone(s, x, y0, z, r, h, T_TREE * (1 - i * 0.08), seg, rot + i * 0.4)
  }
}

function cone(s: Solid, cx: number, y0: number, cz: number, r: number, h: number, base: number, seg: number, rot: number) {
  const apex: V = [cx, y0 + h, cz]
  for (let i = 0; i < seg; i++) {
    const a0 = rot + (i / seg) * Math.PI * 2
    const a1 = rot + ((i + 1) / seg) * Math.PI * 2
    const p0: V = [cx + Math.cos(a0) * r, y0, cz + Math.sin(a0) * r]
    const p1: V = [cx + Math.cos(a1) * r, y0, cz + Math.sin(a1) * r]
    const mx = (Math.cos(a0) + Math.cos(a1)) / 2
    const mz = (Math.sin(a0) + Math.sin(a1)) / 2
    tri(s, p0, p1, apex, base, [mx, 0.4, mz])
  }
}

/* ────────────────────────────────────────────────────────────────────────────
   The light coming out
   ──────────────────────────────────────────────────────────────────────────*/

type Glow = { pos: number[]; rgba: number[] }

const pushQuad = (g: Glow, a: V, b: V, c: V, d: V, alpha: number) => {
  for (const q of [a, b, c, a, c, d]) {
    g.pos.push(q[0], q[1], q[2])
    // RGB is 1: the hue lives on the material, so a theme change is one colour
    // assignment rather than a buffer rewrite. Only the falloff is baked.
    g.rgba.push(1, 1, 1, alpha)
  }
}

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
    )
  }
  // The doorway is set back inside the frame, so the open leaf casts a real
  // edge across it instead of the light being a flat rectangle.
  pushQuad(
    g,
    [-DOOR_HW, DECK_Y, -0.06],
    [DOOR_HW, DECK_Y, -0.06],
    [DOOR_HW, DECK_Y + DOOR_H, -0.06],
    [-DOOR_HW, DECK_Y + DOOR_H, -0.06],
    1,
  )
  return g
}

/**
 * Everything the light does to what is around it: a stepped bloom on the wall,
 * and the warm pools it lays on the deck and out across the snow.
 *
 * The bloom is three nested quads at falling alpha rather than a radial
 * texture. That is not a compromise — it is the same trick the rest of this
 * scene uses, which is that a hard-edged step is the house style, and it means
 * there is no image to download, no texture to upload and nothing extra to
 * dispose. They are emitted largest first so the brightest lands on top.
 */
function buildGlowSoft(): Glow {
  const g: Glow = { pos: [], rgba: [] }
  const bloom = (cx: number, cy: number, hw: number, hh: number, z: number, k: number) => {
    const rings: [number, number][] = [
      [2.6, 0.08 * k],
      [1.8, 0.15 * k],
      [1.25, 0.26 * k],
    ]
    let dz = z
    for (const [scale, alpha] of rings) {
      const w = hw * scale
      const h = hh * scale
      pushQuad(g, [cx - w, cy - h, dz], [cx + w, cy - h, dz], [cx + w, cy + h, dz], [cx - w, cy + h, dz], alpha)
      dz += 0.006
    }
  }
  for (const sign of [-1, 1]) {
    bloom(sign * WIN_X, (WIN_Y0 + WIN_Y1) / 2, WIN_HW, (WIN_Y1 - WIN_Y0) / 2, 0.045, 1)
    // what a window puts on the snow in front of it
    pool(g, sign * WIN_X, 0.55, 3.1, 0.75, 1.5, 0.3)
  }
  bloom(0, DECK_Y + DOOR_H / 2, DOOR_HW, DOOR_H / 2, 0.045, 1.15)
  // the deck, then the snow past the steps
  pushQuad(
    g,
    [-0.85, DECK_Y + 0.02, 0.02],
    [0.85, DECK_Y + 0.02, 0.02],
    [1.15, DECK_Y + 0.02, DECK_Z],
    [-1.15, DECK_Y + 0.02, DECK_Z],
    0.42,
  )
  pool(g, 0, 2.9, 7.4, 1.35, 3.4, 0.5)
  return g
}

/**
 * A warm pool on the snow: a fan of three faceted bands widening away from the
 * cabin and fading to nothing, so the light has a shape on the ground rather
 * than stopping at a line.
 */
function pool(g: Glow, cx: number, z0: number, z1: number, w0: number, w1: number, alpha: number) {
  const bands = 3
  const y = 0.03
  for (let i = 0; i < bands; i++) {
    const k0 = i / bands
    const k1 = (i + 1) / bands
    const za = z0 + (z1 - z0) * k0
    const zb = z0 + (z1 - z0) * k1
    const wa = w0 + (w1 - w0) * k0
    const wb = w0 + (w1 - w0) * k1
    const aa = alpha * (1 - k0) * (1 - k0)
    const ab = alpha * (1 - k1) * (1 - k1)
    for (const q of [
      [cx - wa, y, za, aa],
      [cx + wa, y, za, aa],
      [cx + wb, y, zb, ab],
      [cx - wa, y, za, aa],
      [cx + wb, y, zb, ab],
      [cx - wb, y, zb, ab],
    ]) {
      g.pos.push(q[0], q[1], q[2])
      g.rgba.push(1, 1, 1, q[3])
    }
  }
}

/* ────────────────────────────────────────────────────────────────────────────
   Snow
   ──────────────────────────────────────────────────────────────────────────*/

const SNOW_HX = 13
const SNOW_HY = 14
const SNOW_HZ = 15
/** The box sits ahead of the camera, which is looking down -z. */
const SNOW_AHEAD = -7
const SNOW_SIZE = 0.055
