import { CONTACT, GITHUB_ORG, VOLUME_CONTROLLER } from '../data/content'
import './Footer.css'

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer__shell">
        <div className="footer__top">
          <div className="footer__brand">
            <img className="footer__wordmark" src="/assets/tdg-wordmark.png" alt="TDG" />
            <div className="footer__name">THE DISCIPLES OF GOD</div>
            <p className="footer__blurb">
              Brothers building software, games, and tools — for the glory of Jesus.
            </p>
          </div>

          <div className="footer__cols">
            <div>
              <div className="footer__col-title">Projects</div>
              <div className="footer__links">
                <a href="#apps">Apps</a>
                <a href="#tools">Tools &amp; extensions</a>
                <a href="#building">Building now</a>
                <a href="#faith">Faith</a>
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
          <span>© 2026 TDG · Built by brothers, Nate &amp; Luke.</span>
          <span className="footer__king">JESUS IS KING</span>
        </div>
      </div>
    </footer>
  )
}
