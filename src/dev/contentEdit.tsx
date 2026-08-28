import { useId, useState, type ReactNode } from 'react'
import { Button, Field, Select, Tag, TextArea, TextInput } from './controls'

/** Two values that serialise the same ARE the same, for an editor whose
 *  overrides are plain JSON. Used to collapse an override that has been
 *  edited back into agreement with the repo. */
export const sameJson = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a) === JSON.stringify(b)

/**
 * The editing primitives the Content tab is built from.
 *
 * ## The one idea in this file
 *
 * Everything here edits an OVERRIDE, not a value. Behind every box is a
 * built-in string from `src/data/`, and the box holds either that string or
 * one somebody typed over it. So each control has to answer two questions at a
 * glance — *what does the site say* and *is that ours or the repo's* — and it
 * has to offer the way back. That is `Overridden`: a heading row with an
 * `EDITED` tag and a `Reset` beside it, and, under an edited field, the
 * built-in value written out so putting it back never means going to find it.
 *
 * A field typed back to exactly its built-in text drops its override rather
 * than storing an identical copy. That is not tidiness either: an override
 * frozen at today's wording would silently stop tracking the repo, so the day
 * somebody fixes that line in `content.ts` the site would go on printing the
 * old one with nothing on screen to say why.
 *
 * ## Why the lists are one component
 *
 * Chips, facts, links, steps, features, Q&As and signposts are seven different
 * shapes of the same interaction: an ordered list of small records that can be
 * added to, reordered and thinned out. One `RowList` with a render prop keeps
 * the move buttons, the remove confirmations, the empty state and the keyboard
 * order identical across all seven — seven hand-written versions is seven
 * chances for one of them to be missing its Move Up.
 */

/* ── the override frame ────────────────────────────────────────────────── */

/**
 * The heading row every editable thing wears: its name, whether it has been
 * overridden, and the way back to the built-in value.
 */
export function Overridden({
  label,
  htmlFor,
  edited,
  onReset,
  right,
  children,
  hint,
  was,
  compact,
}: {
  label: string
  htmlFor?: string
  edited: boolean
  onReset: () => void
  /** Anything non-interactive to sit beside the tag. */
  right?: ReactNode
  hint?: ReactNode
  /** What the repo says, printed under an edited control. */
  was?: ReactNode
  /**
   * For a field INSIDE a composite — the cover's own Title, a section's own
   * Tag. It keeps the Reset, which is the whole point, and drops the frame and
   * the standing `BUILT-IN` tag: a section editor with four of those per
   * section and eight sections is thirty-two badges saying nothing happened,
   * which is how the one badge that means something stops being seen.
   */
  compact?: boolean
  children: ReactNode
}) {
  return (
    <div
      className={compact ? 'dev__field dev__ov dev__ov--compact' : 'dev__field dev__ov'}
      data-edited={edited || undefined}
    >
      <div className="dev__ov-head">
        <label className="dev__label" htmlFor={htmlFor}>
          {label}
        </label>
        <span className="dev__ov-right">
          {right}
          {edited ? (
            <>
              <Tag tone="warn">EDITED</Tag>
              <button type="button" className="dev__ov-reset" onClick={onReset}>
                Reset
              </button>
            </>
          ) : compact ? null : (
            <Tag>BUILT-IN</Tag>
          )}
        </span>
      </div>
      {children}
      {hint && <p className="dev__hint">{hint}</p>}
      {edited && was !== undefined && (
        <p className="dev__hint dev__was">
          <span className="dev__was-label">Built in</span>
          {was}
        </p>
      )}
    </div>
  )
}

/** One line or one paragraph of copy, over a built-in one. */
export function TextOverride({
  label,
  builtIn,
  value,
  onChange,
  hint,
  area,
  rows = 3,
  placeholder,
}: {
  label: string
  builtIn: string
  /** `undefined` means the built-in value is what the site prints. */
  value: string | undefined
  onChange: (next: string | undefined) => void
  hint?: ReactNode
  area?: boolean
  rows?: number
  placeholder?: string
}) {
  const id = useId()
  const shown = value ?? builtIn
  // Typed back to the built-in text: drop the override, so the field goes on
  // tracking the repo. See this file's header.
  const set = (v: string) => onChange(v === builtIn ? undefined : v)

  return (
    <Overridden
      label={label}
      htmlFor={id}
      edited={value !== undefined}
      onReset={() => onChange(undefined)}
      hint={hint}
      was={builtIn ? <q>{builtIn}</q> : <em>nothing</em>}
    >
      {area ? (
        <TextArea id={id} value={shown} onChange={set} rows={rows} placeholder={placeholder} />
      ) : (
        <TextInput id={id} value={shown} onChange={set} placeholder={placeholder} />
      )}
    </Overridden>
  )
}

/** One of a fixed set of values, over a built-in one. */
export function SelectOverride<T extends string>({
  label,
  builtIn,
  value,
  options,
  onChange,
  hint,
}: {
  label: string
  builtIn: T
  value: T | undefined
  options: { value: T; label: string }[]
  onChange: (next: T | undefined) => void
  hint?: ReactNode
}) {
  const id = useId()
  const shown = value ?? builtIn
  const labelOf = (v: T) => options.find((o) => o.value === v)?.label ?? v

  return (
    <Overridden
      label={label}
      htmlFor={id}
      edited={value !== undefined}
      onReset={() => onChange(undefined)}
      hint={hint}
      was={<q>{labelOf(builtIn)}</q>}
    >
      <Select
        id={id}
        value={shown}
        options={options}
        onChange={(v) => onChange(v === builtIn ? undefined : (v as T))}
      />
    </Overridden>
  )
}

/* ── ordered lists of small records ────────────────────────────────────── */

/**
 * An add / reorder / remove list, shared by every repeating thing on this tab.
 *
 * Move Up and Move Down rather than a drag: a drag needs a pointer, has no
 * keyboard story without building one, and gives a screen reader nothing to
 * announce. Two buttons are reachable by Tab, are disabled at the ends so the
 * list says where you are, and name what they move in their `aria-label`, so
 * "Move chip 2, WINDOWS, up" is what gets read out rather than "button".
 */
export function RowList<T>({
  rows,
  onChange,
  blank,
  addLabel,
  nameOf,
  empty,
  render,
  rowReset,
}: {
  rows: T[]
  onChange: (next: T[]) => void
  /** A new, empty row. */
  blank: () => T
  addLabel: string
  /** What one row is called, for the move and remove labels. */
  nameOf: (row: T, i: number) => string
  /** What an empty list says. A list with nothing in it is a real state. */
  empty: string
  render: (row: T, set: (next: T) => void, i: number) => ReactNode
  /**
   * Put ONE row back the way the repo has it, where that question has an
   * answer. Return null for a row it does not — a section somebody added here,
   * or one already identical to its built-in twin — and no button is drawn,
   * because a reset that would do nothing is a control that has to be pressed
   * to find that out.
   */
  rowReset?: (row: T, i: number) => (() => void) | null
}) {
  const move = (i: number, by: number) => {
    const next = [...rows]
    const [row] = next.splice(i, 1)
    next.splice(i + by, 0, row)
    onChange(next)
  }

  return (
    <div className="dev__rows">
      {rows.length === 0 && <p className="dev__rows-empty">{empty}</p>}

      {rows.map((row, i) => (
        <div className="dev__rowitem" key={i}>
          <div className="dev__rowitem-head">
            <span className="dev__rowitem-n">{i + 1}</span>
            <span className="dev__rowitem-name">{nameOf(row, i) || <em>untitled</em>}</span>
            <span className="dev__rowitem-btns">
              {(() => {
                const reset = rowReset?.(row, i)
                return reset ? (
                  <button
                    type="button"
                    className="dev__mini"
                    aria-label={`Reset ${nameOf(row, i) || `item ${i + 1}`} to the built-in version`}
                    title="Put this one back the way the repo has it"
                    onClick={reset}
                  >
                    ↺
                  </button>
                ) : null
              })()}
              <button
                type="button"
                className="dev__mini"
                disabled={i === 0}
                aria-label={`Move ${nameOf(row, i) || `item ${i + 1}`} up`}
                onClick={() => move(i, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                className="dev__mini"
                disabled={i === rows.length - 1}
                aria-label={`Move ${nameOf(row, i) || `item ${i + 1}`} down`}
                onClick={() => move(i, 1)}
              >
                ↓
              </button>
              <button
                type="button"
                className="dev__mini dev__mini--bad"
                aria-label={`Remove ${nameOf(row, i) || `item ${i + 1}`}`}
                onClick={() => onChange(rows.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </span>
          </div>
          <div className="dev__rowitem-body">
            {render(row, (next) => onChange(rows.map((r, j) => (j === i ? next : r))), i)}
          </div>
        </div>
      ))}

      <div className="dev__row">
        <Button onClick={() => onChange([...rows, blank()])}>{addLabel}</Button>
      </div>
    </div>
  )
}

/** A `RowList` wrapped in the override frame, for a list that replaces one. */
export function ListOverride<T>({
  label,
  builtInCount,
  value,
  builtIn,
  onChange,
  hint,
  blank,
  addLabel,
  nameOf,
  empty,
  render,
  rowReset,
}: {
  label: string
  builtInCount: number
  value: T[] | undefined
  builtIn: T[]
  onChange: (next: T[] | undefined) => void
  hint?: ReactNode
  blank: () => T
  addLabel: string
  nameOf: (row: T, i: number) => string
  empty: string
  render: (row: T, set: (next: T) => void, i: number) => ReactNode
  rowReset?: (row: T, i: number) => (() => void) | null
}) {
  const rows = value ?? builtIn
  /*
   * Edited back into agreement with the repo drops the override, exactly as a
   * text field typed back to its built-in words does. An override frozen at a
   * list identical to today's would silently stop tracking `src/data/`, so the
   * day somebody fixes that list in the repo the site would go on printing the
   * old one with nothing on screen to say why.
   */
  const set = (next: T[] | undefined) =>
    onChange(next !== undefined && sameJson(next, builtIn) ? undefined : next)

  return (
    <Overridden
      label={label}
      edited={value !== undefined}
      onReset={() => onChange(undefined)}
      right={<span className="dev__ov-count">{rows.length}</span>}
      hint={hint}
      was={`${builtInCount} ${builtInCount === 1 ? 'entry' : 'entries'}`}
    >
      <RowList
        rows={rows}
        onChange={set}
        blank={blank}
        addLabel={addLabel}
        nameOf={nameOf}
        empty={empty}
        render={render}
        rowReset={rowReset}
      />
    </Overridden>
  )
}

/* ── small shared pieces ───────────────────────────────────────────────── */

/**
 * One line inside a composite — the cover's Title, a section's Tag.
 *
 * Give it `builtIn` and it gets its own Reset, in the compact frame: the
 * composite above it can only be reset WHOLE, and "put the scene back but keep
 * my new line" was otherwise a thing you had to do by remembering the old value
 * and retyping it. Without `builtIn` it is what it always was, a plain labelled
 * field — used where the repo has no counterpart to go back to, such as a row
 * somebody added here.
 */
export function RowField({
  label,
  value,
  onChange,
  placeholder,
  area,
  rows = 2,
  builtIn,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  area?: boolean
  rows?: number
  /** What the repo says for this one line. Undefined where it says nothing. */
  builtIn?: string
}) {
  const id = useId()
  const input = area ? (
    <TextArea id={id} value={value} onChange={onChange} rows={rows} placeholder={placeholder} />
  ) : (
    <TextInput id={id} value={value} onChange={onChange} placeholder={placeholder} />
  )

  if (builtIn === undefined) {
    return (
      <Field label={label} htmlFor={id}>
        {input}
      </Field>
    )
  }

  return (
    <Overridden
      compact
      label={label}
      htmlFor={id}
      edited={value !== builtIn}
      onReset={() => onChange(builtIn)}
      was={builtIn ? <q>{builtIn}</q> : <em>nothing</em>}
    >
      {input}
    </Overridden>
  )
}

/**
 * The reset for one whole panel of the Content tab.
 *
 * Between the per-field Reset and the one that puts a whole product back, there
 * was nothing — so undoing an afternoon on a card's words meant pressing Reset
 * on six fields in turn, and the only single press available also threw away
 * the cover and the page you had not touched. This is that middle: it clears
 * exactly the fields the panel it sits in owns, and it says how many that is
 * before it is pressed.
 *
 * Disabled at zero rather than hidden. A reset that vanishes when there is
 * nothing to reset is a control you have to remember exists; one that is there
 * and greyed is an answer to "has anything in here been changed".
 */
export function PanelReset({
  label,
  what,
  n,
  onReset,
}: {
  /** Title Case, naming what it puts back: `Reset Card Words`. */
  label: string
  what: ReactNode
  /** How many of this panel's fields are overridden. */
  n: number
  onReset: () => void
}) {
  return (
    <>
      <hr className="dev__rule" />
      <div className="dev__action dev__action--last">
        <div className="dev__action-text">
          <p className="dev__action-title">{label}</p>
          <p className="dev__hint">{what}</p>
        </div>
        <div className="dev__action-controls">
          <Tag tone={n ? 'warn' : 'plain'}>{n ? `${n} EDITED` : 'BUILT-IN'}</Tag>
          <Button onClick={onReset} disabled={n === 0}>
            Reset
          </Button>
        </div>
      </div>
    </>
  )
}

/**
 * A file from `public/`, shown at the size the site draws it, with a face for
 * the one failure that matters: a filename that is not there.
 *
 * The console cannot upload — this site is static and its images live in the
 * repo — so the only thing it can get wrong about a picture is naming a file
 * that does not exist, and that fails INVISIBLY on a card (a blank box reads
 * as a slow network). Here it says so in words, next to the box that caused
 * it.
 */
export function AssetPreview({
  src,
  alt,
  missing,
  frame = 'icon',
}: {
  src: string
  alt: string
  /** The sentence shown when the file is not there. */
  missing: string
  frame?: 'icon' | 'wide'
}) {
  const [state, setState] = useState<'loading' | 'ok' | 'gone'>('loading')

  return (
    <div className="dev__asset" data-frame={frame} data-state={state}>
      {/* Keyed on the src so a retyped filename starts a fresh load rather
          than keeping the previous file's verdict. */}
      <img
        key={src}
        className="dev__asset-img"
        src={src}
        alt={alt}
        onLoad={() => setState('ok')}
        onError={() => setState('gone')}
      />
      {state === 'gone' && <p className="dev__asset-gone">{missing}</p>}
    </div>
  )
}
