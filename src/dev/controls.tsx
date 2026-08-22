import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { sectionDomId, useSections } from '../lib/sections'

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
 * shut page still reads as an index rather than as a stack of nine mystery
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
  children,
}: {
  /** Stable section id. Defaults to the title, which is unique per page. */
  id?: string
  title: string
  what: string
  writes?: string
  tone?: 'plain' | 'danger'
  right?: ReactNode
  children: ReactNode
}) {
  const sectionId = id ?? title
  const { isOpen, toggle, register } = useSections()
  useEffect(() => register(sectionId), [register, sectionId])

  const open = isOpen(sectionId)
  const regionId = sectionDomId(sectionId, 'dev-sec')

  return (
    <section className="dev__panel" data-tone={tone} data-open={open || undefined}>
      {/* The button lives inside the heading rather than around it, so the
          section still has a heading in the outline when it is shut. */}
      <h3 className="dev__panel-heading">
        <button
          type="button"
          className="dev__panel-head"
          aria-expanded={open}
          aria-controls={regionId}
          onClick={() => toggle(sectionId)}
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
            >
              <path d="m9 18 6-6-6-6" />
            </svg>
          </span>
          <span className="dev__panel-titles">
            <span className="dev__panel-title">{title}</span>
            <span className="dev__panel-what">{what}</span>
          </span>
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
 * Expand All / Collapse All, plus how many sections are open right now.
 *
 * The count is the honest one: sections currently ON SCREEN. Switching tabs
 * changes it, because the buttons only ever act on what you can see.
 */
export function SectionControls() {
  const { expandAll, collapseAll, openCount, total } = useSections()
  return (
    <div className="dev__sections">
      <div className="dev__sections-text">
        <span className="dev__sections-label">Sections</span>
        <span className="dev__sections-count">
          {openCount} of {total} open
        </span>
      </div>
      <div className="dev__sections-btns">
        <Button onClick={expandAll} disabled={total === 0 || openCount === total}>
          Expand All
        </Button>
        <Button onClick={collapseAll} disabled={openCount === 0}>
          Collapse All
        </Button>
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

export function CopyButton({ value }: { value: string }) {
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

  return (
    <button type="button" className="dev__copy" onClick={copy} aria-label={`Copy ${value}`}>
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
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  id?: string
  disabled?: boolean
}) {
  return (
    <span className="dev__select-wrap" data-disabled={disabled || undefined}>
      <select
        id={id}
        className="dev__select"
        value={value}
        disabled={disabled}
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
  note,
}: {
  name: string
  owned: boolean
  onChange: (next: boolean) => void
  busy?: boolean
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
      disabled={busy}
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

  const push = useCallback((tone: 'ok' | 'bad', text: string) => {
    const id = ++toastSeq
    setToasts((list) => [...list, { id, tone, text }])
    // A refusal is something to read; a success is something to notice. The
    // failure sits four times as long for exactly that reason.
    window.setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), tone === 'ok' ? 2600 : 9000)
  }, [])

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id))
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
