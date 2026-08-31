# The TDG Cloud storage visualizer — one design, every surface

The Apple/Google storage bar's job — *how full am I, and what is taking the
room?* — answered in one glance, and then bettered on three counts: every
segment is a real control, the numbers are exact, and work in flight is
visible. TDG Cebu's `src/cloud/CloudViz.tsx` is the canonical
implementation; every app with a signed-in Cloud surface implements the SAME
design natively in its own stack and theme system. Same anatomy, same
behaviour, same words — its own clothes.

## Anatomy

1. **The bar.** One horizontal track (the pooled quota at full width), inside
   it one coloured segment per app, widths proportional to bytes ÷ quota,
   with a small gap between segments and a minimum segment width (~10px) so a
   2 MB app stays visible and pressable beside a 40 GB one. The track's
   unfilled remainder IS the free space — visibly empty, never painted as a
   ninth "app".
2. **The uploading segment.** Reserved bytes (`reserved_bytes` > 0) draw as
   one extra segment with animated diagonal stripes, labelled "Uploading
   now". An upload in flight is real space; invisible-until-landed reads as
   the meter lying.
3. **The inspector strip.** One line under the bar. Idle: `<used> used ·
   <free> free of <quota>`. While a segment is hovered, focused, or pinned:
   its colour dot, the app's display name, the friendly size, **the exact
   byte count** (`42,412,342,211 bytes`, thousands-separated, in the
   monospace face), the file count, and its share of the quota (`1.9%`;
   `<1%` below one). Exactness is the point — a meter that only says "39 GB"
   is the thing this replaces.
4. **The legend.** One pressable chip per segment: colour dot + app name +
   friendly size. Plus one non-interactive "Free" chip (dashed outline where
   the dot would be). Chips and segments are the same control in two shapes.

## Behaviour

- **Hover or keyboard focus inspects** (the strip switches to that segment);
  moving away restores the summary. While one segment is inspected, the
  others drop to ~40% opacity so the eye lands without anything moving.
- **Press pins** (`aria-pressed`), and pinning REVEALS that app's own
  content listing on the same surface — on the site that is the app's hosted
  file browser; in an app it is whatever that app's Cloud section lists
  (its synced documents, its per-category rows). Pressing again unpins.
- **Empty account**: the track renders with its own sentence ("Nothing
  hosted yet…") — an empty bar with no words reads as broken.
- **Near-full**: at ≥80% used the frame takes the app's warning tone,
  matching the server's `quota_high` threshold.
- **Entrance**: segments may animate in (a staggered rise), but the
  animation's FIRST frame must already be a legible bar — squat or faded is
  fine, invisible is not. Measured on 2026-08-31: a starved animation clock
  (throttled tab, energy saver, an embedded pane) freezes an animation at
  its from-frame, and a from-frame of scale 0 froze the whole meter into
  showing nothing. Honour reduced-motion by dropping the entrance and the
  stripe march entirely.

## Colour

Eight distinct hues, defined in the app's own theme system, per theme (one
set cannot sit legibly on both a near-black and a near-white ground — the
site's `--chart-1..8` in `src/styles/tokens.css` is the reference pair).
Assign by RANK: `per_app` arrives from `tdg_cloud_status()` already sorted
by bytes descending, and segment N takes hue N (mod 8). Rank, not
name-hashing, so two large neighbours never land on sibling hues; the legend
keeps identity unambiguous when an app's rank (and so its colour) shifts.
Order the eight so neighbours contrast (blue, amber, green, violet, teal,
pink, olive, slate — the site's ordering).

## Accessibility

- Segments and chips are real buttons: focusable, `aria-pressed` when
  pinned, and each carries a full `aria-label` ("TDG Veditor: 39 GB, 214
  files (1.9% of your storage)").
- The inspector strip is `aria-live="polite"`, so walking segments by
  keyboard reads the numbers aloud.
- The dim-others effect is opacity only — never `display`/size changes under
  the pointer.

## Data

Everything comes from the app's existing `tdg_cloud_status()` answer:
`per_app[]` (app, bytes, files), `reserved_bytes`, `used_bytes`,
`free_bytes`, `quota_bytes`. No new server surface, no client-side
recomputation of shares beyond the divisions above. App display names come
from wherever the app already names TDG apps; never print raw ids.
