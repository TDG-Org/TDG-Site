const PATH = 'M16.6 0H25.4V26.5H42V35.3H25.4V100H16.6V35.3H0V26.5H16.6Z'

type Props = {
  /** hero uses a four-stop ramp, the faith centrepiece a softer three-stop one */
  variant?: 'hero' | 'faith'
  className?: string
}

/**
 * The TDG cross. One path, one continuous gradient across both bars — not two
 * shapes — so the light reads as a single fall across the whole glyph.
 */
export function CrossGlyph({ variant = 'hero', className }: Props) {
  const id = variant === 'hero' ? 'tdgCrossGrad' : 'faithCrossGrad'
  const stops =
    variant === 'hero'
      ? [
          { offset: 0, token: '--cross-stop-0' },
          { offset: 0.34, token: '--cross-stop-1' },
          { offset: 0.78, token: '--cross-stop-2' },
          { offset: 1, token: '--cross-stop-3' },
        ]
      : [
          { offset: 0, token: '--faith-stop-0' },
          { offset: 0.42, token: '--faith-stop-1' },
          { offset: 1, token: '--faith-stop-2' },
        ]

  return (
    <svg viewBox="0 0 42 100" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id={id} x1="6%" y1="0%" x2="94%" y2="100%">
          {stops.map((s) => (
            <stop key={s.offset} offset={s.offset} style={{ stopColor: `var(${s.token})` }} />
          ))}
        </linearGradient>
      </defs>
      <path d={PATH} fill={`url(#${id})`} />
    </svg>
  )
}
