import { useAccountCount } from '../badges/useBadges'
import { CONTACT, GITHUB_ORG, VOLUME_CONTROLLER } from '../data/content'
import { asset } from '../lib/asset'
import { ABOUT_HASH, STORE_HASH } from '../lib/route'
import './Footer.css'

/**
 * How many TDG accounts there are, or nothing at all.
 *
 * `useAccountCount()` answers `null` while the number is unknown or the read
 * failed, and the honest render of "we could not find out" is **nothing** — not
 * a zero, not a dash, not a skeleton. A made-up count is a lie printed on the
 * bottom of every page of the site, and this is the one place the site is being
 * quiet and factual. See src/badges/README.md, which is authoritative for it.
 *
 * The number is printed exactly as it comes back: never rounded, never floored
 * to something rounder, and never written `6+`. It is small, and small is what
 * it honestly is.
 *
 * Only the word after it is derived, so the day this reads `1` it does not read
 * `1 accounts`.
 */
function AccountCount() {
  const count = useAccountCount()
  if (count === null) return null
  return (
    <p className="footer__count">
      <span className="footer__count-n">{count}</span>{' '}
      {count === 1 ? 'account' : 'accounts'} across the TDG apps.
    </p>
  )
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer__shell">
        <div className="footer__top">
          <div className="footer__brand">
            <picture>
              <source
                type="image/avif"
                srcSet={`${asset('assets/tdg-wordmark-56.avif')} 1x, ${asset('assets/tdg-wordmark-112.avif')} 2x`}
              />
              <img
                className="footer__wordmark"
                src={asset('assets/tdg-wordmark-56.webp')}
                srcSet={`${asset('assets/tdg-wordmark-56.webp')} 1x, ${asset('assets/tdg-wordmark-112.webp')} 2x`}
                alt="TDG"
                width={53}
                height={28}
                loading="lazy"
                decoding="async"
              />
            </picture>
            <div className="footer__name">THE DISCIPLES OF GOD</div>
            <p className="footer__blurb">
              Brothers building software, games, and tools for the glory of Jesus.
            </p>
            <AccountCount />
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
