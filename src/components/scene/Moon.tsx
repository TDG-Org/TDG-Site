import { useId, type JSX } from 'react'

/**
 * The moon: a disc, a soft bloom around it, and three quiet patches of surface.
 *
 * ```tsx
 * <Stage className="hero__stage">
 *   <Moon className="hero__moon" />
 * </Stage>
 * ```
 *
 * ```css
 * .hero__moon {
 *   position: absolute;
 *   left: 12%;
 *   bottom: -6%;
 *   width: clamp(260px, 34vw, 520px);
 *   opacity: var(--art-far);
 * }
 * ```
 *
 * **The caller animates it.** There is no scroll behaviour in this file at all
 * and there should not be: the moon's whole job on this page is to be in a
 * different place in each section it appears in, and where it goes is a fact
 * about that section, not about the moon. Drive it from `useSectionProgress`
 * and `usePointer` in the section that draws it.
 *
 * ## Inline SVG, not an image
 *
 * A raster moon is a raster halo: scale it up for the "much bigger" the site
 * owner asked for and the bloom bands, and the whole point of the bloom is
 * that it has no edge. Vector also means one file rather than the two the
 * `-dark`/`-light` art kit needs, because everything here is painted from
 * tokens and the tokens already flip.
 *
 * ## The geometry, so a caller can size it
 *
 * The box is a 100x100 viewBox with `preserveAspectRatio` left at its default,
 * so a non-square box gets a centred circle rather than an ellipse. **The
 * visible disc is exactly half the box's width** -- radius 25 of 50 -- and the
 * remaining quarter on each side is bloom. So a moon meant to read as 200px
 * across wants a 400px box, and the bloom is allowed to hang off the section's
 * edge; that is what the stage's clip is for.
 *
 * An `<svg>` is an inline box, so it carries a descender gap under it if it is
 * ever laid out in flow. Position it absolutely, or set `display: block` in
 * your class -- `Seam.css` records the same lesson. This component deliberately
 * writes no inline `display`, because an inline style would beat the
 * `display: none` a caller needs at 640px to take a prop off the page.
 *
 * ## Every colour is a token, and it reads in both themes
 *
 * `--moon-halo` for the bloom, `--moon-disc` for the disc, `--moon-mare` for
 * the shading. No literal, no `filter`.
 *
 * **All three used to be borrowed and all three are now the moon's own**, and
 * that is the whole of the light theme's fix. The disc was painted from
 * `--cross-glow`, which is `rgba(20,20,26,0.45)` in light — near-black — so
 * the light theme's moon rendered as a grey blob; the maria were painted from
 * `--invert-fg`, which is near-WHITE in light, so a pale moon had pale maria
 * and read as a disc with holes punched in it. Both were the correct
 * conclusion from a wrong premise: the premise was that nothing can be
 * brighter than a near-white sky, which was true of the sky and is no longer.
 * `--hero-sky`'s light value is shaded now (see tokens.css), so the disc is
 * white in both themes and the moon is the same object either way.
 *
 * **In the light theme it stays a pale daytime moon rather than becoming a
 * sun**, and both halves of that were a decision:
 *
 * - The light theme on this site is the same scene in a different palette, not
 *   a different time of day. The art kit ships one set of mountains in two
 *   inks -- midnight blue and "paler mist and silver with a narrow graphite
 *   line" -- and nothing on the page changes what it is when the theme flips.
 *   A moon that turned into a sun would be the only object on the site that
 *   did, and it would do it behind the cross on the Faith ridge, where a sun
 *   is a different and much louder symbol than the one this page is telling.
 * - A sun also wants `--warm`, which in light is `#b8763a` -- a burnt orange
 *   that would instantly be the loudest thing on a page whose entire light
 *   palette is greys.
 *
 * **The paragraph that used to be here said a pale moon in light must be
 * DARKER than its sky, and it was right about the arithmetic and wrong about
 * which side to move.** Nothing can be brighter than a near-white sky, so the
 * moon was stepped down toward `--text` the way `--seam-fill` steps a
 * silhouette -- and the result was a grey disc that the site owner read, quite
 * correctly, as a hole in the page. A seam is a silhouette and wants to drop
 * below a pale sky; the moon is a light source and cannot, because a light
 * source darker than everything around it is not a light source.
 *
 * So the SKY moved instead. `--hero-sky` in light is a shaded dusk now rather
 * than a white one, the disc is `--moon-disc` white in both themes, and the
 * two are one decision recorded in one place -- tokens.css, at the sky, where
 * the note beside it carries the L* figures both halves were solved against.
 *
 * ## Why every paint goes through a gradient
 *
 * `base.css` transitions `stop { stop-color }` on the theme wave, and
 * `ThemeProvider`'s `THEMED` selector includes `svg`, so this element gets its
 * own `--wave-delay` and every stop inside inherits it. A flat
 * `fill: var(--token)` would not: `svg`, `circle` and `path` are not in
 * `base.css`'s `transition: var(--t-theme)` list, so a filled shape SNAPS to
 * the new theme while the page around it crosses. Painting through stops means
 * the moon rides the wave for free -- which is what `CrossGlyph` does, and why
 * it does it.
 *
 * The soft shapes want gradients anyway. A moon with a hard rim is a sticker.
 */
export function Moon({ className }: { className?: string }): JSX.Element {
  /*
   * SVG ids are document-global, and `url(#id)` resolves against the whole
   * document — so a second Moon on the same page would silently paint itself
   * with the FIRST one's gradients. `useId` per instance is the fix.
   *
   * The strip is not superstition: React's generated ids are wrapped in
   * punctuation, and while a fragment reference tolerates it, an id made only
   * of word characters is the one that can also be handed to a CSS selector or
   * a `getElementById` by whoever debugs this next.
   */
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const bloom = `moonBloom${uid}`
  const disc = `moonDisc${uid}`
  const mare = `moonMare${uid}`
  const limb = `moonLimb${uid}`

  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false" className={className}>
      <defs>
        {/* The halo. userSpaceOnUse so its falloff is stated in the same units
            as the disc's radius: full at the centre, still 92% at the disc's
            own edge (r 25 of 50), and gone by the box edge. --glow already
            carries this theme's own alpha — 0.2 dark, 0.16 light — so the
            bloom is quiet by construction and the caller raises the whole
            element's opacity rather than this. */}
        <radialGradient id={bloom} gradientUnits="userSpaceOnUse" cx="50" cy="50" r="50">
          <stop offset="0" style={{ stopColor: 'var(--moon-halo)' }} stopOpacity="1" />
          <stop offset="0.5" style={{ stopColor: 'var(--moon-halo)' }} stopOpacity="0.92" />
          <stop offset="0.68" style={{ stopColor: 'var(--moon-halo)' }} stopOpacity="0.3" />
          <stop offset="1" style={{ stopColor: 'var(--moon-halo)' }} stopOpacity="0" />
        </radialGradient>

        {/* The disc, lit slightly from the upper left. The falloff is small on
            purpose — 1.00 to 0.78 — because a moon is a flat-looking thing at
            this size and a strong shade reads as a ball. */}
        <radialGradient id={disc} cx="0.5" cy="0.5" r="0.72" fx="0.36" fy="0.3">
          <stop offset="0" style={{ stopColor: 'var(--moon-disc)' }} stopOpacity="1" />
          <stop offset="0.55" style={{ stopColor: 'var(--moon-disc)' }} stopOpacity="0.96" />
          <stop offset="1" style={{ stopColor: 'var(--moon-disc)' }} stopOpacity="0.84" />
        </radialGradient>

        {/* One gradient, three maria. Object bounding box units, so each circle
            that references it gets a blob scaled to its own size — three soft
            patches out of one definition instead of three.

            --invert-fg is the theme's own ground: near-black in dark, near-white
            in light. Laid over the disc at a fifth of an alpha it darkens the
            night moon and lightens the daytime one, which is what surface
            shading has to do to survive a theme flip. */}
        <radialGradient id={mare}>
          <stop offset="0" style={{ stopColor: 'var(--moon-mare)' }} stopOpacity="1" />
          <stop offset="0.62" style={{ stopColor: 'var(--moon-mare)' }} stopOpacity="0.6" />
          <stop offset="1" style={{ stopColor: 'var(--moon-mare)' }} stopOpacity="0" />
        </radialGradient>

        {/* The limb: a shallow pool of the same ground colour gathered at the
            lower right, opposite the disc's light. It is what keeps the moon
            from reading as a paper circle. */}
        <radialGradient id={limb} cx="0.72" cy="0.78" r="0.85">
          <stop offset="0" style={{ stopColor: 'var(--moon-mare)' }} stopOpacity="1" />
          <stop offset="0.55" style={{ stopColor: 'var(--moon-mare)' }} stopOpacity="0.4" />
          <stop offset="1" style={{ stopColor: 'var(--moon-mare)' }} stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle cx="50" cy="50" r="50" fill={`url(#${bloom})`} />
      <circle cx="50" cy="50" r="25" fill={`url(#${disc})`} />
      {/* Placed so every blob's own radius clears the disc's edge — the
          gradients have no hard boundary, so one that reached the rim would
          smudge across it instead of stopping. */}
      <circle cx="43" cy="42" r="8" fill={`url(#${mare})`} />
      <circle cx="59" cy="53" r="5.5" fill={`url(#${mare})`} />
      <circle cx="49" cy="61" r="4.5" fill={`url(#${mare})`} />
      <circle cx="50" cy="50" r="25" fill={`url(#${limb})`} />
    </svg>
  )
}
