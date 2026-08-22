/**
 * A URL for a file in `public/`.
 *
 * The site is served from a subpath on GitHub Pages, so a leading slash would
 * resolve against the origin and 404. Vite rewrites the paths it can see, in
 * HTML and in CSS, but not strings assembled at runtime, which is every
 * `srcSet` in this codebase. `BASE_URL` is `/` in dev and always ends in a
 * slash, so the argument never takes one.
 *
 * Usage: `srcSet={asset('shots/maranatha-720.webp')}`
 */
export const asset = (path: string) => import.meta.env.BASE_URL + path
