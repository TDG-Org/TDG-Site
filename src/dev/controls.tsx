import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { sectionDomId, useSections } from '../lib/sections'
import { fmtAgeShort, fmtRelative } from './format'
import { hay, useSearch } from './search'

/**
 * The Developer console's control set.
 *
 * Every one of these is custom-styled down to its states. The site's rule is
 * that nothing ships wearing the browser's default look, and a console full of
 * raw checkboxes and grey `<select>`s would be the loudest possible exception.
 * They live here rather than beside each panel so that the fifteen switches on
 * this page cannot drift into fifteen slightly different switches.
 */

/* ── layout ────────────────────────────────────────────────────────────── */

/**
 * One titled, collapsible block of the console.
 *
 * `what` is the sentence that makes the panel usable by somebody who did not
 * write it: what this section IS, and what changing it does. `writes` names the
 * actual table underneath, because when something looks wrong the next question
 * is always "where does that live?". Both stay visible while collapsed, so a
 * shut page still reads as an index rather than as a stack of ten mystery
 * headings.
 *
 * Collapsed by default. See `sections.tsx` for why, and for how Expand All
 * finds panels it never rendered itself.
 *
 * `right` sits inside the header BUTTON, so whatever goes there must be
 * non-interactive: a Tag or a span, never a control. It is the summary a shut
 * panel is judged on: the tier, the pack count, whether there are unsaved
 * edits. So keep putting one there.
 */
export function Panel({
  id,
  title,
  what,
  writes,
  tone = 'plain',
  right,
  terms,
  matchCount,
  children,
}: {
  /** Stable section id. Defaults to the title, which is unique per page. */
  id?: string
  title: string
  what: string
  writes?: string
  tone?: 'plain' | 'danger'
  right?: ReactNode
  /**
   * What this section is ABOUT, for the page search: the account's email, the
   * tier, the pack ids, whatever a person would type looking for it. The title
   * and the `what` sentence are searched anyway, so this is only the data.
   */
  terms?: (string | number | null | undefined | readonly string[])[]
  /**
   * For a section holding a list: how many of its rows match. A section with
   * matching rows is a hit even when none of its own words are, which is what
   * makes searching a ledger by an amount work.
   */
  matchCount?: number
  children: ReactNode
}) {
  const sectionId = id ?? title
  const { isOpen, toggle, register } = useSections()
  const search = useSearch()
  useEffect(() => register(sectionId), [register, sectionId])

  /*
   * A search overrides the manual open state rather than replacing it: hits
   * render open, and `override` lets you shut one anyway. Both reset the moment
   * the query changes, and neither touches the shared open set, so clearing the
   * box puts the page back exactly as you had arranged it.
   */
  const [override, setOverride] = useState<boolean | null>(null)
  useEffect(() => setOverride(null), [search.query])

  const hit =
    !search.active ||
    (matchCount ?? 0) > 0 ||
    search.matches(hay(title, what, writes, ...(terms ?? [])))

  // A section nothing matched is not dimmed, it is gone. Twelve greyed headings
  // around the one you wanted is the noise the search was meant to remove.
  if (search.active && !hit) return null

  const open = search.active ? (override ?? true) : isOpen(sectionId)
  const onToggle = () => (search.active ? setOverride(!open) : toggle(sectionId))
  const regionId = sectionDomId(sectionId, 'dev-sec')

  return (
    <section
      className="dev__panel"
      data-tone={tone}
      data-open={open || undefined}
      // What Refresh and a reload hold still. Keyed on the section rather than
      // on the account, so the DevFleet Store panel stays the thing you were
      // looking at even after its contents are re-read. See viewState.ts.
      data-dev-anchor={regionId}
    >
      {/* The button lives inside the heading rather than around it, so the
          section still has a heading in the outline when it is shut. */}
      <h3 className="dev__panel-heading">
        <button
          type="button"
          className="dev__panel-head"
          aria-expanded={open}
          aria-controls={regionId}
          onClick={onToggle}
        >
          <span className="dev__panel-chevron" aria-hidden="true">
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              focusable="false"
            >
              <path d="m9 18 6-6-6-6" />
            </svg>
          </span>
          <span className="dev__panel-titles">
            <span className="dev__panel-title">{title}</span>
            <span className="dev__panel-what">{what}</span>
          </span>
          {search.active && matchCount != null && (
            <span className="dev__panel-hits">
              {matchCount} match{matchCount === 1 ? '' : 'es'}
            </span>
          )}
          {right && <span className="dev__panel-right">{right}</span>}
        </button>
      </h3>

      {/* A 0fr → 1fr grid row rather than a measured max-height: the content
          here changes size while it is open (a confirm box opens, a warning
          appears), and a measured height would need re-measuring every time. */}
      <div className="dev__panel-region" id={regionId} inert={!open}>
        <div className="dev__panel-region-inner">
          <div className="dev__panel-body">{children}</div>
          {writes && (
            <footer className="dev__panel-foot">
              <span className="dev__panel-foot-label">Writes to</span>
              <code className="dev__code">{writes}</code>
            </footer>
          )}
        </div>
      </div>
    </section>
  )
}

/**
 * Where the matches ARE, and the way to go and read them.
 *
 * The search filters the section you are standing in, and the console has five.
 * Before this, the toolbar answered "12 reports match" in a sentence you could
 * not click, so finding them meant reading the sentence, remembering the word,
 * and going to look for the right tab. Every count here is a button that takes
 * you to the section it counted, with the query intact.
 *
 * A section with no hits stays live rather than being disabled: going somewhere
 * to see for yourself that nothing matches is a legitimate thing to do, and a
 * dead button is a worse answer than a zero.
 *
 * `count: null` means "this section does not count ahead of time" — the Content
 * tab filters its own panels as you type, and there is no honest number to put
 * here for it. It draws a dash. A zero would be a claim, and it would be wrong.
 */
export type SearchSection = {
  id: string
  label: string
  /** Hits for the current query, or null for a section that cannot say. */
  count: number | null
  active: boolean
  onPick: () => void
}

function SectionFilter({ sections, searching }: { sections: SearchSection[]; searching: boolean }) {
  return (
    <div className="dev__scope">
      <span className="dev__scope-label" id="dev-scope-label">
        Search in
      </span>
      <div className="dev__scope-list" role="group" aria-labelledby="dev-scope-label">
        {sections.map((sec) => (
          <button
            key={sec.id}
            type="button"
            className="dev__scope-btn"
            data-active={sec.active || undefined}
            data-empty={(searching && sec.count === 0) || undefined}
            aria-current={sec.active ? 'page' : undefined}
            onClick={sec.onPick}
            title={
              sec.count === null
                ? `${sec.label} filters its own panels as you type, so it has no count to show ahead of time`
                : searching
                  ? `${sec.count} match${sec.count === 1 ? '' : 'es'} in ${sec.label}`
                  : `Go to ${sec.label}`
            }
          >
            {sec.label}
            {searching && (
              <span className="dev__scope-n">{sec.count === null ? '·' : sec.count}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * The page toolbar: one search box, a section filter, and Expand All /
 * Collapse All.
 *
 * The search filters every section on the page at once, and the rows inside
 * them, with no debounce anywhere. See `search.tsx`.
 *
 * The two section buttons go quiet while a search is running, because a search
 * is already deciding what is open: pressing Expand All would change the shared
 * open set and you would see nothing happen, which is worse than a button that
 * says it is not for now. Clearing the box hands the page back exactly as you
 * had arranged it.
 */
export function SectionControls({
  hint,
  sections,
}: {
  hint?: ReactNode
  /** The five tabs, each with its hit count. Omit for a page with one. */
  sections?: SearchSection[]
}) {
  const { expandAll, collapseAll, openCount, total } = useSections()
  const { query, setQuery, active } = useSearch()
  const id = useId()

  return (
    <div className="dev__toolbar">
      <div className="dev__toolbar-search">
        <label className="dev__sr-only" htmlFor={id}>
          Search the whole page
        </label>
        <span className="dev__search-icon" aria-hidden="true">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            focusable="false"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.6-3.6" />
          </svg>
        </span>
        <input
          id={id}
          type="text"
          className="dev__input dev__search-input"
          value={query}
          placeholder="Search everything: a name, an email, a pack, an amount, an action"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setQuery(e.target.value)}
          // Escape clears rather than blurring, which is what every search box
          // that has ever been useful does.
          onKeyDown={(e) => {
            if (e.key === 'Escape' && query) {
              e.preventDefault()
              setQuery('')
            }
          }}
        />
        {active && (
          <button
            type="button"
            className="dev__search-clear"
            aria-label="Clear the search"
            onClick={() => setQuery('')}
          >
            ×
          </button>
        )}
      </div>

      {sections && sections.length > 0 && (
        <SectionFilter sections={sections} searching={active} />
      )}

      <div className="dev__toolbar-right">
        <span className="dev__sections-count">
          {active ? hint : `${openCount} of ${total} sections open`}
        </span>
        <div className="dev__sections-btns">
          <Button
            onClick={expandAll}
            disabled={active || total === 0 || openCount === total}
            title={active ? 'The search is choosing what is open' : undefined}
          >
            Expand All
          </Button>
          <Button
            onClick={collapseAll}
            disabled={active || openCount === 0}
            title={active ? 'The search is choosing what is open' : undefined}
          >
            Collapse All
          </Button>
        </div>
      </div>
    </div>
  )
}

/** A label + optional hint wrapped around one control. */
export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string
  hint?: ReactNode
  htmlFor?: string
  children: ReactNode
}) {
  return (
    <div className="dev__field">
      <label className="dev__label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && <p className="dev__hint">{hint}</p>}
    </div>
  )
}

/** A read-only fact: name on the left, value on the right, copyable if asked. */
export function Fact({
  label,
  value,
  copy,
  mono,
}: {
  label: string
  value: ReactNode
  copy?: string
  mono?: boolean
}) {
  return (
    <div className="dev__fact">
      <span className="dev__fact-label">{label}</span>
      <span className="dev__fact-value" data-mono={mono || undefined}>
        {value}
        {copy && <CopyButton value={copy} />}
      </span>
    </div>
  )
}

export function CopyButton({ value, label }: { value: string; label?: string }) {
  const [done, setDone] = useState(false)
  const timer = useRef<number | null>(null)

  const copy = useCallback(() => {
    void navigator.clipboard?.writeText(value).then(
      () => {
        setDone(true)
        if (timer.current) window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => setDone(false), 1400)
      },
      () => undefined,
    )
  }, [value])

  /*
   * The 1400ms is a real window in which this button can leave the page: every
   * Fact on the account detail carries one, and clicking a different account
   * unmounts all of them at once. Without this the timer still fires and calls
   * setState on a component that no longer exists.
   *
   * React 19 dropped the warning that used to make that loud, so it now fails
   * silently — which is the reason to clear it here rather than to trust that
   * nobody has noticed a problem.
   */
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current)
    },
    [],
  )

  return (
    // `label` for a value too long to be its own name: "Copy report #142" is
    // hearable, a five-paragraph aria-label read out in full is not.
    <button type="button" className="dev__copy" onClick={copy} aria-label={label ?? `Copy ${value}`}>
      {done ? 'Copied' : 'Copy'}
    </button>
  )
}

/* ── inputs ────────────────────────────────────────────────────────────── */

export function TextInput({
  value,
  onChange,
  placeholder,
  id,
  disabled,
  maxLength,
  type = 'text',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  id?: string
  disabled?: boolean
  maxLength?: number
  type?: 'text' | 'search'
}) {
  return (
    <input
      id={id}
      className="dev__input"
      type={type}
      value={value}
      disabled={disabled}
      maxLength={maxLength}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

export function TextArea({
  value,
  onChange,
  id,
  rows = 3,
  maxLength,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  id?: string
  rows?: number
  maxLength?: number
  placeholder?: string
}) {
  return (
    <textarea
      id={id}
      className="dev__input dev__textarea"
      rows={rows}
      value={value}
      maxLength={maxLength}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

/**
 * A `<select>` with the native chrome removed and the site's own put back.
 *
 * The popup list itself is drawn by the operating system and cannot be styled.
 * That is true of every select on the web, and replacing it with a div listbox
 * would cost the keyboard and screen-reader behaviour the browser gives free.
 * The control, its chevron, its focus ring and its disabled state are all ours.
 */
export function Select({
  value,
  onChange,
  options,
  id,
  disabled,
  ariaLabel,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  id?: string
  disabled?: boolean
  /**
   * For a select whose name is on screen but not in a `<label>` — the state
   * picker on a pack tile, whose name is the tile's own heading. A control
   * announced as "combo box" and nothing else is a control a screen reader
   * cannot tell from the five beside it.
   */
  ariaLabel?: string
}) {
  return (
    <span className="dev__select-wrap" data-disabled={disabled || undefined}>
      <select
        id={id}
        className="dev__select"
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <svg
        className="dev__select-chevron"
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </span>
  )
}

/**
 * A select of known values with an "Other…" escape to a free-text box.
 *
 * `subscriptions.tier` has no CHECK constraint, so a tier can ship in an app
 * before this console knows about it. A dropdown alone would make the console
 * the thing blocking the fix; a text box alone would invite typos into a column
 * every app gates on. This is both, in that order.
 */
export function Combo({
  value,
  onChange,
  options,
  id,
  otherLabel = 'Other…',
}: {
  value: string
  onChange: (v: string) => void
  options: string[]
  id?: string
  otherLabel?: string
}) {
  const known = options.includes(value)
  const [custom, setCustom] = useState(!known && value !== '')

  return (
    <span className="dev__combo">
      <Select
        id={id}
        value={custom ? '__other__' : value}
        onChange={(v) => {
          if (v === '__other__') {
            setCustom(true)
            return
          }
          setCustom(false)
          onChange(v)
        }}
        options={[
          ...options.map((o) => ({ value: o, label: o })),
          { value: '__other__', label: otherLabel },
        ]}
      />
      {custom && (
        <TextInput value={value} onChange={onChange} placeholder="tier id" maxLength={32} />
      )}
    </span>
  )
}

/**
 * A labelled on/off switch.
 *
 * `role="switch"` on a real button rather than a restyled checkbox: the button
 * brings the keyboard behaviour with it, and there is no invisible input to
 * fall out of sync with what is painted.
 */
export function Switch({
  checked,
  onChange,
  label,
  hint,
  disabled,
  busy,
  tone = 'plain',
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  hint?: ReactNode
  disabled?: boolean
  busy?: boolean
  tone?: 'plain' | 'danger'
}) {
  const id = useId()
  return (
    <div className="dev__switch-row" data-tone={tone} data-disabled={disabled || undefined}>
      <button
        type="button"
        role="switch"
        id={id}
        aria-checked={checked}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="dev__switch"
        disabled={disabled || busy}
        data-busy={busy || undefined}
        onClick={() => onChange(!checked)}
      >
        <span className="dev__switch-knob" />
      </button>
      <div className="dev__switch-text">
        <label className="dev__switch-label" htmlFor={id}>
          {label}
        </label>
        {hint && (
          <p className="dev__hint" id={`${id}-hint`}>
            {hint}
          </p>
        )}
      </div>
    </div>
  )
}

/* ── buttons and tags ──────────────────────────────────────────────────── */

export function Button({
  children,
  onClick,
  variant = 'ghost',
  disabled,
  busy,
  title,
  type = 'button',
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'ghost' | 'danger'
  disabled?: boolean
  busy?: boolean
  title?: string
  type?: 'button' | 'submit'
}) {
  return (
    <button
      type={type}
      title={title}
      className="dev__btn"
      data-variant={variant}
      disabled={disabled || busy}
      onClick={onClick}
    >
      {busy && <span className="dev__btn-spinner" aria-hidden="true" />}
      {children}
    </button>
  )
}

export function Tag({
  children,
  tone = 'plain',
  title,
}: {
  children: ReactNode
  tone?: 'plain' | 'ok' | 'warn' | 'bad' | 'hot'
  title?: string
}) {
  return (
    <span className="dev__tag" data-tone={tone} title={title}>
      {children}
    </span>
  )
}

/** A shut list-section's tag is all it says about itself, so it never reports
 *  zero while the real answer is still in flight. Shared by every ledger tab. */
export function LedgerTag({
  state,
  n,
  noun,
}: {
  state: 'loading' | 'ready' | 'error'
  n: number
  noun: string
}) {
  if (state === 'loading') return <Tag>READING</Tag>
  if (state === 'error') return <Tag tone="bad">UNREADABLE</Tag>
  return (
    <Tag tone={n ? 'ok' : 'plain'}>
      {n} {noun}
    </Tag>
  )
}

/**
 * A checkbox, drawn by us.
 *
 * `OwnTile` is the claimable-tile version of this idea and says its state in
 * words, because granting a pack is a decision. This is the other kind: a row
 * selector in a list of two hundred, where the only thing that matters is
 * whether this one is in the set and how fast you can see that down a column.
 * So it is a 16px box with a tick and no label of its own — the row beside it
 * is the label, and `aria-label` carries that to a screen reader.
 *
 * A real button with `role="checkbox"` rather than a restyled `<input>`: the
 * button brings the keyboard behaviour, and there is no invisible input to fall
 * out of sync with what is painted. `indeterminate` is a real third state, for
 * the header box over a partly-selected list — a box that shows "all" when
 * twelve of two hundred are picked is a box that has told you something false.
 */
export function Check({
  checked,
  indeterminate,
  onChange,
  label,
  disabled,
}: {
  checked: boolean
  indeterminate?: boolean
  onChange: (next: boolean) => void
  /** What this selects, for a screen reader. The row is the visible label. */
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={label}
      className="dev__check"
      data-on={(checked || indeterminate) || undefined}
      data-mixed={indeterminate || undefined}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        {indeterminate ? <path d="M5 12h14" /> : <path d="M20 6 9 17l-5-5" />}
      </svg>
    </button>
  )
}

/**
 * A checkbox drawn as a claimable tile, the shape used for packs and themes.
 *
 * Ownership is the thing being edited, so the tile SAYS whether it is owned
 * rather than relying on a tick alone; "Owned" and "Not owned" is the
 * difference between a free grant and a refund, and it should never come down
 * to squinting at a checkbox.
 */
export function OwnTile({
  name,
  owned,
  onChange,
  busy,
  disabled,
  note,
}: {
  name: string
  owned: boolean
  onChange: (next: boolean) => void
  busy?: boolean
  /** For a tile the server would refuse anyway — an app with no entitlements
   *  table. Offering a switch that cannot take is worse than showing a dead
   *  one, because only one of the two tells you something is wrong. */
  disabled?: boolean
  note?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={owned}
      className="dev__own"
      data-owned={owned || undefined}
      data-busy={busy || undefined}
      data-disabled={disabled || undefined}
      disabled={busy || disabled}
      onClick={() => onChange(!owned)}
    >
      <span className="dev__own-box" aria-hidden="true">
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          focusable="false"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>
      <span className="dev__own-text">
        <span className="dev__own-name">{name}</span>
        <span className="dev__own-state">{owned ? 'Owned' : 'Not owned'}</span>
      </span>
      {note && <span className="dev__own-note">{note}</span>}
    </button>
  )
}

/**
 * One thing an account can hold, and the ONE control that says how it holds it.
 *
 * ## What it replaced, and why
 *
 * A Store pack used to wear two controls: an `OwnTile` switch for whether the
 * account had it, and — rendered only once that switch was on — a separate
 * dropdown for how. Two questions about one fact, in a fixed order, with a
 * wrong answer in between. Making somebody a subscriber meant first granting
 * the pack outright, which wrote a perpetual grant and a purchase-event row
 * that nobody wanted, and only then saying what you actually meant. The first
 * press was a toll, not a decision.
 *
 * So there is one control, its first option is `Not Owned`, and every choice is
 * a single write. Nothing has to be turned on before it can be configured, and
 * there is no order to get right.
 *
 * ## Why it still looks like a tile
 *
 * Because it sits in the same grid `OwnTile` does, beside things that genuinely
 * are one switch — an individual theme is owned or it is not — and a shelf
 * where every item is the same size and shape is one a reader can scan. What
 * changes between them is the control inside, which is the thing that actually
 * differs.
 *
 * ## The sentence under the picker is not decoration
 *
 * It is what the Store's own card will say in that state. A developer choosing
 * `Ends Soon` is choosing a card, not a status string, and the picker showing
 * the card's words is what makes the two agree without anybody checking.
 */
export function HoldingTile({
  name,
  note,
  value,
  options,
  what,
  onChange,
  busy,
  disabled,
}: {
  name: string
  /** A price, a date, `not sold` — whatever this tile says about itself. */
  note?: string
  /** The current state, or `''` for one the site has no reading for. */
  value: string
  options: { value: string; label: string }[]
  /** The sentence for the state currently chosen. */
  what: string
  onChange: (next: string) => void
  busy?: boolean
  /** For a tile the server would refuse anyway — an app with no table. */
  disabled?: boolean
}) {
  const id = useId()
  return (
    <div
      className="dev__hold"
      data-held={(value !== 'none' && value !== '') || undefined}
      data-busy={busy || undefined}
      data-disabled={disabled || undefined}
    >
      <div className="dev__hold-top">
        <span className="dev__hold-name" id={`${id}-name`}>
          {name}
        </span>
        {note && <span className="dev__hold-note">{note}</span>}
      </div>
      <Select
        id={id}
        value={value}
        options={options}
        disabled={busy || disabled}
        ariaLabel={`${name}: how this account holds it`}
        onChange={onChange}
      />
      <p className="dev__hold-what">{what}</p>
    </div>
  )
}

/**
 * A destructive action that has to be typed out before it will run.
 *
 * Not a browser `confirm()`: that is an unstyled OS box whose default button is
 * OK, which is precisely the wrong default for permanent deletion. Typing the
 * account's own name is the only guard that survives a tired click.
 */
export function TypeToConfirm({
  phrase,
  label,
  actionLabel,
  onConfirm,
  busy,
}: {
  phrase: string
  label: ReactNode
  actionLabel: string
  onConfirm: () => void
  busy?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const id = useId()
  const ready = typed.trim() === phrase

  if (!open) {
    return (
      <Button variant="danger" onClick={() => setOpen(true)}>
        {actionLabel}
      </Button>
    )
  }

  return (
    <div className="dev__confirm">
      <p className="dev__confirm-copy">{label}</p>
      <Field
        label="Type it to confirm"
        htmlFor={id}
        hint={
          <>
            Exactly <code className="dev__code">{phrase}</code>
          </>
        }
      >
        <TextInput id={id} value={typed} onChange={setTyped} placeholder={phrase} />
      </Field>
      <div className="dev__row">
        <Button
          variant="danger"
          disabled={!ready}
          busy={busy}
          onClick={() => {
            onConfirm()
            setOpen(false)
            setTyped('')
          }}
        >
          {actionLabel}
        </Button>
        <Button
          onClick={() => {
            setOpen(false)
            setTyped('')
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}

/* ── toasts ────────────────────────────────────────────────────────────── */

export type Toast = { id: number; tone: 'ok' | 'bad'; text: string }

let toastSeq = 0

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([])

  /*
   * Every toast still counting down, by id.
   *
   * There is one of these per message rather than one for the newest, because
   * they overlap: a Refresh that refuses five reads pushes five 9-second
   * toasts inside one frame, and a single handle would leave four of them
   * alive with nothing holding their ids.
   *
   * Kept so they can all be cleared on unmount. Nine seconds is long enough
   * to leave the console — the failure toast is deliberately the long one, so
   * it is also the one most likely to outlive the page it was pushed from —
   * and a timer that fires after that calls setState on a component that is
   * gone. React 19 no longer warns about it, so this fails silently rather
   * than loudly, which is why it survived until an audit went looking.
   */
  const timers = useRef(new Map<number, number>())

  /** Take one toast down, and stop its clock. Both, always: a toast dismissed
   *  by hand used to leave its timer running to filter an id already gone. */
  const dismiss = useCallback((id: number) => {
    const t = timers.current.get(id)
    if (t !== undefined) {
      window.clearTimeout(t)
      timers.current.delete(id)
    }
    setToasts((list) => list.filter((x) => x.id !== id))
  }, [])

  const push = useCallback(
    (tone: 'ok' | 'bad', text: string) => {
      const id = ++toastSeq
      setToasts((list) => [...list, { id, tone, text }])
      // A refusal is something to read; a success is something to notice. The
      // failure sits four times as long for exactly that reason.
      timers.current.set(
        id,
        window.setTimeout(() => dismiss(id), tone === 'ok' ? 2600 : 9000),
      )
    },
    [dismiss],
  )

  useEffect(() => {
    // Captured at effect time rather than read in the cleanup: the ref object
    // itself never changes, and reading `.current` on the way out is the
    // pattern that goes wrong when it does.
    const live = timers.current
    return () => {
      for (const t of live.values()) window.clearTimeout(t)
      live.clear()
    }
  }, [])

  return { toasts, push, dismiss }
}

export function Toasts({
  toasts,
  onDismiss,
}: {
  toasts: Toast[]
  onDismiss: (id: number) => void
}) {
  return (
    <div className="dev__toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="dev__toast" data-tone={t.tone}>
          <span className="dev__toast-text">{t.text}</span>
          <button
            type="button"
            className="dev__toast-x"
            aria-label="Dismiss"
            onClick={() => onDismiss(t.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}

/* ── the refresh rail ──────────────────────────────────────────────────── */

/**
 * Re-read the page, from wherever you are standing on it.
 *
 * ## Why it is pinned
 *
 * The console is a long page and the data on it goes stale while you read it:
 * a payment lands, somebody else grants a pack, you are watching a suspension
 * take effect. The answer to that used to be scrolling back to a Refresh button
 * that only existed on two of the three tabs and only re-read the ledger. So
 * this one is fixed to the side, is on every tab, and re-reads everything —
 * the overview numbers, the roster, both ledgers and the open account's own
 * history.
 *
 * ## It has a lane, it does not float over the page
 *
 * A labelled control big enough to read is also big enough to hide a switch
 * somebody was about to press, and this page is nothing but switches. So the
 * console reserves a strip down its right-hand side and the rail lives in it:
 * fixed, always in view, and never on top of a panel. Below 761px there is no
 * width to spare for a strip, so it shrinks to the icon alone and the sentence
 * lives in its label — a phone is not where anybody suspends an account.
 *
 * See `--dev-refresh-lane` in DevConsole.css for how the strip is reserved.
 *
 * ## Why it is a tile and not a glyph
 *
 * It says **Refresh**, and under that how old the page is, because a floating
 * circle with a symbol in it is a puzzle you have to hover to solve. And it is
 * built from the console's own surface, border and accent tokens rather than
 * the inverted primary fill — a white slab on a dark page reads as something
 * that has landed on the console rather than something that belongs to it.
 *
 * ## Why it is not a reload
 *
 * `location.reload()` would answer the same question and cost you your place,
 * your open sections, your search and the account you had open. This swaps the
 * DATA and holds the page still around it; `viewState.ts` is the half that
 * keeps the thing you were looking at exactly where it was.
 */
export function RefreshRail({
  onRefresh,
  busy,
  readAt,
}: {
  onRefresh: () => void
  busy: boolean
  /** When the page last successfully read anything, or null for not yet. */
  readAt: number | null
}) {
  /*
   * The clock lives here rather than on the page, so the thing that re-renders
   * every thirty seconds is one button, not a console holding three lists and
   * ten panels. An age that never ticks is worse than no age at all: it says
   * "2m" for an hour.
   */
  const [, tick] = useState(0)
  useEffect(() => {
    if (readAt == null) return
    const t = window.setInterval(() => tick((n) => n + 1), 30_000)
    return () => window.clearInterval(t)
  }, [readAt])

  const short = fmtAgeShort(readAt)
  /** Two lines of a 74px tile: short enough to fit, long enough to mean something. */
  const age = readAt == null ? 'not yet' : short === 'now' ? 'just now' : `${short} ago`
  const spoken =
    readAt == null ? 'Not read yet' : `Read ${fmtRelative(new Date(readAt).toISOString())}`
  const label = busy
    ? 'Re-reading everything on this page…'
    : `Refresh: re-read everything on this page without losing your place. ${spoken}.`

  return (
    <div className="dev__refresh">
      <button
        type="button"
        className="dev__refresh-btn"
        data-busy={busy || undefined}
        onClick={onRefresh}
        disabled={busy}
        title={label}
        // The visible text says Refresh; the label says what refreshing costs
        // you, which is the part worth hearing before pressing it. It is also
        // the only version a phone gets, where the tile is the icon alone.
        aria-label={label}
      >
        <span className="dev__refresh-icon" aria-hidden="true">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.3"
            strokeLinecap="round"
            strokeLinejoin="round"
            focusable="false"
          >
            <path d="M20.5 12a8.5 8.5 0 1 1-2.49-6.01" />
            <path d="M20.5 4.5v5h-5" />
          </svg>
        </span>
        <span className="dev__refresh-word" aria-hidden="true">
          {busy ? 'Reading' : 'Refresh'}
        </span>
        <span className="dev__refresh-age" aria-hidden="true">
          {age}
        </span>
      </button>
    </div>
  )
}
