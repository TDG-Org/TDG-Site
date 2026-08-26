import { useEffect, useRef } from 'react'
import { onFrame, wake } from '../../lib/motion'
import { MAX_DPR, onDprChange } from '../../lib/dpr'

type Mote = { x: number; y: number; z: number; phase: number; speed: number; sway: number }

/** Density multiplier for the midnight hero look. */
const DENSITY = 1.7
/** These crawl at 4–17 px/s. Nobody can tell 24Hz from 60Hz, and it is 2.5x
 *  less canvas work for an identical result. */
const HZ = 24

/**
 * How far the moon's light reaches into the air, in DISC RADII.
 *
 * This file used to light a mote by its distance from a straight line — the
 * axis of the beams Hero.css drew — and there is no line any more. Hero.css's
 * `.hero__shafts` block has the full argument; the short version is that a
 * wedge raking past a moon reads as the moon having a tail, so the light in
 * this section radiates from the disc now and the dust has to agree with that
 * or it goes back to being brightest along a line no light is on, which is the
 * exact bug the last pass fixed in the other direction.
 *
 * The falloff is `1 - d²` at `d = distance / (discRadius * REACH)`, so a mote
 * is lit out to 5.6 disc radii — 524px at 1440x900 against a 94px radius, or
 * 2.8 disc diameters, which is between `.hero__bloom`'s 749px box and
 * `.hero__shaft-core`'s 1253px one. Wider and the pocket of lit air stops
 * being ON the moon; narrower and it is a ring around it.
 */
const REACH = 5.6

/**
 * What a mote is worth OUTSIDE that reach, as a fraction of its lit value.
 *
 * Not zero, and this is the half that answers "the starfield answering the
 * moon's exit". At zero the field is a pocket of dust around the disc and
 * nothing else, so the moon carries the whole sky away with it when it leaves
 * — 0.90vh of it, which is off the top of the frame by the end of the pin.
 * At 0.34 the sky keeps a quiet field of stars the moon was washing out, and
 * what travels is the BRIGHT part of it: the pocket rides up and left with the
 * disc and the stars it uncovers stay. That is the one thing a canvas can do
 * here that a gradient cannot, and it costs one subtraction per mote.
 */
const AMBIENT = 0.34

/** Where the light is when the moon's own element cannot be found — the frame
 *  centre, and a reach in raw pixels rather than in disc radii. A hero with no
 *  `.hero__moon` in it is a hero this dust is not visible in either, so this is
 *  a last resort that keeps the canvas drawing something rather than a value
 *  anybody composed. */
const FALLBACK_REACH = 480

/**
 * Dust motes in the air the moon is lighting, over a quiet field of stars.
 *
 * ## It stays dust in the light theme, and that was asked and answered
 *
 * `--hero-sky`'s light value is a shaded dusk now rather than a near-white
 * one, which opened the question of whether this could finally show STARS in
 * light the way it does in dark. It should not, and the reason is what the
 * layer is rather than how much room there is: these are motes in lit air, and
 * a mote is seen because the light behind it is not. In dark the sky is the
 * dark thing and the mote is the lit one; in light the air is the pale thing
 * and the mote is the speck of grit in it. A light theme that grew stars
 * would be the only place on this site where the two themes stop being the
 * same scene in two palettes — the same argument `scene/Moon.tsx` makes at
 * length about not turning the moon into a sun.
 *
 * What the shading did change is the GAIN. A dark speck is read against the
 * sky behind it, and the light sky's bottom half dropped from L* 88 to L* 77,
 * so the motes lost about a fifth of their contrast with it. `--hero-dust-gain`
 * went from 0.5 to 0.72 to put them back where they were composed.
 */
export function Starfield() {
  const canvas = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const cv = canvas.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return

    let w = 0
    let h = 0
    // The BACKING store's size, which is what the same-size guard in `fit`
    // compares. Not the CSS box: a DPR change moves these two and leaves the
    // CSS box exactly where it was, so comparing the CSS box would let the one
    // resize that is not a resize through and stop the one that is.
    // `scene/Snow.tsx` and `hero/PointCloud.tsx` compare the same two numbers.
    let backW = 0
    let backH = 0
    let motes: Mote[] = []

    let pending = 0
    /* `settled` is a claim about what is currently ON this canvas, so anything
       that can falsify it has to say so. Three things can, and each one ends by
       calling `invalidate`: `fit` writing `cv.width`, the DPR watcher going
       through that same `fit`, and the theme swap below. `scene/Snow.tsx`'s
       header carries the long version of why a canvas is not a thing you can
       stop drawing and assume stays drawn. */
    let settled = false
    const invalidate = () => {
      settled = false
      wake()
    }

    /**
     * The four numbers this canvas cannot declare for itself, kept current by
     * the attribute the colours actually hang off rather than by React.
     *
     * ── what it reads, and why none of it is written here any more ────────
     * This file used to hold `isLight ? 'rgb(20,20,26)' : 'rgb(214,232,255)'`
     * and a bare `isLight ? 0.5 : 1` beside it — two colours and a gain that
     * no palette change and no theme edit could ever reach, in the one part of
     * this section that paints outside CSS. `--hero-dust` and
     * `--hero-dust-gain` are declared per theme at the top of Hero.css now,
     * with the argument for each, and this reads them off the element's own
     * computed style, which is the only way a canvas can be told a colour
     * without hard-writing one.
     *
     * It used to answer the BEAM as well — `--beam-cx` and `--beam-tilt`, the
     * two numbers Hero.css placed `.hero__shaft-*` from — and both of those
     * properties are gone with the beams. Where the light is is now read off
     * `.hero__moon`'s own rect in the tick below, which is strictly better
     * than a declared constant could be: it is the same source of truth the
     * glow layers are placed from, and it carries the moon's scroll travel and
     * its pointer drift for free, neither of which a custom property can.
     *
     * ── why the repaint, and not just a fresher value ─────────────────────
     * This was a `useTheme()` read mirrored into a ref by a second effect, and
     * the drawing effect below has `[]` dependencies — so the ref moved and
     * nothing ever asked it again. With motion on that is invisible: the next
     * of 24 frames a second picks the new value up. At `mi === 0` there is no
     * next frame. The tick draws once, sets `settled`, and returns forever, so
     * a reduced-motion visitor who toggled the theme kept the old theme's dust
     * for the rest of the visit. **A ref was never the thing missing — the
     * repaint was**, which is why the observer below calls `invalidate`.
     * `scene/Snow.tsx` closes the identical hole this way, and
     * `origin/OriginField.tsx` did before it was deleted.
     *
     * ── and why it is safe to read at THIS line ───────────────────────────
     * Worth checking rather than assuming. `ThemeProvider` writes `data-theme`
     * from a parent effect, which runs after this child's, but `index.html`
     * has already set it from `localStorage` in a blocking head script —
     * "before first paint so there is no flash of the wrong scene" — and
     * `<html>` ships with `data-theme="dark"` besides. So the first read is
     * the real theme, and the provider's later write is a re-assert of the
     * same value. The observer is armed for the toggle, and would catch a
     * wrong first read anyway: its callback is a microtask, which lands before
     * the frame the `fit` below just woke.
     *
     * ── cost ──────────────────────────────────────────────────────────────
     * `getComputedStyle` is a style resolution, so it happens HERE — at mount
     * and on the theme flip — and never in the tick. `getPropertyValue` on a
     * property that is not declared returns the empty string, so every read
     * has a fallback and a lost stylesheet costs a slightly misplaced glow
     * rather than a blank canvas or a throw.
     */
    let ink = ''
    let gain = 1
    const readTheme = () => {
      const css = getComputedStyle(cv)
      const read = (name: string) => css.getPropertyValue(name).trim()
      // The one place a literal is still written, and it is the last resort
      // for a page whose stylesheet did not arrive — in which case there is no
      // hero for this dust to be in and the value cannot be seen anyway.
      ink = read('--hero-dust') || 'rgb(214,232,255)'
      const g = Number.parseFloat(read('--hero-dust-gain'))
      gain = Number.isFinite(g) ? g : 1
    }
    readTheme()
    const mo = new MutationObserver(() => {
      readTheme()
      invalidate()
    })
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

    /** One mote, at a position the caller picks. Everything else about it is
     *  the mote's own identity — depth, drift rate, sway, phase — and it
     *  survives a resize, which is the whole point of splitting this out. */
    const makeMote = (x: number, y: number): Mote => ({
      x,
      y,
      z: Math.random(),
      phase: Math.random() * Math.PI * 2,
      speed: 0.06 + Math.random() * 0.22,
      sway: 6 + Math.random() * 22,
    })

    /**
     * The box changed size — which is NOT the same event as "seed a new
     * field", and this file used to treat them as one.
     *
     * The `ResizeObserver` was handed the seeding function directly, so every
     * callback rebuilt all 190 motes out of `Math.random()`: dragging the
     * window wider re-dealt the entire field, repeatedly, mid-drag, in the
     * hero — where it is the most visible canvas on the site rather than the
     * least. `scene/Snow.tsx` had exactly this bug and its own header carries
     * the long version; this is that fix, brought back to the file it was
     * copied from. Three things follow from splitting the two jobs apart.
     *
     * **Nothing already drifting is thrown away.** Every mote keeps its
     * identity and its position is scaled into the new box, so the field
     * re-FITS. Only the count follows the area budget: surplus motes are
     * trimmed off the end and a box that grew is topped up, seeded across the
     * whole box because a handful arriving among a hundred and ninety is
     * invisible beside the thing this replaced.
     *
     * **A resize that is not one costs nothing.** `ResizeObserver` always
     * fires once on `observe`, so before the guard, mounting did two full
     * seeds and two array allocations. The guard compares the BACKING store,
     * so a DPR change still gets through while a CSS-box no-op does not.
     *
     * **And a resize that IS one has to invalidate the reduced-motion
     * frame.** Assigning `cv.width` blanks the canvas whether or not the value
     * changed, and at `mi === 0` this subscriber returns early forever once
     * `settled` is true — so a reduced-motion visitor who resized the window
     * would have lost the dust for the rest of the visit with no code path
     * left to bring it back. `Snow.tsx` names this as one of the three ways a
     * canvas silently blanks itself. Clearing `settled` and waking the loop
     * for one frame is the answer there and is the answer here.
     */
    const fit = () => {
      const cw = cv.clientWidth
      const ch = cv.clientHeight
      // No layout, no buffers, and no re-deal. This also means a box that is
      // briefly zero — print, a hidden ancestor — comes back with the field it
      // left rather than a new one.
      if (!cw || !ch) return
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
      const bw = Math.round(cw * dpr)
      const bh = Math.round(ch * dpr)
      if (bw === backW && bh === backH) return
      backW = bw
      backH = bh
      // Read before w/h move. Zero on the very first fit, which is the one
      // call that has nothing to carry across.
      const sx = w ? cw / w : 0
      const sy = h ? ch / h : 0
      w = cw
      h = ch
      cv.width = bw
      cv.height = bh
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (sx) {
        for (const m of motes) {
          m.x *= sx
          m.y *= sy
        }
      }
      const n = Math.min(190, Math.round(((w * h) / 11000) * DENSITY))
      if (n < motes.length) motes.length = n
      while (motes.length < n) motes.push(makeMote(Math.random() * w, Math.random() * h))
      // the two width/height writes above just blanked the canvas
      invalidate()
    }
    fit()

    const ro = new ResizeObserver(fit)
    ro.observe(cv)
    // The observer cannot see a scaling change on its own. See lib/dpr.ts.
    const unwatchDpr = onDprChange(fit)

    // The hero is pinned, so this canvas's own rect stays in the viewport for
    // as long as the section is anywhere near it — which is a poor guard, and
    // by construction the section runs a whole viewport PAST the point where
    // Origin has covered everything in it. `data-eclipsed` is Hero.tsx's
    // answer to exactly that, and an onFrame subscriber cannot see the
    // `visibility: hidden` Hero.css turns it into. An attribute read forces no
    // layout, so this is cheaper than the rect below it.
    const host = cv.closest('.hero')

    /* The light source, and it is an ELEMENT rather than two numbers.
       `.hero__moon` hangs inside the same `.stage__pin` this canvas does, its
       wrapper carries the `translate` Hero.tsx writes every frame, and
       `getBoundingClientRect` therefore reports where the disc actually is —
       scroll travel, pointer drift and every viewport clamp in `--moon-w`
       included. Looked up ONCE here rather than per tick: the element is
       mounted for this canvas's whole life — both are unconditional
       descendants of the one pin — and a `querySelector` in the tick would be
       a tree walk 24 times a second for an answer that cannot change.

       `Moon`'s visible disc is exactly the middle half of its own box, so the
       disc's radius is a quarter of the box's width — the same fact
       `scene/Moon.tsx`'s header states for the CSS that sizes it. */
    const moon = cv.parentElement?.querySelector('.hero__moon') ?? null

    const stop = onFrame(({ now, mi, dt, hold }) => {
      if (host?.hasAttribute('data-eclipsed')) return
      // the hero is the only place these are visible, so stop once it scrolls away
      const box = cv.getBoundingClientRect()
      if (box.bottom <= 0) return
      // Reduced motion: paint the field once and let the loop park. The motes
      // freeze in place already, but their brightness used to keep oscillating.
      if (mi === 0 && settled) return
      if (mi > 0) hold()
      pending += dt
      if (mi > 0 && pending < 1 / HZ) return
      pending = 0
      settled = mi === 0
      const t = now * 0.001
      const span = h + 40
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = ink

      /* Where the light is, in this canvas's own coordinates. One rect, read
         once per tick — 24 a second, in the frame loop's READ phase, beside
         the one this subscriber already takes. A moon that is not there leaves
         the pocket in the middle of the frame at a fixed reach, which is a
         picture rather than a crash. */
      let lightX = w * 0.5
      let lightY = h * 0.5
      let reach = FALLBACK_REACH
      if (moon) {
        const mr = moon.getBoundingClientRect()
        /* The width guard covers all three of them and not just the reach. A
           `display: none` element reports 0,0,0,0 — not "no rect" — so taking
           the centre unguarded would put the light at the CANVAS's own origin,
           which is the top-left corner of the frame: a sourceless glow in
           exactly the place the bloom used to be wrong about. Nothing hides
           the moon today; this is so that hiding it at some breakpoint later
           costs a flat field rather than a bug nobody can name. */
        if (mr.width > 0) {
          lightX = mr.x + mr.width * 0.5 - box.x
          lightY = mr.y + mr.height * 0.5 - box.y
          // the visible disc is the middle half of the box; radius is a quarter
          reach = mr.width * 0.25 * REACH
        }
      }
      const r2 = reach * reach

      for (const m of motes) {
        const y = mi === 0 ? m.y : (m.y - ((t * m.speed * 60) % span) + span) % span
        const sway = mi === 0 ? 0 : Math.sin(t * 0.5 + m.phase) * m.sway
        const px = m.x + sway
        /* How much of the moon's light this mote is standing in. It was the
           distance from a straight line — the beams' shared axis — and both
           the line and the beams are gone; Hero.css's `.hero__shafts` block
           has the argument. `1 - d²` in the SQUARE of the distance, so the
           only per-mote arithmetic is two subtractions and two multiplies and
           there is no `Math.hypot` in a loop that runs 190 times a tick. */
        const dx = px - lightX
        const dy = y - lightY
        const halo = Math.max(0, 1 - (dx * dx + dy * dy) / r2)
        /* AMBIENT is the floor, and it is what makes this a sky rather than a
           pocket: the field stays visible everywhere and only the BRIGHT part
           of it travels with the disc. Nothing is skipped for being dim any
           more — every mote is worth at least 0.34 now, where a mote outside
           the old beam was worth nothing and `continue` was free. */
        const lit = AMBIENT + (1 - AMBIENT) * halo
        // the third motion term, gated like y and sway, or reduced motion still twinkles
        const flicker = mi === 0 ? 0.85 : 0.55 + 0.45 * Math.sin(t * 1.1 + m.phase)
        ctx.globalAlpha =
          Math.min(1, lit * flicker * (0.18 + m.z * 0.62)) * (1 - y / (h * 1.35)) * gain
        ctx.beginPath()
        ctx.arc(px, y, 0.35 + m.z * 1.25, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    })

    return () => {
      stop()
      ro.disconnect()
      unwatchDpr()
      mo.disconnect()
    }
  }, [])

  return <canvas ref={canvas} className="hero__stars" aria-hidden="true" />
}
