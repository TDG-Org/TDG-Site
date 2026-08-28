import { useId, useState, type ReactNode } from 'react'
import { Button, Field, Select, Tag, TextArea, TextInput } from './controls'

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
  children: ReactNode
}) {
  return (
    <div className="dev__field dev__ov" data-edited={edited || undefined}>
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
          ) : (
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
}) {
  const rows = value ?? builtIn
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
        onChange={onChange}
        blank={blank}
        addLabel={addLabel}
        nameOf={nameOf}
        empty={empty}
        render={render}
      />
    </Overridden>
  )
}

/* ── small shared pieces ───────────────────────────────────────────────── */

/** A plain labelled line inside a row, with no override frame of its own. */
export function RowField({
  label,
  value,
  onChange,
  placeholder,
  area,
  rows = 2,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  area?: boolean
  rows?: number
}) {
  const id = useId()
  return (
    <Field label={label} htmlFor={id}>
      {area ? (
        <TextArea id={id} value={value} onChange={onChange} rows={rows} placeholder={placeholder} />
      ) : (
        <TextInput id={id} value={value} onChange={onChange} placeholder={placeholder} />
      )}
    </Field>
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
