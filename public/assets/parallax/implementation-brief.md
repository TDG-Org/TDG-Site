# Claude Code implementation brief

Add the new transparent PNG parallax art kit from `public/assets/parallax/` to
the TDG home page as a restrained environmental frame.  Preserve the current
hero completely: its `TDG` wordmark, point-cloud model, light shafts, stars,
copy, CTAs, navigation, and bottom strip must remain the visual focus.

Read `AGENTS.md`, `src/components/Hero.tsx`, `src/components/Hero.css`,
`src/hooks/README.md`, and this folder's `README.md` before changing code.

Implement the following intentionally small composition:

1. Behind the existing hero model/content, add a bottom-aligned fog veil and
   mountain ridge that reveal cleanly from below.  Swap actual `-dark` and
   `-light` PNG sources with the current theme.  The terrain must remain below
   the bottom strip and below all hero copy.
2. Add only the lamppost as a small left-edge detail on desktop.  It may drift
   a few pixels against the landscape, but it must never overlap the nav,
   heading, eyebrow, CTA group, or strip.  Do not add the bench/trees to the
   hero by default; reserve them for future sections so the scene stays quiet.
   For the later sections, use the richer story anchors one at a time: the
   wayfinding post or stepping stones for Story, the footbridge as an alternate
   Story seam, the garden arch near Outro, and the small hillside cross only in
   Faith.  The richer pine grove is a one-section edge anchor only and must
   never sit beside the hero lamppost.  Never place the bridge and stepping
   stones together.
3. Use each section's existing style of reveal / parallax.  All movement must
   run through the existing shared frame loop via `useHeroParallax` or
   `useParallax`, and stop cleanly for reduced motion.  No direct
   `requestAnimationFrame`, scroll listener, timer, or new dependency.
4. Treat all artwork as decorative: `alt=""`, `aria-hidden="true"`, and
   `pointer-events: none`.  Use `asset()` for every runtime image path.
5. Use explicit z-indexes that preserve this ordering from back to front:
   sky/fog → mountains → point cloud → peripheral props → hero content / strip
   / navigation.  Do not disturb the present point-cloud drag area.
6. On screens 640px and narrower, hide the lamppost and retain only terrain if
   its measured layout leaves copy completely clear.  The art must introduce no
   horizontal overflow down to 320px and 300% zoom.
7. Preserve the site's token discipline.  The assets themselves already carry
   their theme palette; CSS may control opacity and placement but must not add
   literal colours or filters to recolour them.
8. The second-wave anchors intentionally have a richer low-poly facet count.
   Keep them small enough that their detail is discovered rather than announced.

Validate real paths in both themes, light/dark contrast after the theme wave,
reduced motion, 375px and 1440px layouts, keyboard flow, the console, then run
`npm run typecheck` and `npm run build`.  Measure no-overlap and layout claims;
do not only eyeball them.
