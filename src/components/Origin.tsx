import { useEffect, useRef, useState } from 'react'
import { clamp01, onFrame } from '../lib/motion'
import { mergeRefs } from '../lib/mergeRefs'
import { useParallax } from '../hooks/useParallax'
import { useReveal } from '../hooks/useReveal'
import { useTilt } from '../hooks/useTilt'
import { useHeroTakeover } from './Hero'
import { OriginField } from './origin/OriginField'
import { Seam } from './scene/Seam'
import { ThemedArt } from './scene/ThemedArt'
import { ABOUT_HASH, rememberOrigin } from '../lib/route'
import { CHAPTERS, type Chapter } from '../data/content'
import './Origin.css'

/**
 * One chapter of the timeline, as a disclosure.
 *
 * The chapter's prose is shut by default and opens on click. Seven open
 * paragraphs made this section about a third of the home page on its own, and
 * a reader who wanted chapter five had to scroll past four essays to reach it.
 *
 * **A shut row still says what it is.** That is this site's stated position
 * everywhere it folds something — see `lib/sections.tsx` and `Folded.tsx`: a
 * section that says nothing while shut is a bug. Here the tag, the phase, the
 * numeral and the title are all still on the row, so the seven of them read as
 * an index of the story rather than as seven mystery headings.
 *
 * **Opening one does not shut the others.** These are chapters of one story
 * and comparing two of them side by side is a thing somebody will want; an
 * accordion that closes what you were reading to show you what you just asked
 * for would take that away for no gain.
 *
 * The trigger is a real `<button>`. It used to be the `<article>` itself with
 * `tabIndex={0}` and an `aria-label`, which is an element that looks focusable,
 * takes a tab stop, and does nothing at all when you press Enter or Space on
 * it. A button gets both keys for free and can say `aria-expanded`.
 *
 * **The button's HIT AREA is the whole row; its box is not.** The row carries
 * the padding — 28px above, 30px below, 26px right and a left gutter the spine
 * and the dot live in — and the button sits inside all of it, so for a while a
 * click anywhere but the words landed on the `<article>` and did nothing, on a
 * row that lights up on hover across its whole width. Measured at 1440px with
 * `elementFromPoint`: every probe in the two padding bands, the four corners
 * and the gutter answered `article.origin__row`.
 *
 * Moving the row's padding onto the button is the obvious fix and it is the
 * wrong one: the button's bottom padding then falls between the title and the
 * prose whenever the row is open, and the 21.75px gap measured there becomes
 * 51.75px. So no box moves. `.origin__toggle::after` is stretched out into the
 * row's padding instead — the same thing `.card__cover` does on an Apps card —
 * and the open row's spacing is identical to what it was.
 *
 * **The opened prose is not part of the control.** The overlay stops at the
 * heading's bottom edge once the row is open, because somebody dragging to
 * select a sentence must not lose it to a close. It is also what `Folded.tsx`
 * does — its head toggles, the region under it never does — so the site's two
 * disclosures answer a click in the same place.
 */
function OriginRow({ chapter, index }: { chapter: Chapter; index: number }) {
  const reveal = useReveal<HTMLElement>('pop', index)
  const tilt = useTilt<HTMLElement>(true)
  const [open, setOpen] = useState(false)
  // The numerals are unique across CHAPTERS and there is one Origin section on
  // the page, so this is stable across renders without a generated id.
  const panelId = `origin-chapter-${chapter.numeral}`

  return (
    <article
      ref={mergeRefs(reveal, tilt)}
      className="origin__row"
      data-turn={chapter.turn || undefined}
      data-open={open || undefined}
    >
      <span className="origin__sweep" aria-hidden="true" />
      {/* The turn's halo. Painted behind the dot as two compositable layers
          rather than an animated box-shadow, which costs ~45ms of main thread
          per second for this one 11px dot. */}
      {chapter.turn ? <span className="origin__pulse" aria-hidden="true" /> : null}
      <span className="origin__dot" aria-hidden="true" />

      {/* The button is inside the heading rather than around it, so the chapter
          still has a heading in the document outline while it is shut. */}
      <h3 className="origin__row-heading">
        <button
          type="button"
          className="origin__toggle"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="origin__meta">
            <span className="origin__chapter">{chapter.chapter}</span>
            <span className="origin__phase">{chapter.phase}</span>
          </span>
          <span className="origin__body">
            {/* The tag beside it already says "CH. 01", so to a screen reader
                this is the same number a second time. It is here as type. */}
            <span className="origin__numeral" aria-hidden="true">
              {chapter.numeral}
            </span>
            <span className="origin__title">{chapter.title}</span>
          </span>
        </button>
      </h3>

      {/* A 0fr to 1fr grid row rather than a measured max-height, the same way
          `Folded.tsx` opens: what is inside is prose whose height depends on
          the width it is read at, and `height: auto` does not transition at
          all. The paragraph carries its own fade and slide so the words arrive
          after the box has started opening rather than being stretched open
          with it. */}
      <div className="origin__panel" id={panelId} inert={!open}>
        <div className="origin__panel-inner">
          <p className="origin__copy">{chapter.copy}</p>
        </div>
      </div>
    </article>
  )
}

export function Origin() {
  const section = useRef<HTMLElement | null>(null)
  const rail = useRef<HTMLDivElement | null>(null)
  const blob = useParallax<HTMLDivElement>(0.18)
  const seam = useParallax<HTMLDivElement>(0.04)
  const intro = useReveal<HTMLDivElement>('wipe', 0)
  const more = useReveal<HTMLDivElement>('wipe', 0)

  useHeroTakeover(section)

  // A second spine grows over the static one, mapped across the middle
  // two-thirds of the section, so the path visibly fills as you read.
  useEffect(() => {
    const fill = rail.current
    const el = section.current
    if (!fill || !el) return
    let painted = ''
    return onFrame(({ vh }) => {
      const r = el.getBoundingClientRect()
      const p = clamp01((vh * 0.86 - r.top) / (r.height * 0.66))
      const next = `${(p * 100).toFixed(1)}%`
      if (next === painted) return
      painted = next
      return () => {
        fill.style.height = next
      }
    })
  }, [])

  return (
    <section id="origin" ref={section} className="section section--blend origin">
      <OriginField />
      <div className="texture origin__grid" aria-hidden="true" />
      <div ref={blob} className="blob origin__blob" aria-hidden="true" />

      {/* ── the path ────────────────────────────────────────────────────────
          This section is the second beat of one walk: the hero is a valley
          under a lamppost, and this is the path leading away from it. One
          structural anchor — the stepping stones, receding up and to the
          right, which is the shape of a timeline you read downward — with a
          fog veil behind it and nothing else. The art kit's guardrail 8 is
          binding here: a section that becomes an illustration has stopped
          being a section.

          Both sit in the empty column to the RIGHT of the reading column and
          only above 1120px, where that column is genuinely empty. Their
          parallax is vertical only, so no drift can ever carry them across
          the copy. Opacity comes from the --art-* tokens, never a number, and
          neither is recoloured: the -dark and -light files are separate
          artwork. See scene/README.md. */}
      <ThemedArt art="atmosphere/fog-veil" className="origin__fog" factor={0.025} />
      <ThemedArt art="transitions/stepping-stones" className="origin__stones" factor={0.05} />

      {/* The boundary the hero's takeover slides into. A terrace rather than a
          ridge, because what arrives here is a path. The drift is a wrapper
          rather than the seam itself: `Seam` renders an <svg> and `useParallax`
          needs an element of its own to own `translate` on. */}
      <div ref={seam} className="origin__seam-drift" aria-hidden="true">
        <Seam shape="steps" edge="top" className="origin__seam" />
      </div>

      <div className="shell origin__shell">
        <div ref={intro} className="origin__intro">
          <div className="kicker">
            <span className="kicker__num">01</span>
            <span className="kicker__rule" />
            <span className="kicker__label">Origin</span>
          </div>
          <h2 className="h2 h2--serif origin__heading">It started on a Minecraft server.</h2>
          <p className="origin__lede">
            TDG was the name of a Minecraft server the two of us built and ran, years before it
            meant anything else. We reached back for it in 2016 when a Black Ops II clan needed a
            tag, and the three letters stayed long after the lobbies emptied. In 2024 they were
            given a new meaning, and we are still growing into it.
          </p>
        </div>

        <div className="origin__timeline">
          <div className="origin__spine" aria-hidden="true" />
          <div ref={rail} className="origin__spine-fill" aria-hidden="true" />
          <div className="origin__rows">
            {CHAPTERS.map((chapter, i) => (
              <OriginRow key={chapter.numeral} chapter={chapter} index={i} />
            ))}
          </div>
        </div>

        {/* The front page is deliberately the short version now, so the end of
            the timeline points at the long one. `rememberOrigin` is what brings
            a reader back to this section rather than to the top of the page. */}
        <div ref={more} className="origin__more-wrap">
          <a className="origin__more" href={ABOUT_HASH} onClick={() => rememberOrigin('Origin')}>
            The longer version, and who is behind it
            <span className="origin__more-arrow" aria-hidden="true">
              →
            </span>
          </a>
        </div>
      </div>
    </section>
  )
}
