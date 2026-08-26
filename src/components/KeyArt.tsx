import { useId, type JSX } from 'react'
import { asset } from '../lib/asset'
import { KEY_ART_BYLINE, type KeyArtScene, type KeyArtSpec } from '../data/content'
import './KeyArt.css'

/**
 * An app card's cover, drawn rather than photographed.
 *
 * ## Why this is an SVG in the page and not five more PNGs
 *
 * Bible Educator's cover is a raster in `public/shots/`, and it is the one the
 * user called perfect: an icon top-left, a very large serif name, one sentence
 * under it, a strip of short facts in a warm accent, a short rule, and the TDG
 * byline — all left-aligned over a dark scene that bleeds away to the right.
 * The other five had product screenshots, which are a grey rectangle at the
 * 280px a card is actually painted at. This component is that same composition,
 * for every app that does not have the raster.
 *
 * - **`viewBox="0 0 1120 700"`** is exactly the Bible Educator image's size and
 *   exactly the `16 / 10` that `.apps__shot` already reserves, so the raster and
 *   the five drawings sit in the grid identically.
 * - **Text inside a viewBox scales as one unit.** The composition is crisp at
 *   every column count and every device pixel ratio, where a raster is crisp at
 *   the one width it was exported for.
 * - **No network bytes for the type and no build step**, and the words stay
 *   editable in git rather than baked into an image nobody can grep.
 * - Rule 1 of `AGENTS.md` (content is data, never a component) and rule 17 (a
 *   surface listing our products derives the list) point the same way: **one
 *   component draws all five**, taking everything it says from `KeyArtSpec` in
 *   `src/data/content.ts`. A sixth app is a data entry, not a file.
 *
 * ## The deliberate deviation: this art does NOT reskin with the theme
 *
 * Every colour here is fixed. `.keyart` declares its own small palette in
 * `KeyArt.css` and nothing in it answers to `[data-theme='light']`.
 *
 * That is on purpose and it is the whole reason the set holds together. Bible
 * Educator's cover is a fixed dark raster — it cannot flip — so a neighbour that
 * turned pale in light mode would leave one dark card in a row of light ones and
 * read as broken art rather than as a theme. `AGENTS.md` §4 lists the always-dark
 * auth modal as exactly this kind of deliberate exception; this is the second.
 *
 * The card *around* the art still reskins: its border, its background, the
 * hairline under the cover, the title and copy below it. Only the cover is fixed,
 * the same way a photograph on a page is fixed.
 *
 * It also means the cutout drawn into the backdrop is always the `-dark` file
 * from the parallax kit. That is not a missed theme swap — see `SCENE_ART`.
 *
 * ## Accessibility: `aria-hidden`, not `role="img"`
 *
 * Everything this art says is already in the card as real text, in the same
 * order: the cover link says "Open the Say2Quill page", the chips carry the
 * facts, the `<h3>` carries the title, and `.apps__copy` carries the sentence.
 * A `role="img"` with a label naming the app would make a screen reader say the
 * name twice before it reached the heading. `AppIcon` is `alt=""` for exactly
 * this reason and says so in its own header; this follows it.
 *
 * The stylesheet also takes the art out of the pointer and selection paths, so a
 * click anywhere on it still reaches the card's cover link and a drag across the
 * grid does not select five app names.
 */

/* ── the grid ──────────────────────────────────────────────────────────────
   Every number the composition is made of, in viewBox units, in one place.
   They are named constants and not literals in the JSX because rule 6 of
   AGENTS.md is that symmetry is structural: five covers read as a set only if
   they are the same five numbers, and numbers sprinkled through markup drift
   one card at a time. Tuned against the Bible Educator raster — the icon box,
   the left margin and the six baselines are within a few units of it.

   The one number that is NOT taken from the raster is the title's size, and it
   is the one that was measured rather than copied. That cover's face is a heavy
   slab; this site's serif is Cormorant Garamond, and index.html loads exactly
   one weight of it (500). Asking for 700 would get a synthetic bold, which a
   high-contrast serif wears badly. So the SIZE carries the weight instead.
   Rendered at 96 first and the cap height came out 73 units against the
   raster's 85 — visibly the smaller of two covers sitting side by side. 112
   lands it on 85, on the raster's own baseline, and still leaves the longest
   title on the site, "Music Everything", about 280 units clear of the right
   margin in Cormorant and about 140 in the Georgia fallback. SVG text does not
   wrap and does not shrink, so that headroom is the entire safety margin: a
   title longer than "Music Everything" needs this number checked, not just
   typed.                                                                     */
const VIEW = { w: 1120, h: 700 }
/** The one left margin. Icon, title, line, facts, rule and byline all start here. */
const M = 82
const ICON = { x: M, y: 66, size: 168 }
/** Same ratio as `.appicon[data-shape='tile']` in AppIcon.css. Change one, change both. */
const ICON_RADIUS = 0.22
const TITLE = { y: 352, size: 112 }
const LINE = { y: 424, size: 36 }
const FACTS = { y: 508, size: 28 }
const RULE = { y: 572, w: 130, h: 3 }
const BYLINE = { y: 630, size: 24 }

/** The light source: one soft ellipse, high and to the right, in every scene. */
const GLOW = { cx: 812, cy: 172, rx: 436, ry: 326 }

type ArtBox = { x: number; y: number; w: number; h: number }

/* Two boxes, not five. The kit's cutouts come in two proportions — the pines
   and the arch are 2:3 uprights, the ridge and the bridge are wide — so a piece
   is fitted into whichever box suits its shape, bottom-aligned, running off the
   right edge. `meet` inside the box, so nothing is ever stretched. */
const ART_TALL: ArtBox = { x: 762, y: 172, w: 358, h: 538 }
const ART_WIDE: ArtBox = { x: 470, y: 356, w: 690, h: 352 }

/**
 * What each scene puts behind the words, and nothing more than that.
 *
 * The kit's own guardrail 8 — *do not build a scene* — applies here as much as
 * it does to a section: one cutout, low and to the right, at a low opacity, so
 * the left two thirds stays clean for the type. The mood comes from the tone and
 * the light in `KeyArt.css`, not from stacking art.
 *
 * The path carries no theme suffix here because it is added below and it is
 * always `-dark`: see the header on why this art does not reskin.
 *
 * `dusk` deliberately has no cutout at all. A video editor's cover is a dark
 * room and a lit frame; a tree in it would be something in the shot.
 */
const SCENE_ART: Record<KeyArtScene, { art: string; box: ArtBox } | null> = {
  /* Say2Quill: on-device, no account, nothing leaves the room. Two trees at the
     edge of a still place. The kit's recommended tree treatment — the faceted
     pair, not the painterly grove, which is green and does not belong in this
     site's flat graphic language. */
  pines: { art: 'props/pine-faceted-pair', box: ART_TALL },
  /* Makullveny: a desk you sit down at. The arch is the threshold into the room,
     and it is the warmest of the five, which puts it closest to Bible
     Educator's own cover two cards away. */
  arch: { art: 'props/garden-arch', box: ART_TALL },
  /* DevFleet: a row of peaks for a fleet of repositories, each its own card. */
  ridge: { art: 'landscapes/mountain-ridge', box: ART_WIDE },
  /* Music Everything: the footbridge's repeating arches read as a bar line. */
  bridge: { art: 'landscapes/stone-footbridge', box: ART_WIDE },
  /* TDG Veditor: the light alone. */
  dusk: null,
}

export function KeyArt({ spec }: { spec: KeyArtSpec }): JSX.Element {
  /* Five of these render in one grid and each needs its own gradient ids: a
     duplicate id in a document is a coin flip over which definition every
     reference resolves to, and the visible failure is four cards wearing the
     fifth one's light. `useId` is stable across the server and the client. */
  const uid = useId()
  const id = (part: string) => `${uid}-${part}`
  const art = SCENE_ART[spec.scene]

  return (
    <svg
      className="keyart"
      data-scene={spec.scene}
      viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
      /* The slot is exactly 16/10 and so is the viewBox, so this is a no-op at
         every card width. It is `meet` rather than `slice` so that sub-pixel
         rounding can never crop the type; the sliver that would letterbox is
         painted out by `.keyart`'s own background-color, which is the same ink
         the composition's corners are. */
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {/* The tone: ink at the bottom-left where the type sits, lifting toward
            the top-right where the light is. */}
        <linearGradient id={id('tone')} x1="0" y1="1" x2="1" y2="0">
          <stop className="keyart__tone-0" offset="0.12" />
          <stop className="keyart__tone-1" offset="1" />
        </linearGradient>

        <radialGradient id={id('glow')}>
          <stop className="keyart__glow-0" offset="0" />
          <stop className="keyart__glow-1" offset="0.52" />
          <stop className="keyart__glow-2" offset="1" />
        </radialGradient>

        {/* The wash that keeps the left clean. It is drawn OVER the cutout, in
            the scene's own ink, so the art fades into the backdrop rather than
            being cut off at a line — and so the type never has to compete with
            whatever the cutout happens to be doing underneath it. */}
        <linearGradient id={id('scrim')} x1="0" y1="0" x2="1" y2="0">
          <stop className="keyart__scrim-0" offset="0" />
          <stop className="keyart__scrim-1" offset="0.46" />
          <stop className="keyart__scrim-2" offset="0.84" />
        </linearGradient>

        <radialGradient id={id('vignette')} cx="0.62" cy="0.26" r="0.82">
          <stop className="keyart__vignette-0" offset="0.42" />
          <stop className="keyart__vignette-1" offset="1" />
        </radialGradient>

        {spec.iconShape === 'tile' ? (
          <clipPath id={id('tile')}>
            <rect
              x={ICON.x}
              y={ICON.y}
              width={ICON.size}
              height={ICON.size}
              rx={ICON.size * ICON_RADIUS}
            />
          </clipPath>
        ) : null}
      </defs>

      <rect width={VIEW.w} height={VIEW.h} fill={`url(#${id('tone')})`} />
      <ellipse
        className="keyart__glow"
        cx={GLOW.cx}
        cy={GLOW.cy}
        rx={GLOW.rx}
        ry={GLOW.ry}
        fill={`url(#${id('glow')})`}
      />

      {art ? (
        <image
          className="keyart__art"
          /* asset(), never a leading slash: the site is served from /TDG-Site/
             and a leading slash resolves against the origin, which works
             perfectly in dev and 404s only after deploy. Rule 15.

             `.webp` and not the `.png` beside it, the same as every other
             consumer of the kit — the PNG is the source art and is up to 2.1 MB
             for one cutout, the WebP is the same artwork with its alpha intact
             at the size it is actually painted. Five of these render in one
             grid, so it is five files, not one. See ThemedArt.tsx and the kit's
             own README. */
          href={asset(`assets/parallax/${art.art}-dark.webp`)}
          x={art.box.x}
          y={art.box.y}
          width={art.box.w}
          height={art.box.h}
          /* Bottom-aligned in its box and never stretched, so a piece drawn at
             2:3 and a piece drawn at 3:1 both stand on the same floor. */
          preserveAspectRatio="xMinYMax meet"
        />
      ) : null}

      <rect width={VIEW.w} height={VIEW.h} fill={`url(#${id('scrim')})`} />
      <rect width={VIEW.w} height={VIEW.h} fill={`url(#${id('vignette')})`} />

      <image
        href={asset(`assets/${spec.icon}`)}
        x={ICON.x}
        y={ICON.y}
        width={ICON.size}
        height={ICON.size}
        /* `meet` is `object-fit: contain`, which is what AppIcon does: the art's
           centre and the box's centre are the same point whatever proportions
           the file turns out to have. */
        preserveAspectRatio="xMidYMid meet"
        clipPath={spec.iconShape === 'tile' ? `url(#${id('tile')})` : undefined}
      />
      {/* A hairline around a tile only. The same reasoning as AppIcon.css: a
          ring belongs on a mark that carries its own background, and around a
          free glyph it is a box drawn about thin air. It matters more here than
          on a card, because the backdrop behind it is always dark and the
          darkest tiles would otherwise melt into it. */}
      {spec.iconShape === 'tile' ? (
        <rect
          className="keyart__ring"
          x={ICON.x}
          y={ICON.y}
          width={ICON.size}
          height={ICON.size}
          rx={ICON.size * ICON_RADIUS}
        />
      ) : null}

      <text className="keyart__title" x={M} y={TITLE.y} fontSize={TITLE.size}>
        {spec.title}
      </text>
      <text className="keyart__line" x={M} y={LINE.y} fontSize={LINE.size}>
        {spec.line}
      </text>
      <text className="keyart__facts" x={M} y={FACTS.y} fontSize={FACTS.size}>
        {spec.facts.join(' · ')}
      </text>
      <rect className="keyart__rule" x={M} y={RULE.y} width={RULE.w} height={RULE.h} />
      <text className="keyart__byline" x={M} y={BYLINE.y} fontSize={BYLINE.size}>
        {KEY_ART_BYLINE}
      </text>
    </svg>
  )
}
