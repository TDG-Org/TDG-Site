import { mergeRefs } from '../lib/mergeRefs'
import { useParallax } from '../hooks/useParallax'
import { useReveal } from '../hooks/useReveal'
import { useTilt } from '../hooks/useTilt'
import { ImageSlot } from './ImageSlot'
import { AppIcon } from './AppIcon'
import { APPS, GITHUB_ORG, type AppCard } from '../data/content'
import { appHash, rememberOrigin } from '../lib/route'
import './Apps.css'

/*
 * ── this section's landscape is GONE, and CONTRACT W is why ────────────────
 * Four things used to be rendered here and none of them is any more: a lit
 * floor with a park bench and a stand of scrub on it, and a treeline band that
 * crossed UP over the Origin boundary carrying a fir line, a broadleaf, a haze
 * band and a near grove. With them went `useSway`, its two amplitudes, the
 * `Seam` and `ThemedArt` imports and three `useParallax` subscribers.
 *
 * They were built for a boundary that no longer exists. The cabin's canvas
 * used to stop, opaque, on `#origin`'s bottom edge, and the whole of that work
 * was about making the stop unfindable. Under CONTRACT W the camera goes on
 * through the cabin door and the reader is INSIDE by the time this section
 * arrives — so a treeline growing up through the floor of a room, and a park
 * bench standing on the floorboards, would be a landscape join in the middle
 * of an interior shot. That is worse than no join, not better than one.
 *
 * The same applies to this section's own floor at the `#tools` boundary, which
 * is where the camera tilts up off the table. Both joins are now one camera
 * move, and the only art at either of them is the shot itself.
 *
 * `#tools`' pine pair, which used to rise out of that section into this floor,
 * went in the same edit. Tools.css says so from the other side.
 */

function AppTile({ app, index }: { app: AppCard; index: number }) {
  const reveal = useReveal<HTMLElement>('card3d', index % 4)
  const tilt = useTilt<HTMLElement>()

  return (
    <article ref={mergeRefs(reveal, tilt)} className="card apps__card">
      <span className="card__spot" aria-hidden="true" />
      <span className="card__edge" aria-hidden="true" />

      {/* The whole card opens the app's own page. It is first in the card so
          it is also first in the tab order, ahead of a download link that a
          card may also carry. `rememberOrigin` is what lets Back return to
          this exact spot in the list rather than to the top of the page. */}
      <a className="card__cover" href={appHash(app.page)} onClick={() => rememberOrigin('Apps')}>
        <span className="sr-only">Open the {app.title} page</span>
      </a>

      <div className="apps__shot">
        <ImageSlot
          id={app.id}
          placeholder={app.slotPlaceholder}
          /* The cover is the app's own key art where it has one. The `shot`
             stays on the card's data regardless — the app's own PAGE reads it
             through `shotForPage()`, and a screenshot belongs there. */
          art={app.art}
          shot={app.shot}
          /* Breakpoints track the real column count of the auto-fit grid
             (1 col <613px, 2 to 929, 3 to 1227, 4 above). The shot now
             bleeds to the card's own edges, so no padding to subtract.
             Over-declaring made retina readers pull the 1120w candidate
             into a too-small slot. */
          sizes="(max-width: 612px) calc(100vw - 2 * clamp(18px, 4vw, 40px)), (max-width: 929px) calc((100vw - 2 * clamp(18px, 4vw, 40px) - 20px) / 2), (max-width: 1227px) calc((100vw - 2 * clamp(18px, 4vw, 40px) - 40px) / 3), 280px"
        />
      </div>
      <div className="apps__body">
        <div className="badge apps__index">{app.index}</div>
        <div className="chips apps__chips">
          {app.chips.map((chip) => (
            <span key={chip.label} className={chip.hot ? 'chip chip--hot' : 'chip'}>
              {chip.label}
            </span>
          ))}
        </div>
        <h3 className="apps__title">
          <AppIcon icon={app.icon} shape={app.iconShape} />
          {app.title}
          <span className="apps__title-arrow" aria-hidden="true">
            →
          </span>
        </h3>
        <p className="apps__copy">{app.copy}</p>
        {app.download ? (
          <a className="apps__download" href={app.download.href} target="_blank" rel="noopener">
            {app.download.label}
            <span className="apps__download-arrow" aria-hidden="true">
              →
            </span>
          </a>
        ) : (
          <div className="apps__status">{app.status}</div>
        )}
      </div>
    </article>
  )
}

export function Apps() {
  /* ── one layer, and it is light rather than landscape ─────────────────────
     `useParallax` writes `centreOffset * -factor`, so a POSITIVE factor climbs
     more slowly than the page and reads as distance. +0.010 is the slowest
     thing this section has ever had and it is the only thing left on the
     ladder: the six layers below it were the treeline and the floor, and both
     of those were built for boundaries that are now the middle of one camera
     move. See the note at the top of this file.

     What the blob is doing here is not decoration. It is a soft warm-white
     disc up and to the LEFT — which is where the cabin's fire is once the
     camera has turned toward the table — so the one thing this section still
     paints over the shot is light on the air, drifting a tenth as fast as the
     page. Standard: one light source, with somewhere for the light to fall.

     `.apps__dots` takes no hook at all and never did. It is `.texture`, a
     lattice at the page's own scale rather than an object at a distance, and a
     texture that slid against the picture behind it would read as a scrim. */
  const blob = useParallax<HTMLDivElement>(0.01)
  const head = useReveal<HTMLDivElement>('wipe', 0)
  const more = useReveal<HTMLDivElement>('scale', 2)

  return (
    /* No `.section--flat`, and that is CONTRACT W rather than an omission.
       That class is `background-color: var(--tint-mid)` — an opaque band, edge
       to edge — and this section is painted OVER the walk's canvas, so the
       band would be a lid on the shot. The backdrop for all three sections of
       the walk is one gradient on `.walk`; Apps.css and Walk.css both carry
       the argument. */
    <section id="apps" className="section apps">
      {/* The section's decorative floor, in one box: `aria-hidden`,
          `pointer-events: none`, and clipped to the section's padding edge.
          It used to be the box that kept the reeds and the bench from hanging
          out of the section's clip MARGIN — that margin is gone with the
          treeline that needed it, so the section is back to `.section`'s own
          `overflow: hidden` and this box is the aria and pointer wrapper the
          two layers left inside it still want. `.origin__clip` is the same
          idea one section up. */}
      <div className="apps__clip" aria-hidden="true">
        <div className="texture apps__dots" />
        <div ref={blob} className="blob apps__blob" />
      </div>

      <div className="shell apps__shell">
        {/* ── the plate is OUTSIDE the reveal, and that is the whole reason
            this wrapper exists ────────────────────────────────────────────
            The head's scrim is a `::before`, and it used to be `.apps__head`'s
            own. `useReveal('wipe')` writes `clip-path: inset(N% 0 0 0)` to the
            element it reveals — and a clip-path clips the element's
            pseudo-elements too, to its BORDER BOX. So for the six-tenths of a
            second the wipe runs, a scrim built to have no edge on any side was
            drawn as a hard rectangle at exactly the head's own bounds, growing
            upward. Caught in a render at 1440x900: a 1180 x 122 box with four
            cut edges, arriving at the precise moment the reader scrolls the
            section into view.

            So the plate hangs on this box, which never reveals, and the words
            wipe on over it. Apps.css has the mask; Tools.tsx and Origin.tsx
            carry the same pair for the same reason. */}
        <div className="apps__head-plate">
          <div ref={head} className="apps__head">
            <div>
              <div className="kicker">
                <span className="kicker__num">02</span>
                <span className="kicker__rule" />
                <span className="kicker__label">Apps</span>
              </div>
              <h2 className="h2 apps__heading">Apps we're building.</h2>
              <p className="lede apps__lede">
                The bigger desktop and installable apps, the ones most of our hours go into.
              </p>
            </div>
            <div className="apps__nudge">↳ hover a card</div>
          </div>
        </div>

        <div className="apps__grid">
          {APPS.map((app, i) => (
            <AppTile key={app.id} app={app} index={i} />
          ))}

          <div ref={more} className="apps__more" data-more>
            <div className="apps__more-title">and more on the way</div>
            <p className="apps__more-copy">
              We're always building. Follow along to catch the next one.
            </p>
            <a className="apps__more-link" href={GITHUB_ORG} target="_blank" rel="noopener">
              Watch on GitHub →
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
