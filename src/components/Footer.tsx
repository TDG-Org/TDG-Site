import { CONTACT, GITHUB_ORG, VOLUME_CONTROLLER } from '../data/content'
import { CrossGlyph } from './CrossGlyph'
import { ABOUT_HASH, STORE_HASH } from '../lib/route'
import './Footer.css'


export function Footer() {
  return (
    <footer className="footer">
      <div className="footer__shell">
        <div className="footer__top">
          <div className="footer__brand">
            {/* ── the mark, and it is drawn rather than fetched ────────────
                The owner supplied a new TDG lockup — the cross standing in for
                the T, "DG" beside it in the serif face, a silver ramp falling
                top-left to bottom-right — and it is the same lockup the hero
                already draws at the top of this page. So it is BUILT here, out
                of the same two pieces, instead of shipped as a fifth raster.

                Four things that buys, and the last one is why the old files are
                deleted rather than kept beside it. It is one mark rather than
                two that can drift apart. It is sharp at any size instead of at
                the two the AVIF/WebP pair happened to be cut for. It costs no
                request at all where the old one cost one lazy image. And it
                reads correctly in BOTH themes from one declaration: the raster
                was a light-on-transparent PNG that the stylesheet flipped with
                `filter: invert(1)` for the light theme, which is rule 3's
                predicted failure in its purest form — an asset drawn for one
                theme and mechanically negated for the other, so the "silver"
                became a muddy inverse rather than the graphite the light
                palette actually wants. `--hero-dg` already states both.

                `aria-label` on the wrapper and `aria-hidden` inside it, because
                the visible glyphs are a cross and the letters D and G: read out
                literally a screen reader would announce "DG" and nothing about
                the T. The label says TDG once and the pieces say nothing. */}
            <div className="footer__wordmark" aria-label="TDG" role="img">
              <span className="footer__wordmark-cross" aria-hidden="true">
                <CrossGlyph variant="hero" />
              </span>
              <span className="footer__wordmark-dg" aria-hidden="true">
                DG
              </span>
            </div>
            <div className="footer__name">THE DISCIPLES OF GOD</div>
            <p className="footer__blurb">
              Brothers building software, games, and tools for the glory of Jesus.
            </p>
          </div>

          {/*
            Three columns rather than two, because the first one was holding two
            different kinds of destination and only admitting to one of them.

            A section anchor is a place on the home page; a route is a page of
            its own. Telling a reader which is which before they click is the
            same split the nav makes at the top of the page, so the two ends of
            the page do not describe the site differently.

            The heading is "Home" rather than "On this page" because this footer
            is drawn on EVERY route — the Store, About and each app page all
            carry it — and on four pages out of five "this page" would be a
            sentence about somewhere else. From the Store, `#origin` is a trip
            home followed by a scroll, which is exactly what "Home" promises.

            It was also short: Origin was missing entirely, and About and Store
            — two of the site's three real pages — could not be reached from the
            bottom of the page at all. People do look down here.
            `src/data/storeAnswers.ts` sends buyers to "the contact page linked
            in the footer" for a refund.
          */}
          <div className="footer__cols">
            <div>
              <div className="footer__col-title">Home</div>
              <div className="footer__links">
                <a href="#origin">Origin</a>
                <a href="#apps">Apps</a>
                <a href="#tools">Tools &amp; extensions</a>
                <a href="#building">Building now</a>
                <a href="#faith">Faith</a>
              </div>
            </div>
            <div>
              <div className="footer__col-title">Pages</div>
              <div className="footer__links">
                <a href={ABOUT_HASH}>About</a>
                <a href={STORE_HASH}>Store</a>
              </div>
            </div>
            <div>
              <div className="footer__col-title">Connect</div>
              <div className="footer__links">
                <a href={GITHUB_ORG} target="_blank" rel="noopener">
                  GitHub org ↗
                </a>
                <a href={VOLUME_CONTROLLER} target="_blank" rel="noopener">
                  Volume Controller ↗
                </a>
                <a href={CONTACT} target="_blank" rel="noopener">
                  Contact ↗
                </a>
              </div>
            </div>
          </div>
        </div>

        <div className="footer__bottom">
          {/*
            Derived, never typed. This was the literal `© 2026 TDG`: right on
            the day it was written and silently wrong from 1 January 2027, with
            no test, no build step and nothing else in the repo that would ever
            notice. It is the failure AGENTS.md §6 already describes for the
            version string, in its own words — the kind of copy that goes stale
            silently, and did.

            Read at render. The footer mounts on every hash route, so a tab left
            open across midnight on New Year's Eve corrects itself the next time
            somebody clicks anything; and a page nobody touches for a day is
            wrong about a year in its smallest line, which is the cheapest
            failure available here.
          */}
          <span>© {new Date().getFullYear()} TDG · Built by brothers, Nate &amp; Luke.</span>
          <span className="footer__king">JESUS IS KING</span>
        </div>
      </div>
    </footer>
  )
}
