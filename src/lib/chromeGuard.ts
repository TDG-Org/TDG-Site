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

function sweep(root: ParentNode) {
  root.querySelectorAll?.(GUARDED).forEach(strip)
}

/**
 * Starts the guard. Returns the function that stops it, so a test (or a future
 * settings switch) can turn it off; nothing in the app calls that today.
 */
export function guardChrome(): () => void {
  // The extension usually gets there first, so clear whatever is already on.
  sweep(document)

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes') {
        const el = record.target as Element
        if (el.matches?.(GUARDED)) strip(el)
        continue
      }
      record.addedNodes.forEach((node) => {
        if (node.nodeType !== 1) return
        const el = node as Element
        if (el.matches?.(GUARDED)) strip(el)
        sweep(el)
      })
    }
  })

  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['style'],
  })

  return () => observer.disconnect()
}
