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

`x` and `y` are percentages of the element's **offset parent**; `w` is `vw`.
Both are in `types.ts` with the argument, and the short version is that a draft
made on a 1904px window has to mean the same thing on a 1280px one. A pixel
offset does not; a percentage of the box the layer is actually positioned
inside does.

Only the fields that were touched are written. An absent field is not a zero —
it is "the stylesheet still decides", which is what keeps a dragged piece's
mask, `object-position` and clamps intact.

`apply.ts` writes `left`/`top` **and** `right: auto`/`bottom: auto` together,
because most of these rules anchor from the far edge and a box with `left`,
`right` and `width` all resolved silently ignores one of them.

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

All five were found by rendering it, which is `AGENTS.md` §7.0.0.
