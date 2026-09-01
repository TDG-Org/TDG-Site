import { asset } from '../lib/asset'

/**
 * The TDG Cloud product mark, shared by every Cloud surface on this site.
 *
 * The files live in `public/` because the same transparent export kit also
 * serves non-React consumers. Every URL still goes through `asset()` so the
 * mark keeps working at GitHub Pages' `/TDG-Site/` base path (AGENTS §15).
 */
export function CloudMark({
  className = 'cloud__mark',
  sizes,
}: {
  className?: string
  sizes: string
}) {
  return (
    <img
      className={className}
      src={asset('assets/tdg-cloud/tdg-cloud-64.png')}
      srcSet={`${asset('assets/tdg-cloud/tdg-cloud-32.png')} 32w, ${asset('assets/tdg-cloud/tdg-cloud-64.png')} 64w, ${asset('assets/tdg-cloud/tdg-cloud-128.png')} 128w`}
      sizes={sizes}
      width="128"
      height="128"
      alt=""
      aria-hidden="true"
      decoding="async"
      draggable="false"
    />
  )
}
