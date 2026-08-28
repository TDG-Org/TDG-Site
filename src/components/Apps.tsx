import { useMemo } from 'react'
import { mergeRefs } from '../lib/mergeRefs'
import { useParallax } from '../hooks/useParallax'
import { useReveal } from '../hooks/useReveal'
import { useTilt } from '../hooks/useTilt'
import { ImageSlot } from './ImageSlot'
import { GITHUB_ORG, type AppCard } from '../data/content'
import { visibleApps } from '../content/resolve'
import { useSiteContent } from '../content/store'
import { DOWN_WORDING, useDiscoveredApps, useLiveAccess } from '../live/useLive'
import type { DiscoveredApp } from '../live/types'
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

  /* Is the app actually deployed? `src/live/` asks GitHub at runtime, and a
     yes turns the status caption into the same link a hand-written `download`
     renders — Bible Educator's card is the one this was built for: private
     repo, public Pages deploy, nothing in `content.ts` to say so. A card that
     already carries a `download` passes `undefined`, which asks nothing: a
     human decision outranks discovery. `down` is the third answer — a site
     that WAS live and has stopped answering — and it replaces the status
     words rather than the button: a link to a dead site is not access, and
     `Coming soon` about an app people have used is not honest either. See
     src/live/README.md. */
  const live = useLiveAccess(app.download ? undefined : app.repo, app.title)
  const access = app.download ?? (live?.kind === 'live' ? live : null)

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
        {/* No icon beside the name. The cover above already draws it — top
            left of the key art, at the size it was designed at — and a second
            copy 30px tall next to the title was the same mark twice on one
            card, competing with the thing it is meant to introduce. The app's
            own page still carries one beside its `h1`, where there is no cover
            above it to say the same thing. */}
        <h3 className="apps__title">
          {app.title}
          <span className="apps__title-arrow" aria-hidden="true">
            →
          </span>
        </h3>
        <p className="apps__copy">{app.copy}</p>
        {access ? (
          <a className="apps__download" href={access.href} target="_blank" rel="noopener">
            {access.label}
            <span className="apps__download-arrow" aria-hidden="true">
              →
            </span>
          </a>
        ) : (
          <div className="apps__status">{live?.kind === 'down' ? DOWN_WORDING : app.status}</div>
        )}
      </div>
    </article>
  )
}

/*
 * There used to be an `OrgMark` here: a discovered card has no icon to draw,
 * and its title row was the only one in the grid with nothing beside it, which
 * read as a card still loading — so it got the app's initial in the same box a
 * tile icon gets.
 *
 * That reason inverted the day the icons came off these title rows. Nothing in
 * this grid carries a mark beside its name any more, so the letter tile stopped
 * being the row that matched its neighbours and became the only row that did
 * not. It is deleted rather than hidden, along with `.apps__orgmark`.
 */

/**
 * A card for an app the catalogue has not been taught yet: a public TDG-Org
 * repository carrying the `tdg-app` topic that no hand-written card claims.
 * Rule 17's second half, applied to the org itself — an unknown entry gets a
 * face rather than being silently absent, and everything on it is derived
 * from the repository (title from its name, copy from its description, chips
 * from its state), so the words a component draws are still never typed into
 * one. The whole card opens the live site when there is one, else the repo:
 * there is no `#/app/` page to open, because nobody has written one.
 */
function OrgTile({ app, position }: { app: DiscoveredApp; position: number }) {
  const reveal = useReveal<HTMLElement>('card3d', position % 4)
  const tilt = useTilt<HTMLElement>()

  /* A discovered card's static access comes from the API's answer about the
     repo. When that answer was NO, the probe still gets a word — its memory
     is what tells a tagged repo whose site was taken down (`down`) from one
     that has not shipped yet, and it also catches a deploy the API's cached
     list has not noticed. Same rule as AppTile: an existing access asks
     nothing. */
  const live = useLiveAccess(app.access ? undefined : app.name, app.title)
  const access = app.access ?? (live?.kind === 'live' ? live : null)

  return (
    <article ref={mergeRefs(reveal, tilt)} className="card apps__card">
      <span className="card__spot" aria-hidden="true" />
      <span className="card__edge" aria-hidden="true" />

      <a className="card__cover" href={app.href} target="_blank" rel="noopener">
        <span className="sr-only">
          Open {app.title}
          {app.access ? '' : ' on GitHub'}
        </span>
      </a>

      <div className="apps__shot">
        {/* No art and no shot, deliberately: the quiet empty frame is the
            slot's own face for "nothing shipped yet", and in dev it still
            accepts a dropped preview like any other unfilled slot. */}
        <ImageSlot id={`org-${app.name}`} placeholder={`Drop a ${app.title} screenshot`} />
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
          {app.title}
          <span className="apps__title-arrow" aria-hidden="true">
            →
          </span>
        </h3>
        <p className="apps__copy">{app.copy}</p>
        {access ? (
          <a className="apps__download" href={access.href} target="_blank" rel="noopener">
            {access.label}
            <span className="apps__download-arrow" aria-hidden="true">
              →
            </span>
          </a>
        ) : (
          /* The same words its hand-written neighbours use for the same
             states — mechanism copy for any repo, not any one product's. */
          <div className="apps__status">{live?.kind === 'down' ? DOWN_WORDING : 'Coming soon'}</div>
        )}
      </div>
    </article>
  )
}

export function Apps() {
  /* The cards, in the order and with the words the Developer console's Content
     tab last published, over the built-in list in `src/data/content.ts`. Rule
     17: a surface that lists our products derives the list, and it derives it
     from BOTH sources so a card hidden here cannot still be on the Store or on
     the Tools shelf. See src/content/README.md. */
  const doc = useSiteContent()
  const apps = useMemo(() => visibleApps(doc), [doc])

  /* Cards the org has that the catalogue does not — empty until GitHub
     answers, and empty is also the honest face for "could not ask". */
  const discovered = useDiscoveredApps()

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

     `.apps__dots` used to be drawn beside it and is deleted this pass. It was
     `.texture` — a repeating-radial lattice, rings 76px apart — and the
     argument for keeping it over the cabin was that a lattice at the page's
     own scale reads as the page's grain sitting on the glass. The render
     disproved it: at scroll 2400 it is faint concentric circles painted across
     the interior wall, because a section inside `.walk` paints ABOVE the stage
     and there is no wall in a photograph that has rings on it. Apps.css has
     the rest, including why it could not simply be moved behind the canvas. */
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
          one layer left inside it still wants. `.origin__clip` is the same
          idea one section up. */}
      <div className="apps__clip" aria-hidden="true">
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
            wipe on over it. `walk-plate` is the shared recipe — one plate for
            the five blocks of copy read over the walk, declared in Walk.css
            because that is the file that owns all three sections; Apps.css sets
            only how far this one reaches. Tools.tsx and Origin.tsx carry the
            same pair for the same reason. */}
        <div className="apps__head-plate walk-plate">
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
          {apps.map((app, i) => (
            <AppTile key={app.id} app={app} index={i} />
          ))}

          {discovered.map((repo, i) => (
            <OrgTile key={repo.name} app={repo} position={apps.length + i} />
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
