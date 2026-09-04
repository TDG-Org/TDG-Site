# `src/scene/` · the Scene Editor and the draft it writes

A dock over the home page that selects, moves, resizes, retimes, duplicates,
deletes and adds the parallax art — one theme at a time — and writes what it
did to a JSON draft. Asked for by name: *"build me a developer toggle that can
go into edit mode … I should be able to move, delete, duplicate, etc. any of
the assets … make them moveable for the user interaction like with their mouse
or scrolling, or to be still … edit either Dark mode and Light mode and save it
… drag in assets from a library right into the interface. I will tell you when I
like it and you will make it the default."*

That last sentence is the architecture. **This folder produces a draft, not a
default.** Read the two-stage arrangement below before changing anything here.

| | |
| --- | --- |
| `types.ts` | The draft's shape: `Placement`, `SlotOverride`, `Extra`, `SceneDoc`. |
| `store.ts` | One module-level store. Load, save, patch, and the two hooks the art layer reads. |
| `apply.ts` | A `Placement` as inline style, and the reverse — measuring a live element back into one. |
| `SceneExtras.tsx` | Renders the pieces a draft ADDED to one section. Seven call sites, one per section. |
| `sceneMode.ts` | The per-device switch in the account menu. |
| `editor/SceneEditor.tsx` | The dock, the pick sheet, the three panels. Lazy; admins only. |
| `editor/SceneEditor.css` | Its chrome, in the site's own tokens. |

---

## The two stages, and why the second one is a person

**Stage one is this folder.** The editor holds a draft, applies it over the
shipped stylesheet as inline style, and saves it to `public/scene/draft.json`.
Nothing here writes CSS, and nothing here is on for a visitor.

**Stage two is a human reading that JSON and writing the CSS.** Not a build
step, and that is deliberate. Every placement rule in `src/components/*.css` is
a `calc()` over named tokens with a paragraph above it saying how the number
was solved and what breaks at 320px — `--games-pine-clear`, `--outro-horizon`,
the clamp that keeps the hero's palm trunk off the right edge. A generator that
turned `x: 31.7` into `left: 31.7%` would be correct at one viewport and would
throw away the reason, which is the part that makes the next change possible.
So the draft is a proposal in the same units the CSS is written in, and turning
it into the default means picking the right token, writing the why, and
rendering it. `AGENTS.md` §7.0 governs that step like any other visual change.

When the draft has been baked, `public/scene/draft.json` goes back to empty and
the same commit carries both halves.

---

## What a visitor pays for this

**Nothing that renders, and one comparison per art element per render.**

- `sceneMode.ts` is off unless deliberately switched on, and `App.tsx` gates
  the whole thing behind `useAuth().isAdmin` as well. The editor is a lazy
  chunk, so nobody else fetches a byte of it.
- `store.ts` holds `null` until the editor calls `loadDraft()`. `useSlotOverride`
  returns the same `undefined` for every slot on every render, and `useExtras`
  returns one frozen empty array, so `useSyncExternalStore` sees an unchanged
  snapshot and React does nothing.
- `SceneExtras` returns `null` for that empty array, so the seven hosts cost a
  hook and a length check.
- The three exports of `scene/ThemedArt.tsx` resolve to exactly the component
  they used to be. See its header for why that resolution is not a conditional
  hook.

Measured on the production build: the main bundle grew ~6 kB before gzip for
the store, the placement maths and the seven hosts.

---

## How a placement is stored, and why in those units

`x` and `y` are percentages of the element's **offset parent**; `w` is `vw` and
`h`, when it is written at all, is `vh`. All of it is in `types.ts` with the
argument, and the short version is that a draft made on a 1904px window has to
mean the same thing on a 1280px one. A pixel offset does not; a percentage of
the box the layer is actually positioned inside does.

Only the fields that were touched are written. An absent field is not a zero —
it is "the stylesheet still decides", which is what keeps a dragged piece's
mask, `object-position` and clamps intact.

`apply.ts` writes `left`/`top` **and** `right: auto`/`bottom: auto` together,
because most of these rules anchor from the far edge and a box with `left`,
`right` and `width` all resolved silently ignores one of them.

### Everything is measured off the LAYOUT box, never the rect

This is the single most important line in the folder and it is worth stating
here as well as in `apply.ts`, because getting it wrong does not look like a
maths error — it looks like the art teleporting.

`getBoundingClientRect()` reports a box AFTER transforms. `left` positions a
box BEFORE them. **Nine of the seventeen pieces on the home page carry a CSS
`transform`** — the `left: 50%` + `translateX(-50%)` centring recipe, plus the
mirrored ones — so measuring with the rect and writing back as `left` applied
each of those transforms twice, and the piece leapt by exactly its own
translate the instant it was touched. That was the site owner's *"when I move
the hero__ridge, it snaps to a spot"*, and `hero__ridge` was only the loudest
of nine:

    hero__ridge  -1389.9px   origin__snow  -1526.7px   origin__lamp  -1351.7px
    hero__mid    -1275.8px   origin__pines -1218.6px   hero__rear    -1180.6px
    origin__tops -1123.4px   hero__cloud    -799.5px   hero__weather   -47.1px

`offsetLeft` / `offsetTop` / `offsetWidth` are the layout numbers, before every
transform and before the standalone `translate` the motion hooks write, and
`clientWidth` of the offset parent is the box a percentage actually resolves
against. Use those. There is a round-trip audit in the scratchpad note below
that catches a regression here in about two minutes.

**How to check it:** for every `.scene__art`, measure with `measurePlacement`,
write the result straight back as inline style, and re-measure. Nothing may
move. Before the fix, 9 of 17 moved by hundreds of pixels; after it, 44 of 46
rows across both themes and five scroll beats move by 0.0px and two move by
under a pixel (integer rounding in `offsetTop`, which only ever affects the
first grab of an untouched piece).

---

## Resizing, and what the ratio lock actually locks

Eight grips, one per edge and corner, plus a rotate knob on a stalk above the
top edge. The opposite edge is the anchor: growing from the west grip moves
`left` by exactly what the width gained; the east grip does not touch `left` at
all. That offset is derived from the FINAL size rather than from the pointer
delta, so it is still right after the ratio lock has overridden one of the two
axes.

The pointer delta is projected onto the piece's own axes before any of that, so
a rotated piece grows along the edge whose grip you are holding rather than
along the screen. At 0deg the projection is the identity, which is every piece
until somebody rotates one.

**Ratio locked** drives from one axis — horizontal wherever there is a
horizontal edge, because `w` is the number the draft stores — and derives the
other. It then writes only `w` if the stylesheet is deriving the height from an
`aspect-ratio`, and both if it is not (the band plates state a height and crop
with `object-fit`; leaving their height alone would make the box refuse to
follow the grip). **Unlocked** writes both, independently, and the Height field
appears in the panel beside Width.

Verified by driving real mouse events at every grip in both ratio states in
both themes — 32 cases, anchored edge holding to within 0.3px and the dragged
edge landing within 0.3px of the pointer.

---

## Motion is a choice of component, never a flag

`still`, `drift`, `sway` and `hero` map onto no hook, `useParallax`, `useSway`
and `useHeroParallax`. Each of those owns `element.style.translate` outright,
so two on one element race inside a frame and the layer stutters. The editor
therefore offers them as exclusive choices and `buildArt` in
`components/scene/ThemedArt.tsx` returns a different COMPONENT for each, which
unmounts the old one and runs its cleanup. Do not turn this into a prop.

---

## Saving

| Where | What happens |
| --- | --- |
| `vite dev` | `POST /__scene` → `scripts/scene-draft-plugin.mjs` writes `public/scene/draft.json` in the working tree. It shows up in `git status`. |
| A built site | No endpoint exists (`apply: 'serve'`), and `store.ts` does not even ask. The draft goes to `localStorage` and the panel says so; **Download** hands over the JSON. |

`localStorage` is also written in dev, and is read FIRST on load, so an unsaved
edit survives a reload. **Clear** empties both.

---

## Things that were tried and are wrong

- **One sticker layer over the whole page instead of seven section hosts.** It
  is one line instead of seven and it puts every added piece in front of every
  section's background, because a later sibling paints over an earlier one.
  Half the reason to add a palm is to put it behind the copy and in front of
  the floor, which is a question about that section's own stack.
- **`z: -1` as the default for a dropped piece.** Scenery usually wants to be
  behind the words, and the host is its section's last child, so -1 put a
  freshly dropped palm behind the palm row already there and the drop looked
  like it had done nothing. A piece you cannot see is a piece you cannot place.
- **`pointer-events` on the art in edit mode instead of a pick sheet.** The art
  sits over the copy in several sections, so the page's own links stop
  answering the moment the editor opens.
- **`elementFromPoint` to find the section under a drop.** The pick sheet is a
  fixed box over the viewport, so the singular call returns the sheet every
  time and the drop silently does nothing. `elementsFromPoint` and the first
  entry inside a section.
- **Letting the hover hit-test write the click-cycle counter.** Every first
  click then selected the layer BEHIND the one under the cursor.
- **Cycling the selection on every `pointerdown`.** Correct-looking until there
  are two layers under the cursor: select a palm, press on it to drag it, and
  the press re-picks and hands you the sand behind it — measured on `#games`,
  where dragging the selected `games__pines` moved `games__fog` and the palm
  row did not shift by a pixel. Pressing keeps the current selection when it is
  one of the things under the cursor; only a CLICK, pressed and released
  without moving, steps behind.
- **Measuring with `getBoundingClientRect()`.** See the round-trip section
  above. This is the one that will be re-introduced by somebody tidying up.
- **Drawing the selection outline on the rect.** A rotated element's rect is
  its axis-aligned bounding box, so the outline became a box the piece rattled
  around inside with its grips nowhere near the edges they resize. The outline
  is built from the layout size and the rect's CENTRE — which a rotation about
  the default origin leaves exactly where it was — and then turned by the same
  angle.
- **Deriving that angle from the computed `transform` matrix.** Nine pieces
  carry one and every one of them is a translate or a mirror;
  `matrix(-1, 0, 0, 1, ...)` decomposes to 180deg of rotation, which is true of
  the maths and false of the picture. Only the standalone `rotate` property is
  read.
- **A dock pinned `top: 12px; bottom: 12px`.** A column of chrome down the
  whole right edge whatever is in it. It is `max-height: min(74svh, 660px)`
  with the body scrolling, it can be anchored to either edge, it can be dragged
  anywhere by its header, and Reset returns it to its anchor.

All of them were found by rendering it or by driving it, which is
`AGENTS.md` §7.0.0.
