/** A tab reserved by a money press, before any network request consumes its
 * browser activation. Opening only after a slow billing response silently
 * failed with Chrome's normal popup blocker; cancellation-to-checkout has the
 * same wait. The handle is detached from its opener before it can leave here. */
export type CheckoutTab = { navigate: (url: string) => boolean; close: () => void }

export function reserveCheckoutTab(): CheckoutTab | null {
  const tab = window.open('about:blank', '_blank')
  if (!tab) return null
  tab.opener = null

  // A slow response gets a themed waiting surface, not an unexplained empty
  // tab. These are the current theme's computed tokens, never another palette.
  const theme = getComputedStyle(document.documentElement)
  const body = tab.document.body
  tab.document.documentElement.lang = document.documentElement.lang || 'en'
  tab.document.title = 'Opening Stripe…'
  const privacy = tab.document.createElement('meta')
  privacy.name = 'referrer'
  privacy.content = 'no-referrer'
  tab.document.head.append(privacy)
  body.style.cssText = 'margin:0;min-height:100vh;display:grid;place-content:center;padding:24px;box-sizing:border-box;text-align:center'
  body.style.background = theme.getPropertyValue('--bg')
  body.style.color = theme.getPropertyValue('--text')
  body.style.font = getComputedStyle(document.body).font
  const message = tab.document.createElement('p')
  message.setAttribute('role', 'status')
  message.textContent = 'Opening your secure Stripe page…'
  body.append(message)

  return {
    navigate(url) {
      if (tab.closed) return false
      tab.location.replace(url)
      return true
    },
    close() { if (!tab.closed) tab.close() },
  }
}
