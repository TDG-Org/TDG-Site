import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { KeyArtSpec, Shot } from '../data/content'
import { asset } from '../lib/asset'
import { KeyArt } from './KeyArt'
import './ImageSlot.css'

/**
 * Drop-to-fill is an authoring convenience for reviewing the page before the
 * real screenshots land. It must never reach a visitor: a public site does not
 * ask people to upload a file, and "Drop a Music Everything screenshot" is not
 * copy anyone outside this repo should read.
 */
const AUTHORING = import.meta.env.DEV

function DropLayer({
  as,
  label,
  onPick,
  onOver,
  onFile,
  children,
}: {
  as: 'div' | 'button'
  label: string
  onPick?: () => void
  onOver: (over: boolean) => void
  onFile: (file: File | undefined) => void
  children: ReactNode
}) {
  const handlers = {
    className: 'slot__drop',
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault()
      onOver(true)
    },
    onDragLeave: () => onOver(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      onOver(false)
      onFile(e.dataTransfer.files[0])
    },
  }
  if (as === 'div') return <div {...handlers}>{children}</div>
  return (
    <button type="button" aria-label={label} onClick={onPick} {...handlers}>
      {children}
    </button>
  )
}

type Props = {
  /** persistence key for a locally dropped image, unique per slot */
  id: string
  /** authoring-only prompt; never rendered in a production build */
  placeholder: string
  /**
   * Custom key art, drawn by `KeyArt`. **It wins over everything else**, a
   * dropped image included.
   *
   * `art` and `shot` are not two ways of saying the same thing, so this is not
   * a fallback chain with a winner picked arbitrarily. They are for two
   * different places, and both are wanted: the card wants the cover, because a
   * screenshot at the 280px a card is painted at is a grey rectangle, and the
   * app's own page wants the screenshot, because somebody who opened the page
   * wants to see the software. `shotForPage()` in `data/appPages.ts` reads
   * `APPS[].shot` for that page, so the shot has to stay in the data even on a
   * card that never shows it.
   *
   * It also beats a local drop, and that is the right way round: drop-to-fill
   * exists to preview a slot that has nothing in it yet, and a slot with key
   * art is finished. See `AUTHORING` above.
   */
  art?: KeyArtSpec
  /** a real screenshot; a local drop still overrides it in that browser */
  shot?: Shot
  /** widest the slot is ever painted, as a CSS sizes value */
  sizes?: string
}

const key = (id: string) => `tdg-slot:${id}`

const srcSet = (shot: Shot, ext: 'avif' | 'webp') =>
  shot.widths.map((w) => `${asset(`shots/${shot.slug}-${w}.${ext}`)} ${w}w`).join(', ')

/**
 * A card's cover: its own key art, a product screenshot, or a quiet empty frame
 * that keeps the card's proportions. In development the empty frame also accepts
 * a dropped image, kept in that browser only, so the page can be reviewed filled
 * in without a build.
 */
export function ImageSlot({
  id,
  placeholder,
  art,
  shot,
  sizes = '(max-width: 700px) 90vw, 320px',
}: Props) {
  const [dropped, setDropped] = useState<string | undefined>()
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!AUTHORING) return
    try {
      const stored = localStorage.getItem(key(id))
      if (stored) setDropped(stored)
    } catch {
      /* private mode, so the slot just shows whatever shipped */
    }
  }, [id])

  const accept = useCallback(
    (file: File | undefined) => {
      if (!file || !file.type.startsWith('image/')) return
      const reader = new FileReader()
      reader.onload = () => {
        const url = String(reader.result)
        setDropped(url)
        try {
          localStorage.setItem(key(id), url)
        } catch {
          /* over quota, so keep it for this session only */
        }
      }
      reader.readAsDataURL(file)
    },
    [id],
  )

  const filled = Boolean(art || dropped || shot)

  return (
    <div className="slot" data-over={over} data-filled={filled} data-authoring={AUTHORING || undefined}>
      {art ? (
        <KeyArt spec={art} />
      ) : dropped ? (
        <img className="slot__img" src={dropped} alt={shot?.alt ?? ''} />
      ) : shot ? (
        <picture>
          <source type="image/avif" srcSet={srcSet(shot, 'avif')} sizes={sizes} />
          <source type="image/webp" srcSet={srcSet(shot, 'webp')} sizes={sizes} />
          <img
            className="slot__img"
            src={asset(`shots/${shot.slug}-${shot.widths[0]}.webp`)}
            alt={shot.alt}
            width={shot.widths[0]}
            height={Math.round((shot.widths[0] / 16) * 10)}
            loading="lazy"
            decoding="async"
            style={shot.position ? { objectPosition: shot.position } : undefined}
          />
        </picture>
      ) : null}

      {/* Key art is not a slot waiting to be filled, so it gets no drop layer
          at all — not even the drag-drop-to-replace one a screenshot keeps.
          There is nothing here to preview and nothing a dropped file could
          usefully stand in for. */}
      {AUTHORING && !art ? (
        <>
          {/* A filled slot still accepts a drag-drop replacement, but it is not
              a button: clicking a screenshot should not open a file dialog. */}
          <DropLayer
            as={filled ? 'div' : 'button'}
            label={placeholder}
            onPick={filled ? undefined : () => input.current?.click()}
            onOver={setOver}
            onFile={accept}
          >
            {filled ? null : (
              <>
                <svg
                  className="slot__icon"
                  width="26"
                  height="26"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  aria-hidden="true"
                >
                  <rect x="3" y="4" width="18" height="16" rx="2" />
                  <circle cx="8.5" cy="9.5" r="1.6" />
                  <path d="M4 17l4.5-5 3.5 4 3-2.5L20 17" />
                </svg>
                <span className="slot__hint">{placeholder}</span>
              </>
            )}
          </DropLayer>

          <input
            ref={input}
            className="slot__input"
            type="file"
            accept="image/*"
            tabIndex={-1}
            onChange={(e) => accept(e.target.files?.[0])}
          />
        </>
      ) : null}
    </div>
  )
}
