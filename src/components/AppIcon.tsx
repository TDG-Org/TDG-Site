import { asset } from '../lib/asset'
import type { IconShape } from '../data/content'
import './AppIcon.css'

/**
 * One app's own icon, drawn the same way everywhere it appears.
 *
 * There are four places now: the Apps cards, the Tools cards, the head of an
 * app's own page, and the head of a product on the Store. One component rather
 * than four copies, because the alignment is the whole difficulty and four
 * copies is four chances to get it wrong in a different way.
 *
 * ## Centring, which is the thing that was broken
 *
 * The icon sits in a title row beside text. The row used to be
 * `align-items: baseline`, so the text hung off its own baseline while the icon
 * centred itself in the line: measured, the text's middle sat 3.5px above the
 * icon's. Every row that carries one of these now centres its items, and the
 * icon is a fixed square with the art `object-fit: contain` inside it, so the
 * art's centre and the box's centre are the same point whatever shape the file
 * turns out to be.
 *
 * ## Tile or glyph
 *
 * Most of these marks are rounded tiles that fill their square: they carry
 * their own background and corners, and the site puts a hairline ring around
 * them so the darkest ones do not melt into a light card. Two of them, Bible
 * Educator's and DevFleet's, are free glyphs on nothing. A ring around one of
 * those is a box drawn about thin air, so they are drawn bare. Every file is
 * exported trimmed to its own art and squared, so both kinds fill the same box.
 */
export function AppIcon({
  icon,
  shape,
  size,
  className,
}: {
  /** Filename in `public/assets/`, extension included. */
  icon: string
  shape: IconShape
  /**
   * The box, in px. The art is contained inside it and centred. Leave it out
   * and the box is whatever `--icon-size` the class sets, which is how a page
   * gives its icon a size that answers to the viewport instead of a literal.
   */
  size?: number
  className?: string
}) {
  return (
    <img
      className={className ? `appicon ${className}` : 'appicon'}
      data-shape={shape}
      /* Decorative: the title beside it always names the app, and a screen
         reader should not hear the name twice. */
      alt=""
      aria-hidden="true"
      src={asset(`assets/${icon}`)}
      width={size ?? 30}
      height={size ?? 30}
      style={size ? ({ '--icon-size': `${size}px` } as React.CSSProperties) : undefined}
      loading="lazy"
      decoding="async"
    />
  )
}
