import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Shot } from '../data/content'
import './ImageSlot.css'

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
  /** persistence key for a locally dropped image — must be unique per slot */
  id: string
  placeholder: string
  /** a real screenshot; a local drop still overrides it in that browser */
  shot?: Shot
  /** widest the slot is ever painted, as a CSS sizes value */
  sizes?: string
  /** the first card in view should not wait for the lazy loader */
  priority?: boolean
}

const key = (id: string) => `tdg-slot:${id}`

const srcSet = (shot: Shot, ext: 'avif' | 'webp') =>
  shot.widths.map((w) => `/shots/${shot.slug}-${w}.${ext} ${w}w`).join(', ')

/**
 * A product screenshot, or an empty region waiting on one. Drops are kept in
 * that browser only, so the page can be filled in for review without a build.
 */
export function ImageSlot({ id, placeholder, shot, sizes = '(max-width: 700px) 90vw, 320px', priority }: Props) {
  const [dropped, setDropped] = useState<string | undefined>()
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(key(id))
      if (stored) setDropped(stored)
    } catch {
      /* private mode — the slot just shows whatever shipped */
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
          /* over quota — keep it for this session only */
        }
      }
      reader.readAsDataURL(file)
    },
    [id],
  )

  const filled = Boolean(dropped || shot)

  return (
    <div className="slot" data-over={over} data-filled={filled}>
      {dropped ? (
        <img className="slot__img" src={dropped} alt={shot?.alt ?? placeholder} />
      ) : shot ? (
        <picture>
          <source type="image/avif" srcSet={srcSet(shot, 'avif')} sizes={sizes} />
          <source type="image/webp" srcSet={srcSet(shot, 'webp')} sizes={sizes} />
          <img
            className="slot__img"
            src={`/shots/${shot.slug}-${shot.widths[0]}.webp`}
            alt={shot.alt}
            width={shot.widths[0]}
            height={Math.round((shot.widths[0] / 16) * 10)}
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            fetchPriority={priority ? 'high' : 'auto'}
            style={shot.position ? { objectPosition: shot.position } : undefined}
          />
        </picture>
      ) : null}

      {/* A filled slot still accepts a drag-drop replacement, but it is not a
          button — clicking a screenshot should not open a file dialog. */}
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
    </div>
  )
}
