import { useEffect } from 'react'

/**
 * Park every decorative animation in a section while that section is off
 * screen. The faith gradient field alone is a rotating conic gradient under a
 * 46px blur — cheap to look at, expensive to keep compositing when nobody can.
 */
export function useOffscreenPause() {
  useEffect(() => {
    const sections = Array.from(document.querySelectorAll<HTMLElement>('section, footer'))
    if (!sections.length) return

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          ;(entry.target as HTMLElement).dataset.live = String(entry.isIntersecting)
        }
      },
      { rootMargin: '120px 0px' },
    )
    for (const section of sections) {
      section.dataset.live = 'true'
      io.observe(section)
    }
    return () => io.disconnect()
  }, [])
}
