import { mergeRefs } from '../lib/mergeRefs'
import { useParallax } from '../hooks/useParallax'
import { useReveal } from '../hooks/useReveal'
import { useTilt } from '../hooks/useTilt'
import { MARANATHA, NEXT_UP } from '../data/content'
import { asset } from '../lib/asset'
import { appHash, rememberOrigin } from '../lib/route'
import { Seam } from './scene/Seam'
import { ThemedArt } from './scene/ThemedArt'
import './Building.css'

function NextUpPill({ label, index }: { label: string; index: number }) {
  const reveal = useReveal<HTMLDivElement>('pop', index)
  return (
    <div ref={reveal} className="building__pill">
      <span className="building__pill-dot" data-alt={index % 2 === 1 || undefined} />
      {label}
    </div>
  )
}

export function Building() {
  /* ── the depth ladder ─────────────────────────────────────────────────────
     `useParallax` writes `centreOffset * -factor`, so a positive factor climbs
     more slowly than the page — distance — and a negative one moves against
     it — nearness. The first pass had 0.012 / 0.02 / 0.03, three positives
     inside a fifth of a percent of each other, which is three layers agreeing
     with each other rather than three planes.

        +0.07  the blob   warm glow behind everything
        +0.018 the fog    the far bank, all but still
        +0.022 the seam   the boundary, still
        -0.06  the pines  crowns on the near side of the mist

     This is the page's flat contrast anchor and it stays the quietest of the
     four beats in this pass: the spread is 0.078, against #tools' 0.145, and
     nothing here follows the cursor. */
  const blob = useParallax<HTMLDivElement>(0.07)
  const seam = useParallax<HTMLDivElement>(0.022)
  const head = useReveal<HTMLDivElement>('wipe', 0)
  const reveal = useReveal<HTMLDivElement>('scale', 0)
  const tilt = useTilt<HTMLDivElement>()

  return (
    <section id="building" className="section section--flat building">
      {/* ── the walk, beat five: the far bank ───────────────────────────────
          You have just crossed the water in #tools; this is the ground on the
          other side. Two pieces of art and a seam, which is the kit's whole
          budget: a bank of mist for the far plane and the faceted pines for
          the near one, and no bench.

          The faceted pair rather than #apps' `tall-pine`, and the two are not
          interchangeable. `tall-pine` is one oversized tree drawn to run out of
          its own frame, which is what standing under a treeline looks like;
          the pair is a whole small stand, which is what trees look like across
          water. The kit says to use the tall one alone, so the two live two
          sections apart and each does the thing it was drawn for.

          The pines are cropped by this section's own bottom edge, so what you
          see is crowns standing BEYOND the ground rather than a tree in the
          foreground — but they are the near plane here, in front of the mist,
          which is why they carry the one negative factor in the section.

          None of this is kept off the pills by being drawn before `.shell`.
          `.card` and `.building__pill` both paint `var(--surface)`, which is a
          4.5% white wash in the dark theme — 95% transparent — so a layer
          behind them is read straight through them. What keeps it off the copy
          is that every box lives inside this section's own floor; Building.css
          does that arithmetic. */}
      <div ref={seam} className="building__seam-drift" aria-hidden="true">
        <Seam shape="dune" edge="top" className="building__seam" />
      </div>
      <ThemedArt art="atmosphere/fog-veil" className="building__fog" factor={0.018} />
      <ThemedArt art="props/pine-faceted-pair" className="building__pines" factor={-0.06} />

      <div className="texture building__scan" aria-hidden="true" />
      <div ref={blob} className="blob building__blob" aria-hidden="true" />

      <div className="shell building__shell">
        <div ref={head} className="building__head">
          <div>
            <div className="kicker">
              <span className="kicker__num">04</span>
              <span className="kicker__rule" />
              <span className="kicker__label">Building now</span>
            </div>
            <h2 className="h2 building__heading">Works in progress.</h2>
            <p className="lede building__lede">
              What's on our screens right now. One is nearly done, the rest are just getting going.
            </p>
          </div>
          <span className="building__count">{MARANATHA.count}</span>
        </div>

        <div ref={mergeRefs(reveal, tilt)} className="card building__feature">
          <span className="card__spot" aria-hidden="true" />
          <span className="card__edge" aria-hidden="true" />

          {/* The game gets its own page too, opened the same way every app
              card is opened. */}
          <a className="card__cover" href={appHash(MARANATHA.page)} onClick={() => rememberOrigin('Building')}>
            <span className="sr-only">Open the MARANATHA page</span>
          </a>

          <div className="building__art">
            <picture>
              <source
                type="image/avif"
                sizes="(max-width: 760px) 100vw, min(50vw, 590px)"
                srcSet={MARANATHA.shot.widths
                  .map((w) => `${asset(`shots/${MARANATHA.shot.slug}-${w}.avif`)} ${w}w`)
                  .join(', ')}
              />
              <source
                type="image/webp"
                sizes="(max-width: 760px) 100vw, min(50vw, 590px)"
                srcSet={MARANATHA.shot.widths
                  .map((w) => `${asset(`shots/${MARANATHA.shot.slug}-${w}.webp`)} ${w}w`)
                  .join(', ')}
              />
              <img
                className="building__art-img"
                src={asset(`shots/${MARANATHA.shot.slug}-${MARANATHA.shot.widths[0]}.webp`)}
                alt={MARANATHA.shot.alt}
                width={720}
                height={405}
                loading="lazy"
                decoding="async"
              />
            </picture>
          </div>

          <div className="building__body">
            <div className="building__tags">
              <span className="building__tag">GAME</span>
              {/* MARANATHA.tag, not a literal. This tag and the `status` on
                  the button eleven lines down are two claims about one card,
                  and while the tag was typed here they had already drifted:
                  IN PLAYTEST over a status of `Coming soon`. Rule 1 — a word a
                  visitor reads lives in src/data/. */}
              <span className="building__tag building__tag--live">
                <span aria-hidden="true">● </span>
                {MARANATHA.tag}
              </span>
            </div>
            <h3 className="building__title">
              {MARANATHA.heading}
              <span className="building__title-arrow" aria-hidden="true">
                →
              </span>
            </h3>
            <p className="building__copy">{MARANATHA.copy}</p>
            <div className="building__actions">
              <span className="building__play building__play--soon">{MARANATHA.status}</span>
              <span className="building__note">{MARANATHA.note}</span>
            </div>
          </div>
        </div>

        <div className="building__pills">
          {NEXT_UP.map((label, i) => (
            <NextUpPill key={label} label={label} index={i} />
          ))}
        </div>
      </div>
    </section>
  )
}
