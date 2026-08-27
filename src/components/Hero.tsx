import { lazy, Suspense, useEffect, useRef } from 'react'
import { clamp01, onFrame, settle } from '../lib/motion'
import { usePointer } from '../hooks/usePointer'
import { CrossGlyph } from './CrossGlyph'
import { Moon } from './scene/Moon'
import { Stage } from './scene/Stage'
import { StillArt } from './scene/ThemedArt'
import { Starfield } from './hero/Starfield'
import { Tagline } from './hero/Tagline'
import './Hero.css'

/* The model and its twelve form definitions are the largest thing on the page
   and none of it is needed to paint the hero. Split it out. */
const PointCloud = lazy(() =>
  import('./hero/PointCloud').then((m) => ({ default: m.PointCloud })),
)

/* ── the shape of this section, because the CSS alone will not tell you ─────
 *
 * The hero is a valley at night that STAYS WHERE IT IS while the page moves
 * over it. That is the one architectural idea taken from the reference the
 * site owner named — a backdrop that does not scroll, with ordinary sections
 * riding up over it — and on this site it is `scene/Stage`, whose header
 * carries the sticky mechanics and the traps.
 *
 * Three boxes, and each is doing a job the other two cannot:
 *
 *   .hero          min-height 230svh, `overflow: clip` (NOT hidden — see
 *                  Hero.css; hidden is a scroll container and kills sticky)
 *     Stage        absolute, adds nothing to flow. Its pin holds still for
 *                  230 − 100 = 130svh of scrolling: the whole beat. Measured
 *                  at 1440x900: the pin's top read 0 at scroll 0, 60, 117,
 *                  175, 234, 400, 700, 1000 and 1134, and only then began to
 *                  track. Origin's top climbed 1134 → 0 across that.
 *     .hero__above 130svh of ordinary flow. Its BOTTOM EDGE is the seam —
 *                  #origin is pulled up onto it with margin-top: -100svh, so
 *                  Origin's ceiling and this box's floor are the same line.
 *       .hero__frame  sticky, 100svh, the copy + the model + the strip. It
 *                  pins for 130 − 100 = 30svh, which is the runway the copy
 *                  has to dissolve in, and it releases exactly as Origin's
 *                  top reaches the viewport bottom.
 *
 * **The −100svh overlap is what makes this read like the reference rather
 * than like a tall hero.** Without it a stage releases the instant Origin
 * appears, so the scenery scrolls away underneath Origin at the same speed
 * Origin arrives — which is an ordinary page. With it, Origin climbs a full
 * viewport over a backdrop that has not moved a pixel. It costs no extra
 * page height at all: the hero's last 100svh is exactly the 100svh Origin's
 * negative margin takes back, so the document is the same length as a plain
 * 130svh hero would be.
 *
 * ── what moves, and how fast ───────────────────────────────────────────────
 * Everything in the stage is pinned, so a layer's speed IS its drift against
 * a still frame. Every number below is a fraction of the VIEWPORT travelled
 * over the whole 130svh pin, which is the only currency in which "twice as
 * fast" means the same thing on a laptop and on a phone. The pass before this
 * one stated the two ridges in PIXELS — 56 and 26 — and that is most of why
 * the site owner reported three times running that nothing moves: 56px is 6%
 * of a 900px window across an entire beat, and on a 1440px-tall screen it is
 * 4%.
 *
 *   near branch -0.120 vh (DOWN)        the bough over the nav — see below
 *   rear ridge   0.045 vh up            the far range, all but welded to the sky
 *   mid ridge    0.095 vh up            the third faceted range — see below
 *   valley haze  0.125 vh up            the basin IN FRONT of the mid range
 *   valley fog   0.155 vh up            the fog bank crossing it — see Hero.css
 *   main ridge   0.220 vh up            the horizon
 *   moon cloud   0.660 vh up, 0.30 left one wisp, slower than the disc it crosses
 *   tall pine    0.880 vh up            the near foreground — see below
 *   moon         0.900 vh up, 0.44 left the page's connecting thread
 *   bloom        0.86 x the moon        the moon's own glow, lagging slightly
 *   air          0.58 x the moon        the lit sky, lagging further
 *   lamppost     1.0     — it is not in here at all. It belongs to #origin,
 *                          stands on Origin's ground and therefore travels at
 *                          exactly page rate. See Origin.tsx.
 *
 * Three properties of that table are the whole point and none survives being
 * "tidied" toward the middle:
 *
 * **The spread is an order of magnitude, and it is a SUM at both ends.**
 * Fastest terrain to slowest is 0.220 / 0.045 = 4.9x. The pine now travels
 * WITH the page rather than against it — the owner asked for it to rise, and
 * the target that fixed the magnitude is in PINE_LIFT — so the trick that used
 * to buy the near/far separation moved to the BRANCH, which is the layer that
 * now goes the other way at -0.120. Relative travel: pine against ridge
 * 0.660vh (594px at 1440x900, where the old negative pine managed 0.310vh);
 * branch against pine 1.000vh, because those two are moving apart. Across the
 * whole frame it is the moon's 0.900 against the branch's -0.120, which is
 * 1.020vh of relative travel between the top and the bottom of the depth
 * ladder. Two layers 20% apart read as one layer; these visibly slide against
 * each other in the valleys.
 *
 * **The light lags its own source, at two rates.** The moon is at 1, the
 * bloom on the disc at 0.86 and the lit air at 0.58, so what a reader sees is
 * light staying behind in the sky the moon is leaving. One rate would be a
 * sticker with two more stickers on it.
 *
 * **The moon is the fastest thing in the frame and it is meant to be.** It
 * leaves here and turns up again behind the cross on the Faith summit, so its
 * exit is the one piece of motion in this section that is still running long
 * after the copy has dissolved (the copy is gone at 23.1% of the pin, where
 * the eased moon has spent only 15% of its travel).
 *
 * ── one rect, eleven layers ────────────────────────────────────────────────
 * All of it comes off ONE `getBoundingClientRect` per frame, on `.hero__above`
 * — the box whose height is the pin's travel and whose bottom edge is the
 * seam. `useSectionProgress` was the obvious driver and is not used here: its
 * `p` runs over `vh + height` with the section entirely off screen at both
 * ends, so recovering "how far through the runway am I" from it needs the
 * height and the viewport back again, which is the measurement it was meant
 * to save. One rect, read once, is cheaper and exact.
 */

/**
 * The main ridge, as a fraction of the viewport height over the whole pin.
 *
 * ── the constraint that actually binds, now that it has been re-derived ────
 * It used to be "the ridge's own foot must not lift far enough to expose bare
 * sky under it", and under that constraint 56px was defensible: below the
 * ridge's foot was #origin's `--tint-top` at full opacity, arriving on a hard
 * band, so a foot that lifted off it opened a lit strip between two edges.
 *
 * Contract D removed that. Origin opens TRANSPARENT now and ramps to its band
 * over `--origin-dissolve` of a viewport, so what is under the ridge's foot is
 * the hero's own sky and its own haze all the way down. The binding constraint
 * is therefore no longer a band at all — it is that **the ridge's haze must
 * still reach the frame's floor after the lift**, because the haze is what
 * carries the ridge's ink down into the sky and a foot that lifts past its own
 * haze leaves a soft but findable edge where the ink stops.
 *
 * That is arithmetic and Hero.css owns it: the haze's reach below the floor is
 * (head - foot-lo + tail) x --terrain-w - --art-rise, and `--haze-tail` was
 * lengthened from 0.08 to 0.15 in the same edit as this number so the margin
 * stays positive at every viewport this is drawn at. Worst case in the table
 * in Hero.css is 375x667, where the reach is 192px and the lift is 147px —
 * 45px of margin. At 1440x900 it is 351px against 198px.
 * There is also a `.hero__valley` plane behind the ridge whose whole job is to
 * be the thing you see if that margin is ever wrong; it is belt and braces,
 * not the proof.
 *
 * The second, weaker constraint is the copy: the ridge rises TOWARD the CTA
 * row. The row is at zero opacity by 15.5% of the pin, where the eased lift
 * has spent 6.7% of itself — 13.3px at 1440x900 — so `.hero`'s clearance
 * budget reserves 18px for it. That reservation moved from 12 in this edit
 * and Hero.css's `--art-band` comment carries the working.
 */
const RIDGE_LIFT = 0.22
/**
 * The far range, same currency. A fifth of the main ridge's rate, not half:
 * the previous pass's 2.15:1 is inside the range where two layers read as one
 * thickness of mountain, and the whole complaint was that nothing slides
 * against anything. At 4.9:1 the rear range visibly crawls while the near one
 * climbs, which is the only place a range behind a range can be seen at all.
 */
const REAR_LIFT = 0.045
/**
 * The THIRD faceted range, `landscapes/mountain-ridge-mid`, placed this pass.
 *
 * `.hero__valley` — the basin gradient below — was standing in for exactly this
 * plane: it was doing the aerial perspective and carrying a velocity, but it
 * had no silhouette, so the frame had two ranges and a wash between them rather
 * than three ranges. The wash stays (it is this plane's AIR, and it is the
 * belt-and-braces ground under the near range's lifting foot); what is new is
 * that the plane now has an edge you can read.
 *
 * 0.095 is 2.1x the far range and 0.43x the near one — as near the geometric
 * middle of 0.045 and 0.220 as a two-decimal number gets. The rear/mid ratio is
 * the one to watch, because REAR_LIFT's own comment dismisses 2.15:1 as "inside
 * the range where two layers read as one thickness of mountain". That was true
 * of two ranges with NOTHING between them; there are two haze planes between
 * these two now, and 0.05vh of differential is 45px at 1440x900 across the pin.
 */
const MID_LIFT = 0.095
/**
 * The basin haze — the air in front of the mid range.
 *
 * It was 0.09, which is where the mid range now is, and it had to move: it sits
 * in FRONT of that silhouette in the DOM, and a layer drawn in front of another
 * one while travelling slower than it is a depth cue pointing the wrong way.
 * 0.125 keeps it between the plane behind it and the fog in front of it.
 */
const VALLEY_LIFT = 0.125
/**
 * The fog bank crossing the basin — `landscapes/valley-fog`, placed this pass
 * over the single CSS ellipse that used to stand here.
 *
 * 0.135 -> 0.155 for the same reason the basin moved: everything in this part
 * of the ladder shifted up by one plane when the mid range took 0.095. It is
 * still between the basin behind it and the near silhouette in front of it,
 * which is where it sits in the DOM. Hero.css carries its geometry and the
 * horizontal drift it also has, which is a compositor `transform` on the art
 * itself rather than a second writer of the wrapper's `translate`.
 */
const WEATHER_LIFT = 0.155
/**
 * The near foreground, as a fraction of the viewport height. It was -0.09 and
 * it is now +0.88, and the magnitude is not a taste judgement — it is SOLVED,
 * against a target the site owner named.
 *
 * ── the note ──────────────────────────────────────────────────────────────
 * "when scrolling down, it should be moving up a bit more, the root or bottom
 * of the tree should stop where the header of the our story section starts."
 * The tree used to travel DOWN, so its cut base was never on screen at all and
 * there was nothing to plant.
 *
 * ── why "stop" is a real word here and not a metaphor ─────────────────────
 * The stage is pinned for the whole 130svh of `.hero__above` and then TRACKS.
 * #origin is pulled up onto the hero's last 100svh, so from the end of the pin
 * onward the stage and Origin travel together at page rate — whatever the
 * pine's base is level with at that instant, it stays level with until the
 * hero stops painting 0.78vh later. So landing the base on Origin's heading at
 * the end of the pin is landing it there for the whole rest of the beat.
 *
 * ── the geometry, and it fixes the magnitude rather than leaving it to taste ─
 * Read off the live DOM at scroll = 130svh: `#origin .origin__heading`'s top is
 * at y 165.6 at 1440x900, 166.0 at 1920x1080, 151.2 at 1280x800 and 135.0 at
 * 1100x900. It tracks viewport WIDTH (Origin's shell padding clamps on vw) and
 * is all but flat in viewport height.
 *
 * With `d` = how far the pine's box hangs below the frame's floor at rest, and
 * the art's ink running to 0.9993 of the box in both themes so the box's bottom
 * IS the base:
 *
 *   base at the end of the pin = vh + d - PINE_LIFT x vh
 *
 * The base must not be ABOVE the floor at rest — a near tree whose cut base
 * floats in mid-air over the mountains is the sticker this section spent two
 * passes removing — so d >= 0, which alone forces
 *
 *   PINE_LIFT >= 1 - heading/vh = 0.816 at 1440x900.
 *
 * That is the whole answer to "why so much": the base starts under the frame
 * and has to finish a sixth of a screen from the top of it, which is most of a
 * viewport of travel however the rest is arranged. 0.88 leaves d = 57.6px of
 * crop at rest at 1440x900 (27.0px at 1100x900, the narrowest this is drawn
 * at), and it keeps the MOON the fastest thing in the frame at 0.90, which is
 * a decision this file has made twice and did not want to give up for a pine.
 * Hero.css solves `bottom` from the same equation and carries the readings.
 *
 * ── what it costs, and where the depth went instead ───────────────────────
 * Flipping the sign gives up the trick the negative number was bought for: a
 * layer travelling against the page adds to its neighbour's travel instead of
 * subtracting from it. Relative to the main ridge the pine used to manage
 * 0.22 + 0.09 = 0.31vh. It is now 0.88 - 0.22 = 0.66vh — 594px at 1440x900,
 * more than twice what the negative rate bought — because the magnitude went up
 * by nearly ten times, so the separation survived the sign change with room to
 * spare. The SUM trick itself moved to BRANCH_LIFT below, which is the layer
 * that now goes the other way.
 *
 * It still answers the MOUSE hardest of anything in the frame (48px against
 * the moon's 13), which is the other half of what makes it read as near.
 */
const PINE_LIFT = 0.88
/**
 * `props/near-branch` — the bough entering from the top-left, placed this pass,
 * and the only layer in the frame that moves AGAINST the page.
 *
 * The hero had one near prop and nothing at all in its top half. This is the
 * second, at the opposite corner, and it takes over the job PINE_LIFT's
 * negative sign used to do: relative travel is a SUM rather than a difference,
 * so against the pine it is 0.88 + 0.12 = 1.00vh and against the main ridge
 * 0.34vh. Nothing else in the section can buy a whole viewport of relative
 * travel for one number.
 *
 * -0.12 rather than something larger because the branch DESCENDS into the
 * frame as it goes, and everything it descends toward is copy: at 1440x900 its
 * ink ends 46px above `.hero__inner`'s top edge at rest, and by the moment the
 * copy is fully dissolved (out = 1 at 30svh, where the scenery's eased progress
 * is only 0.135) it has come down 14.6px of that. The rest of the descent
 * happens over an empty frame. Hero.css carries the clearance table.
 *
 * It takes NO pointer offset, and that is deliberate rather than forgotten —
 * see the amplitudes below, where the three-responder rule is argued.
 */
const BRANCH_LIFT = -0.12
/**
 * The moon's exit: up this much of the viewport, and left this much of it.
 *
 * ── the constraint that set it, and it is not a taste judgement ───────────
 * 0.46 was the previous pass's answer and it left the moon on screen for the
 * whole pin. That is the defect in `r2-D-0700`, and the diagnosis in the brief
 * — "the ridge art is drawn at --art-far, so it is translucent, and the moon
 * behind it shows through" — is not what is happening. This section's own
 * mountains clear the disc completely at scroll 700: the near range's highest
 * ink is at y 743 at rest and the whole range travels UP at 0.22vh against the
 * moon's 0.90, so the two only ever separate. Hiding `#origin` alone leaves a
 * clean opaque moon.
 *
 * What crosses the disc is #ORIGIN, arriving. Origin opens transparent and
 * ramps to its band over `--origin-dissolve` (Contract D), and its snow drift
 * escapes its own clip box, so for about 250px of scroll a translucent crest
 * sweeps up through a hard bright disc — which is precisely what frosted glass
 * looks like. The hero cannot occlude it: the stage is z-index 0 and #origin
 * is 4, and that order is what puts the lamppost in front of these mountains.
 *
 * It cannot be outrun either — Origin travels at page rate and this is a
 * fraction of a pin — but it CAN be got out of the way of. At 0.90 the disc's
 * bottom limb is above Origin's crest at every scroll position from the top of
 * the page onward: crest y = 1170 - s - 70 against disc bottom y = 761 - 810 x
 * smooth(s/1170), which reads 400 vs 239 at s=700, 300 vs 143 at s=800 and 200
 * vs 60 at s=900, and the disc is off the top of the frame by s=1000. The two
 * never meet. (761 rather than 762 is the disc's new resting bottom — the moon
 * moved up 16px and grew 29px in diameter in the same edit, and the two nearly
 * cancel at its lower limb. Hero.css's --moon-drop block has both.) Fading the
 * disc instead would have made it worse rather than better: a translucent crest
 * over a half-opacity moon is MORE glass, not less.
 *
 * The drift went to 0.44 with it so the exit keeps its diagonal rather than
 * becoming a vertical launch. The binding check on the drift is the TAGLINE,
 * whose box is 452px wide from x 156 and can therefore reach x 608 at 1440x900.
 * The disc's left limb rests at 626 — 18px clear — and the drift walks it left
 * from there, so the check is not "do they overlap" but "has the copy gone by
 * the time they do":
 *
 *   s   0   limb 626   tagline opacity 1.00
 *   s 160   limb 606   tagline opacity 0.43   ← the limb crosses x 608 here
 *   s 217   limb 591   tagline opacity 0      ← gone (1 - out x 1.5 reaches 0)
 *
 * So the disc enters the tagline's box only after the words are under half
 * opacity and is 15px into it when they leave. The wordmark and the CTA row are
 * both further left than the tagline and are never a constraint.
 */
const MOON_LIFT = 0.9
const MOON_DRIFT = 0.44
/**
 * `props/moon-cloud` — one torn wisp, placed this pass, and the reason it is a
 * LIFT/DRIFT pair rather than a follow factor like the bloom and the air.
 *
 * The bloom and the lit sky are the moon's own light, so they take the moon's
 * offset scaled: light on the air has no direction its source does not give it,
 * and a scalar multiple is the only form that cannot disagree with it. A cloud
 * is not light. It is an object at its own distance in the same sky, and what
 * makes the moon's exit read as SKY rather than as a sprite translating is that
 * the two paths are not parallel — the wisp rises less and drifts less, so over
 * the pin it slides 0.24vh DOWN and 0.14vh RIGHT relative to the disc. At
 * 1440x900 that is 216px down against a 216px disc: the wisp crosses the whole
 * face and clears the lower limb, rather than sitting on it like a decal.
 *
 * 0.66 is between the disc's 0.90 and the lit air's 0.522 (AIR_FOLLOW x
 * MOON_LIFT), which is where the brief asks for it and is also where a cloud
 * belongs: nearer than the sky's own glow, further than the object it crosses.
 */
const CLOUD_LIFT = 0.66
const CLOUD_DRIFT = 0.3
/** How closely the bloom tracks the moon it is the glow of. Not 1: a glow
 *  welded to its source is a sticker with a second sticker on it, and the lag
 *  is what makes the light read as being in the air rather than on the disc.
 *  Not 0.72 either — at that rate the bloom fell 100px behind by the end and
 *  admitted the moon was a sprite, which is the bug the previous pass wrote
 *  0.72 to fix and did not quite. */
const BLOOM_FOLLOW = 0.86
/**
 * And how closely the LIT AIR tracks it — the two ellipses that replaced the
 * light shafts (Hero.css). Further out in the air than the bloom is, so it
 * lags further: 0.58 against 0.86, which makes three rates on one axis where
 * the wedges had a fourth direction all of their own.
 *
 * It is a follow factor and not a lift/drift pair on purpose. The old
 * SHAFT_LIFT/SHAFT_DRIFT sent the beams up and to the LEFT at rates unrelated
 * to the moon's, so the group could and did slide out from under the source it
 * was supposed to be coming from. Light on the air has no direction its source
 * does not give it, and a scalar multiple of the moon's own offset is the only
 * form that cannot disagree with it.
 */
const AIR_FOLLOW = 0.58
/** How far the copy is blurred once it has finished dissolving, px. */
const COPY_BLUR = 6.5

/* Pointer amplitudes, in px, at the extremes of the viewport.
 *
 * THREE layers respond and no more, and that half is unchanged — including
 * through a pass that added THREE new layers, one of which (`near-branch`) is
 * the nearest thing in the frame and is the obvious candidate for a fourth.
 * `usePointer` is damped and shared, so the cost is not the reason — the reason
 * is that everything moving with the mouse is seasickness, and depth reads
 * from a DIFFERENCE. The pine is near and moves like it; the moon is far; the
 * ridges, the valley, the fog, the cloud, the branch and the sky do not answer
 * the mouse at all, which is what makes the pine look near. (The bloom is not a
 * fourth responder: it is the moon's own light and takes the moon's terms
 * scaled by BLOOM_FOLLOW, so it cannot disagree with the thing it is coming
 * from.) The branch's depth is bought instead with the one cue the pine gave
 * up — a negative scroll rate — and with two cropped edges. The lamppost's own
 * amount is in Origin.css/Origin.tsx, because the lamppost lives in that
 * section.
 *
 * The MOON'S SIGN is opposite the pine's, which is the interesting half. A far
 * layer drifting the OTHER way from a near one is what a real pair of eyes
 * reports when the head moves, and it makes the relative travel the sum rather
 * than the difference: 48 + 13 = 61px across the frame, where the pair before
 * last managed 26 - 7 = 19px.
 *
 * Both pine numbers came DOWN this pass and neither is a new judgement.
 * X: 58 -> 48, because 58 was "a twelfth of the pine's own width" and the tree
 * is narrower now — a twelfth of 576px at 1440x900 is exactly 48. Past that ceiling
 * the tree reads as sliding across the frame rather than as being nearer than
 * it. The crop is 164.7px of INK off the right edge at 1440x900, so even the full
 * amplitude cannot pull the tree's right edge into the frame.
 * Y: 27 -> 21, which is the same twelfth scaled by the old pair's own 0.47
 * ratio, minus a little. The extra is bought for a new reason: the pine's base
 * is a composed LINE now (PINE_LIFT), and this amplitude is the amount a mouse
 * in the corner of the window can smear it by. +/-21px against a heading 118.8px
 * tall is a wobble; +/-27px was starting to be a miss. */
const PINE_POINT_X = 48
const PINE_POINT_Y = 21
const MOON_POINT_X = -13
const MOON_POINT_Y = -6

/** 3t² − 2t³. Zero slope at both ends, so nothing starts or stops with a jerk.
 *  This is the SCENERY's curve: travel, which should ease in and out. */
const smooth = (t: number) => t * t * (3 - 2 * t)

/**
 * The COPY's curve, and it is not the same one.
 *
 * A symmetric ease is wrong for a dissolve. Measured with `smooth` in place at
 * 1440x900, where the runway is 270px: the CTA row and the bottom strip were
 * at zero by 117px of scroll and the wordmark was at half opacity with a
 * 3.2px blur — a wheel notch and a half, which reads as the copy being yanked
 * rather than dissolving. The trouble is `smooth`'s steepest slope is in the
 * MIDDLE, so the words lose most of their opacity in the middle third and the
 * reader never gets a stretch where the hero is visibly held and visibly
 * going.
 *
 * An ease-IN puts the steep part at the end. At 1.85 the wordmark is still at
 * 0.92 after 60px, 0.72 after half the runway and 0.41 at three quarters,
 * which is the shape of something fading rather than something being switched
 * off. 2 was a shade too abrupt at the end; 1.85 keeps a little slope there.
 */
const dissolve = (t: number) => Math.pow(t, 1.85)

/**
 * Below this the damped progress can no longer change a painted pixel.
 *
 * The largest thing progress drives is the moon, at 0.90vh — 972px on a tall
 * window. 0.00006 of that is a seventeenth of a pixel, and every other layer
 * is smaller. Snapping here is what lets `hold()` stop, which is what lets the
 * loop park, which is the whole reason `motion.ts` measures 0.1ms/s parked.
 *
 * It halved this pass and had to: it was 0.00012 against a 0.46vh moon, which
 * was the same seventeenth of a pixel, and MOON_LIFT then doubled. The budget
 * it has to stay inside is the half pixel below which nothing can be drawn
 * differently, so 0.00012 would still have been correct — but "a seventeenth
 * of a pixel of the largest layer" is the rule this number is, and a rule that
 * quietly stops being true is worse than a slack one.
 */
const EPSILON = 0.00006

export function Hero() {
  const section = useRef<HTMLElement | null>(null)
  const above = useRef<HTMLDivElement | null>(null)
  const frame = useRef<HTMLDivElement | null>(null)
  const moon = useRef<HTMLDivElement | null>(null)
  const cloud = useRef<HTMLDivElement | null>(null)
  const rear = useRef<HTMLDivElement | null>(null)
  const mid = useRef<HTMLDivElement | null>(null)
  const valley = useRef<HTMLDivElement | null>(null)
  const weather = useRef<HTMLDivElement | null>(null)
  const ridge = useRef<HTMLDivElement | null>(null)
  const pine = useRef<HTMLDivElement | null>(null)
  const branch = useRef<HTMLDivElement | null>(null)
  const shafts = useRef<HTMLDivElement | null>(null)
  const bloom = useRef<HTMLDivElement | null>(null)
  const pointer = usePointer()

  useEffect(() => {
    const box = above.current
    const host = section.current
    const fr = frame.current
    if (!box || !host || !fr) return

    /* ── Contract D, half two: how far past its own top edge Origin has to be
       before the hero may stop painting ──────────────────────────────────────
       `--origin-dissolve` is a unitless fraction of the viewport, declared once
       in tokens.css, and it is the same number Origin.css spends as
       `calc(var(--origin-dissolve) * 100svh)` on the ramp its background opens
       with. Two consumers, one value: raise it there and the ramp gets longer
       and the hero goes on painting for exactly as long as the ramp needs,
       with nothing to keep in step by hand.

       Read ONCE, here, and not per frame. It cannot change without a reload —
       nothing on this page rewrites it, the theme does not carry it, and a
       `getComputedStyle` on the document element every frame is a style
       resolution the frame loop has no reason to pay for.

       `parseFloat` and a 0 fallback rather than a hardcoded 0.78, because a
       browser that somehow lost the token must still get a CORRECT page: at 0
       the guard is exactly what it was before this contract existed — hide the
       stage the moment Origin's top reaches the viewport top — which is the
       answer that was right when Origin's band arrived opaque. Hardcoding the
       number here would instead give that browser a hero painting behind an
       opaque section for three quarters of a screen. */
    const declared = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--origin-dissolve'),
    )
    // NOT named `dissolve`: that is the copy's easing curve at module scope and
    // it is called further down this same effect.
    const dissolveDepth = Number.isFinite(declared) ? declared : 0

    /*
     * `cur` is the DAMPED scene progress, and the damping is the difference
     * between a moon and a moon-shaped scrollbar. Welded straight to scroll
     * position, every layer here inherits the trackpad's own judder: two
     * momentum events a frame apart with different deltas move the moon by
     * different amounts on consecutive frames, which the eye reads as
     * stuttering rather than as gliding. A lerp toward the target smooths the
     * input without adding lag anybody can name — about 17 frames to settle,
     * the same rate the parallax hooks use.
     *
     * The copy does NOT go through it. A fade is not travel: damping it only
     * makes the words linger a fifth of a second after the reader has stopped,
     * which reads as the page being slow rather than as the copy having
     * weight.
     */
    let cur = 0
    let seeded = false
    let paintedScene = ''
    let paintedCopy = ''
    let eclipsed: boolean | null = null

    return onFrame(({ vh, mi, dt, hold }) => {
      const r = box.getBoundingClientRect()

      /* ── covered ─────────────────────────────────────────────────────────
         `.hero__above`'s bottom edge IS Origin's top edge (the negative margin
         above), so `r.bottom` is where Origin's ceiling is in the viewport.

         It used to read `r.bottom <= 0` — "Origin has reached the top of the
         viewport" — and that was the right test only while Origin's band
         arrived opaque. Under Contract D it is the WRONG one and it is wrong
         at exactly the worst moment: Origin now opens transparent and ramps to
         its band over `--origin-dissolve` of a viewport, so for that whole ramp
         what a reader is looking at through the arriving section is this
         section's sky, its haze and its ridge. Hiding the stage at 0 blanked
         all three the instant the dissolve started, which turned the ramp into
         a fade from the hero to nothing and put the ruled line back one frame
         later than before.

         So the test is now Origin's DISSOLVE having finished rather than its
         edge having landed. That is safe by construction rather than by
         measurement: the stage's pin is 100svh and, once released, it rests
         exactly over Origin's first 100svh (Hero.tsx's box diagram above), so
         with `--origin-dissolve` at or below 1 every pixel of the ramp has
         hero sky behind it at every scroll position. `Stage`'s own
         `data-covered` keeps up for free — it fires 120px outside the SECTION,
         whose bottom is a further 100svh down.

         `Stage`'s `data-covered` cannot answer this question in the first
         place, for the same reason it could not before: it watches the section,
         and the section runs a further 100svh below the seam by construction —
         so without this the stage, the starfield and every breathing gradient
         in here would go on painting for two full viewports of scrolling
         behind an opaque Origin. It is a paint guard, not an animation, so it
         reads no `mi` and behaves identically under reduced motion. It starts
         absent, so a hero that never gets a frame is a hero you can see. */
      const covered = r.bottom <= -dissolveDepth * vh
      const flip = covered === eclipsed ? null : covered
      if (flip !== null) eclipsed = covered

      /* Reduced motion: the section is 100svh (Hero.css), there is no runway
         and there is nothing to drive. Write the identity — no fade, no blur,
         every layer at the resting position it was composed in — and return
         without holding. The scenery stays visible and still, which is what
         guardrail 5 of the art kit asks for. */
      if (mi === 0) {
        const copy = '0|none'
        const scene = 'rest'
        const cw = copy === paintedCopy ? null : copy
        const sw = scene === paintedScene ? null : scene
        if (cw === null && sw === null && flip === null) return
        paintedCopy = copy
        paintedScene = scene
        return () => {
          if (cw !== null) {
            fr.style.setProperty('--hero-out', '0')
            fr.style.setProperty('--hero-blur', 'none')
          }
          if (sw !== null) {
            for (const el of [
              moon,
              cloud,
              rear,
              mid,
              valley,
              weather,
              ridge,
              pine,
              branch,
              shafts,
              bloom,
            ]) {
              if (el.current) el.current.style.translate = ''
            }
          }
          if (flip !== null) {
            if (flip) host.setAttribute('data-eclipsed', 'true')
            else host.removeAttribute('data-eclipsed')
          }
        }
      }

      /* The pin's travel is the box's whole height (it is 130svh in a 100svh
         window, so `sticky` holds for height − vh and the last vh is Origin
         climbing over it); the COPY's runway is height − vh, which ends exactly
         as Origin's top touches the viewport bottom. Both fall out of the one
         rect. */
      const span = r.height || 1
      const runway = Math.max(1, r.height - vh)
      const target = clamp01(-r.top / span)
      const out = dissolve(clamp01(-r.top / runway))

      if (!seeded) {
        // A reload halfway down the page, or a #origin link followed from
        // another route, must not glide the scenery in from the top of the
        // run. Land on the truth for the first frame and damp from there.
        cur = target
        seeded = true
      } else {
        const d = target - cur
        if (d > EPSILON || d < -EPSILON) {
          hold()
          cur += d * settle(0.16, dt)
        } else {
          cur = target
        }
      }

      const e = smooth(cur)
      const px = pointer.x
      const py = pointer.y

      // Every layer's whole `translate` in one string, so nothing here has to
      // read back what another writer left. Two writers on one element is the
      // bug ThemedArt.tsx's header is about; there is exactly one here.
      // The moon's whole offset, and BOTH the glows are scalar multiples of it
      // — written that way rather than as three similar expressions so light
      // can never end up travelling somewhere its own source is not.
      const moonX = -MOON_DRIFT * vh * e + px * MOON_POINT_X
      const moonY = -MOON_LIFT * vh * e + py * MOON_POINT_Y
      const moonT = `${moonX.toFixed(1)}px ${moonY.toFixed(1)}px`
      const bloomT = `${(moonX * BLOOM_FOLLOW).toFixed(1)}px ${(moonY * BLOOM_FOLLOW).toFixed(1)}px`
      const shaftT = `${(moonX * AIR_FOLLOW).toFixed(1)}px ${(moonY * AIR_FOLLOW).toFixed(1)}px`
      // The cloud is the one sky layer that is NOT a multiple of the moon's
      // offset — see CLOUD_LIFT for why an object may not take a light's terms.
      const cloudT = `${(-CLOUD_DRIFT * vh * e).toFixed(1)}px ${(-CLOUD_LIFT * vh * e).toFixed(1)}px`
      const rearT = `0 ${(-REAR_LIFT * vh * e).toFixed(1)}px`
      const midT = `0 ${(-MID_LIFT * vh * e).toFixed(1)}px`
      const valleyT = `0 ${(-VALLEY_LIFT * vh * e).toFixed(1)}px`
      const weatherT = `0 ${(-WEATHER_LIFT * vh * e).toFixed(1)}px`
      const ridgeT = `0 ${(-RIDGE_LIFT * vh * e).toFixed(1)}px`
      const pineT = `${(px * PINE_POINT_X).toFixed(1)}px ${(-PINE_LIFT * vh * e + py * PINE_POINT_Y).toFixed(1)}px`
      const branchT = `0 ${(-BRANCH_LIFT * vh * e).toFixed(1)}px`

      const scene = `${moonT}|${cloudT}|${bloomT}|${rearT}|${midT}|${valleyT}|${weatherT}|${ridgeT}|${pineT}|${branchT}|${shaftT}`
      const blur = out > 0.008 ? `blur(${(out * COPY_BLUR).toFixed(2)}px)` : 'none'
      const copy = `${(1 - out).toFixed(4)}|${blur}`

      const sw = scene === paintedScene ? null : scene
      const cw = copy === paintedCopy ? null : copy
      if (sw === null && cw === null && flip === null) return
      paintedScene = scene
      paintedCopy = copy

      return () => {
        if (sw !== null) {
          if (moon.current) moon.current.style.translate = moonT
          if (cloud.current) cloud.current.style.translate = cloudT
          if (bloom.current) bloom.current.style.translate = bloomT
          if (rear.current) rear.current.style.translate = rearT
          if (mid.current) mid.current.style.translate = midT
          if (valley.current) valley.current.style.translate = valleyT
          if (weather.current) weather.current.style.translate = weatherT
          if (ridge.current) ridge.current.style.translate = ridgeT
          if (pine.current) pine.current.style.translate = pineT
          if (branch.current) branch.current.style.translate = branchT
          if (shafts.current) shafts.current.style.translate = shaftT
        }
        if (cw !== null) {
          fr.style.setProperty('--hero-out', out.toFixed(4))
          fr.style.setProperty('--hero-blur', blur)
        }
        if (flip !== null) {
          if (flip) host.setAttribute('data-eclipsed', 'true')
          else host.removeAttribute('data-eclipsed')
        }
      }
    })
  }, [pointer])

  return (
    <section id="top" ref={section} className="hero stage-host">
      {/* ── the valley, and it does not move ────────────────────────────────
          Everything in here is pinned by `Stage`. Back to front, which is DOM
          order inside one stacking context at z-index 0:

            sky · lit air · moon · moon cloud · rear haze + rear ridge ·
            mid ridge · basin haze · valley fog · ridge haze + main ridge ·
            dust · bloom · tall pine · near branch · grain · vignette

          Four of those are new this pass and all four were asked for by name:
          `landscapes/mountain-ridge-mid`, `props/moon-cloud`,
          `landscapes/valley-fog` (which replaced the single CSS ellipse
          `.hero__weather` used to be) and `props/near-branch`. What each one is
          for is argued at its own rate constant above and at its own block in
          Hero.css; what belongs here is only where each sits in the stack, and
          two of those positions are load-bearing:

          the CLOUD is in FRONT of the disc, because a wisp behind a moon is a
          wisp nobody can see cross it, and crossing it is the entire job;

          the BRANCH is the last thing before the grain, in front of even the
          pine, because it is the nearest object in the frame — a bough at the
          camera rather than a tree in the middle distance — and it is the only
          layer here allowed to overlap the nav.

          Each range is a haze and a file inside ONE wrapper at ONE opacity.
          A cutout has a hard alpha edge where its ink runs out, and both
          ridge files run out along a nearly horizontal cut — the rear one in
          light is flat to a single pixel across the whole file, which is the
          "straight line" the site owner asked to be rid of. The haze is a
          gradient in that file's own foot ink, so wherever the cut happens
          there is nothing to see and the mass falls away downward instead of
          stopping. Hero.css carries the geometry and the two different rates;
          tokens.css carries the sampled colours and the band derived from
          them.

          That is the art kit's own hero order (guardrail 3 of
          public/assets/parallax/README.md) with the fog veil taken OUT and the
          rear ridge put in its place. The fog was the "other smooth mountains
          behind the mountains" the site owner asked to be rid of: soft blurred
          bands that read as vague hills rather than as a range. The rear ridge
          is a properly faceted distant range in the main ridge's own language,
          and it is held to being unmistakably FAR — paler (--art-far), lower,
          and drifting at less than half the main ridge's rate.

          The moon is BEHIND the ridges and in front of the sky, which is what
          "resting on the horizon" has to mean. `--moon-bite` in Hero.css says
          how much of the disc the ridge takes and it is 0.17 this pass, against
          0.08 before it — the site owner asked for "the mountains covering
          15-20% of the bottom of the moon". Hero.css's --moon-bite block
          carries what that is worth on the RENDERED frame in both themes,
          which is the only currency this number has ever been true in: the
          reading it replaced said 0.18 and measured four pixels.

          **A second frosted ball was reported this pass and it is NOT this
          one, and the difference is worth writing down because the obvious
          reading is wrong.** `r2-D-0700` shows a translucent crest across the
          disc, and it is not this section's ridge: at scroll 700 the disc
          spans y 22-238 at 1440x900 and this range's highest ink is at y 743
          before it has lifted at all, so the two are most of a screen apart,
          and hiding `#origin` alone leaves a clean opaque moon. What crosses the disc there is ORIGIN,
          arriving — its snow drift escaping its own clip box while the section
          is still ramping up from transparent. Nothing in this file can
          occlude it (stage z 0, #origin z 4, and that order is what lets the
          lamppost stand in front of these mountains), so the answer was to get
          the moon out of its way instead: MOON_LIFT above carries the
          arithmetic that shows the two never meet at 0.90.

          It is the page's connecting thread — it leaves here and turns up
          again behind the cross in Faith — so its exit is the one piece of
          motion in this section that is still running when the reader arrives
          in the next one.

          The basin haze (`.hero__valley`) has two jobs left of the three it
          was written for. It is the aerial perspective between the ranges
          (guardrail: a distant plane is separated from a near one by HAZE, not
          by size), and it is the ground the main ridge can lift 0.22vh off
          without ever showing bare sky under its foot. The third — "a third
          terrain velocity so the two ranges have something to slide against
          besides each other" — is what it was standing in for, and the mid
          range has it now, with a silhouette attached.

          The tall pine is the near foreground and it sits AFTER the atmosphere
          on purpose: a near silhouette should be in front of the haze, not
          behind it. It is cropped by the frame at the RIGHT edge and, at rest,
          by the bottom — the base clears the floor as the reader scrolls,
          which is the whole of the owner's note about where the tree is
          planted (PINE_LIFT). It is alone, with no other pine family anywhere
          near it: the branch above it is a bough at the camera, not a second
          tree in the same middle distance.

          Nothing here recolours a pixel: -dark and -light are separate
          artwork, and the opacity is an --art-* token per theme. */}
      <Stage className="hero__stage">
        <div className="hero__sky" />

        {/* ── the moon's light on the air, and it is BEHIND the disc ────────
            Two nested ellipses of --hero-bloom, centred on the disc and biased
            upward. They replaced three tilted rectangles this pass; Hero.css
            has the whole argument, and the short version is that a wedge is a
            shape with an axis and an end, so however softly its ends are faded
            it reads as the moon having a tail — which is what `r2-D-0000` and
            `r2-L-0000` both show.

            Behind the moon, and that is load-bearing rather than arbitrary. A
            glow drawn OVER the disc eats the disc's own rim from the outside
            in, which is exactly what the light theme's "bright patch with a
            moon somewhere inside" was. Behind it, the same light spreads
            around a disc that keeps its edge. The one glow that is still in
            front — `.hero__bloom`, further down, which has to be in front
            because its job is to haze the ridge — is masked transparent
            where the disc is, for the same reason. */}
        <div ref={shafts} className="hero__shafts">
          <div className="hero__shaft" />
          <div className="hero__shaft-core" />
        </div>

        <div ref={moon} className="hero__moon-drift">
          <Moon className="hero__moon" />
        </div>

        {/* One torn wisp, in front of the disc and travelling at its own rate
            rather than at a multiple of the moon's — CLOUD_LIFT above carries
            the argument, and Hero.css carries the geometry that starts it high
            on the disc so it has the whole face to cross. */}
        <div ref={cloud} className="hero__cloud-drift">
          <StillArt art="props/moon-cloud" className="hero__cloud" />
        </div>

        {/* The haze is FIRST so the silhouette paints over it, and it is
            inside the wrapper so it rides the same `translate` and cannot
            drift away from the range it belongs to. --art-far now lives on
            the wrapper rather than on the <img>: two 0.5 layers are not one
            0.5 layer, and one group is what makes the step at the cut edge
            exactly zero rather than nearly zero. Hero.css has the rest. */}
        <div ref={rear} className="hero__rear-drift">
          <div className="hero__rear-haze" />
          <StillArt art="landscapes/mountain-ridge-rear" className="hero__rear" />
        </div>

        {/* The third range, and it carries NO haze — which is the one thing
            worth saying here, because the two ranges above it each carry one.
            This artwork's ink is drawn far higher inside its box than theirs
            is (head 0.268 against 0.162 and 0.109), so at every viewport this
            is drawn at its ragged bottom edge sits below the frame's floor and
            below the basin plane in front of it. A haze whose whole job is to
            hide a cut nobody can reach is a layer paid for and never seen.
            Hero.css has the arithmetic and the worst case. */}
        <div ref={mid} className="hero__mid-drift">
          <StillArt art="landscapes/mountain-ridge-mid" className="hero__mid" />
        </div>

        {/* The basin. One gradient in the near range's own foot ink, anchored
            to the frame's floor and running a long way below it, so nothing it
            does can be a horizontal edge: its top stop is transparent and its
            bottom is off the frame. Hero.css has the geometry and the reason
            it sits between the two ranges rather than behind both. */}
        <div ref={valley} className="hero__valley" />

        {/* Weather, crossing the basin. It was one CSS ellipse of the near
            range's own haze ink; it is `landscapes/valley-fog` now — a painted
            bank with a shape, which is what the ellipse was standing in for and
            could not be. It is HERE, between the basin plane and the near
            silhouette, because that is where it is in depth: it thickens the
            ranges behind it and is occluded by the ridge in front of it, which
            is what fog in a valley does.

            TWO elements where there used to be one, and that is the whole
            reason this is a wrapper: the scroll rate is written to
            `translate` from the loop above and the 74s sideways drift is a
            compositor `transform`, and one element gets one writer of each.
            The wrapper takes the translate; the art takes the transform. */}
        <div ref={weather} className="hero__weather">
          <StillArt art="landscapes/valley-fog" className="hero__weather-art" />
        </div>

        <div ref={ridge} className="hero__ridge-drift">
          <div className="hero__ridge-haze" />
          <StillArt art="landscapes/mountain-ridge" className="hero__ridge" />
        </div>

        <Starfield />

        <div ref={bloom} className="hero__bloom" />

        <div ref={pine} className="hero__pine-drift">
          <StillArt art="props/tall-pine" className="hero__pine" />
        </div>

        {/* The nearest thing in the frame: a bough entering from the TOP-LEFT,
            cropped by two edges, moving DOWN while everything else moves up.
            It is the only layer in this section allowed over the nav — the nav
            carries its own veil — and it is held clear of the copy column by
            measurement rather than by hope; Hero.css has that table. */}
        <div ref={branch} className="hero__branch-drift">
          <StillArt art="props/near-branch" className="hero__branch" />
        </div>

        <div className="hero__grain" />
        <div className="hero__vignette" />
      </Stage>

      {/* ── the 130svh whose floor is the seam ──────────────────────────────
          Nothing is drawn on this box. It exists so the frame below has a
          containing block that ends where Origin begins, and so the one rect
          the effect above reads answers both questions at once. */}
      <div ref={above} className="hero__above">
        {/* ── the part that dissolves ──────────────────────────────────────
            Pinned, so it does not slide anywhere — the site owner's whole
            note about the reference was that the hero "looks like it's staying
            the same position but fading away from the bottom", and a layer
            that slides is doing the opposite of that. The `useHeroParallax`
            that used to move this column is gone for exactly that reason.

            The fade runs bottom-up because the fade RATES differ per element,
            not because anything is masked: the strip goes first, then the
            CTAs, then the tagline, then the wordmark with the column itself.
            One custom property drives all four (see Hero.css), so this is one
            style write a frame and no second subscriber. */}
        <div ref={frame} className="hero__frame">
          {/* The model loads in the background, with no fallback UI on mobile
              or slow networks */}
          <Suspense fallback={null}>
            <PointCloud />
          </Suspense>

          <div className="hero__content">
            <div className="hero__inner">
              <div className="hero__eyebrow-row">
                <span className="hero__eyebrow-rule" />
                <span className="hero__eyebrow">The Disciples of God</span>
              </div>

              {/* the cross glyph is the "T", so the heading's only text is "DG".
                  Name it explicitly or the page's h1 reads as "DG" */}
              <h1 className="hero__wordmark" aria-label="TDG">
                <span className="hero__cross">
                  <CrossGlyph variant="hero" />
                </span>
                <span className="hero__dg">DG</span>
              </h1>

              <Tagline />

              <div className="hero__ctas">
                <a href="#apps" className="hero__cta">
                  Explore our work{' '}
                  <span className="hero__cta-arrow" aria-hidden="true">
                    →
                  </span>
                </a>
                <a href="#origin" className="hero__cta hero__cta--ghost">
                  Our origin
                </a>
              </div>
            </div>
          </div>

          <div className="hero__strip">
            <div className="hero__strip-inner">
              <div className="hero__meta">
                {/* NOT "Est. 2016", and the correction came from the owner.
                    2016 is the year the three letters became a Black Ops II
                    clan tag — CHAPTERS[1] in content.ts says so — and before
                    that they were a Minecraft server two kids ran. The work
                    this page is about starts at chapter 05, in 2024. A founding
                    year in the strip claimed nine years of building that did
                    not happen, and it was the first thing under the wordmark.
                    The slot is the "who" of who / what / why, so it says who. */}
                <span>Two brothers</span>
                <span className="hero__meta-div" />
                <span>Apps · Tools · Games</span>
                <span className="hero__meta-div" />
                <span>Jesus Is King</span>
              </div>
              <div className="hero__meta">
                <span>Scroll</span>
                <span className="hero__scroll-arrow">↓</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
