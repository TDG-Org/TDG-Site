/* ── Keeping the site looking like the site ────────────────────────────────
 *
 * Browser extensions reach into the page and repaint bits of it. A password
 * manager drops an icon into a credential box by writing an inline
 * `background-image` on the input; some of them write a `background-color`
 * with it, and a dark glass pill on a dark modal comes back white. A reading
 * or "dark mode" extension goes further and restyles whole surfaces. None of
 * that is the design, and on a site that already owns both a light and a dark
 * theme, none of it is an improvement either.
 *
 * The line this file draws: an extension may do whatever it likes in its OWN
 * user interface — its popup, its floating menu, its keyboard shortcuts, its
 * filling of a field — and it may not repaint OURS. Nothing here stops one
 * filling anything in, and nothing here touches an element it renders outside
 * our tree. What is undone is writes aimed at controls this app rendered, and
 * widgets parked inside their layout.
 *
 * Three defences, in order of how much they cost:
 *
 *   1. `<meta name="darkreader-lock">` in index.html, and `color-scheme` on
 *      the form controls. Both are the documented, no-code way of telling an
 *      extension "this page has its own themes", and the ones that behave
 *      well stop there. `color-scheme` is also what makes the browser's own
 *      autofill highlight come back dark instead of pale.
 *   2. CSS, in base.css: the autofill overrides, and `display: none` on the
 *      widgets a password manager parks inside one of our fields — the icon
 *      on the input, the button over its right edge.
 *   3. This file, for the one thing CSS cannot answer: an inline style
 *      written onto our own element. Author CSS cannot outrank an inline
 *      declaration, so the attribute has to come back off.
 *
 * Not one control this app renders carries an inline `style`; React sets none
 * of them. So on our form controls a `style` attribute is, by construction,
 * somebody else's, and removing it can only ever restore the stylesheet.
 */

/** Our own controls. Deliberately narrow: this is not a licence over the page. */
const GUARDED = 'input, textarea, select'

/**
 * A cap per element, not a global one.
 *
 * An extension that re-applies its style after each removal would otherwise
 * turn this into a loop that repaints for ever, which costs more battery than
 * the icon it is removing costs looking wrong. After a handful of rounds the
 * field is conceded and left alone: a stubborn extension wins that one box,
 * and the browser stays cool.
 */
const MAX_UNDO_PER_FIELD = 6
const undone = new WeakMap<Element, number>()

function strip(el: Element) {
  if (!el.hasAttribute('style')) return
  const n = undone.get(el) ?? 0
  if (n >= MAX_UNDO_PER_FIELD) return
  undone.set(el, n + 1)
  el.removeAttribute('style')
}

/**
 * Take one control under guard: clear what is already on it, then watch ITS
 * `style` attribute — and only its.
 *
 * ── why the observer is registered per control and not once on the root ──
 * This used to be a single `observe(document.documentElement, { attributes,
 * attributeFilter: ['style'], subtree })`, which is the obvious shape and the
 * expensive one. Every inline style write anywhere in the document produced a
 * MutationRecord, and this page writes inline styles from its frame loop: the
 * twelve hero layers, up to twenty parallax layers, every element mid-reveal,
 * the nav's progress bar and the cursor — thirty to sixty records per frame,
 * delivered as a microtask inside the animation frame, each allocating a
 * record and running `matches(GUARDED)` to learn that a `div` is not an
 * `input`. Measured with the CDP profiler during a scroll: a microtask under
 * every frame doing nothing. Registering the observer on each control instead
 * means the only `style` mutations it ever hears about are on elements it
 * would strip, and the frame loop's writes cost it nothing at all. A control
 * that arrives later is found through the `childList` watch below, which is
 * the cheap kind: this page adds and removes elements on a route change, not
 * on a frame.
 *
 * One `MutationObserver` accepts any number of targets, each with its own
 * options, and holds them weakly — a control that leaves the document takes
 * its registration with it, so nothing here leaks across a route change.
 */
function watch(observer: MutationObserver, el: Element) {
  strip(el)
  observer.observe(el, { attributes: true, attributeFilter: ['style'] })
}

function sweep(observer: MutationObserver, root: ParentNode) {
  root.querySelectorAll?.(GUARDED).forEach((el) => watch(observer, el))
}

/**
 * Starts the guard. Returns the function that stops it, so a test (or a future
 * settings switch) can turn it off; nothing in the app calls that today.
 */
export function guardChrome(): () => void {
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes') {
        // Only ever a guarded control: that is the only kind of element the
        // attribute watch is registered on.
        strip(record.target as Element)
        continue
      }
      record.addedNodes.forEach((node) => {
        if (node.nodeType !== 1) return
        const el = node as Element
        if (el.matches?.(GUARDED)) watch(observer, el)
        sweep(observer, el)
      })
    }
  })

  // The extension usually gets there first, so clear whatever is already on,
  // and put every control that exists today under watch.
  sweep(observer, document)

  // Structure only. Attribute changes are heard per control, above.
  observer.observe(document.documentElement, { subtree: true, childList: true })

  return () => observer.disconnect()
}
