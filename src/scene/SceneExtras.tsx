import { Fragment, type JSX } from 'react'
import { buildArt } from '../components/scene/ThemedArt'
import { useTheme } from '../theme/ThemeProvider'
import { placementStyle } from './apply'
import { useExtras } from './store'
import type { SectionId } from './types'

/**
 * The pieces a draft ADDED to one section.
 *
 * ## Why it is a host inside each section rather than one layer over the page
 *
 * A page-wide sticker layer would be one line of code instead of seven, and it
 * would put every added piece in front of every section's background — because
 * a section paints its own band, and a sibling that comes later in the
 * document paints over it. Half the reason to add a palm at all is to put it
 * BEHIND the copy and in front of the floor, which is a question about where
 * it sits in that section's own stack. So the host goes inside the section's
 * art container, next to the pieces it is going to stand among, and DOM order
 * plus each piece's own `z` decides the rest.
 *
 * ## It renders nothing, for everybody
 *
 * `useExtras` returns a frozen empty array unless the editor is on AND the
 * draft has a piece anchored here, and this returns `null` for that. So the
 * seven call sites cost a hook and a comparison against a constant. That is
 * the same bargain `store.ts` makes for slot overrides and for the same
 * reason: a developer-only feature everybody's browser evaluates is a feature
 * everybody pays for.
 *
 * ## `position: absolute; inset: 0` and nothing else
 *
 * The host is a box the size of its section's art container, with no paint of
 * its own and no pointer surface, so a piece inside it takes percentages of
 * the same box the shipped pieces beside it take. That is what makes a draft's
 * `x`/`y` mean the same thing whether the piece was added by the editor or has
 * been in the CSS since the section was written — and it is what lets me bake
 * one into the other without re-deriving a single number.
 */
export function SceneExtras({ section }: { section: SectionId }): JSX.Element | null {
  const { theme } = useTheme()
  const extras = useExtras(section, theme)
  if (extras.length === 0) return null
  return (
    <div className="scene__extras" aria-hidden="true">
      {/* A `Fragment` carries the key and adds no element. A wrapper `<span>`
          would be a second box between the piece and the host, and the moment
          anything gave it a position the percentages would start resolving
          against the wrong rectangle. */}
      {extras.map((e) =>
        e.hidden ? null : (
          <Fragment key={e.id}>
            {buildArt(e.motion, {
              art: e.art,
              className: 'scene__extra',
              factor: e.factor ?? 0.06,
              style: placementStyle(e),
              extraId: e.id,
              swayX: e.swayX,
              swayY: e.swayY,
            })}
          </Fragment>
        ),
      )}
    </div>
  )
}
