import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { useModal } from '../lib/modal'
import { FEEDBACK_KINDS, fetchQuota, quotaLine, submitFeedback, type FeedbackQuota } from './api'
import './Feedback.css'

/**
 * Send Feedback, from the account menu.
 *
 * One dialog, three steps that are really one: pick what kind of thing this
 * is, write it, optionally say where else to reach you. The kind is a real
 * choice the reader makes — nothing is pre-selected, because a form that
 * defaults to Bug files praise as bugs — and the server refuses a submission
 * without one, worded for showing.
 *
 * The signed-in account travels with the report on the server side (the JWT,
 * never a form field), which is what lets a developer write back: the reply
 * lands in this same site's ReplyInbox the next time the person opens it.
 * The dialog says both of those things out loud, because a feedback form
 * that does not say where the words go is a form people close.
 *
 * Unlike the auth modal, this one themes with the page: it is part of the
 * site, not a gate in front of it.
 */
export function FeedbackDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { status, profile, user } = useAuth()

  const [kind, setKind] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [contact, setContact] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sentId, setSentId] = useState<number | null>(null)
  const [quota, setQuota] = useState<FeedbackQuota | null>(null)
  const [tick, setTick] = useState(() => Date.now())
  const messageRef = useRef<HTMLTextAreaElement | null>(null)
  const closeRef = useRef<HTMLButtonElement | null>(null)
  // Where a mouse press STARTED. A drag that begins in the textarea and
  // finishes a few pixels outside the card lands its click on the scrim, and
  // an unguarded scrim would take that as "close" and bin a report somebody
  // spent five minutes writing.
  const pressedBackdrop = useRef(false)

  // A fresh opening is a fresh report. Reset on open, not on close, so the
  // closing animation never flashes an emptied form.
  useEffect(() => {
    if (!open) return
    setKind(null)
    setMessage('')
    setContact('')
    setSending(false)
    setError(null)
    setSentId(null)
  }, [open])

  // Where this account stands against the limits, asked once per opening and
  // again after each send. Signed-out openings never ask: the answer would be
  // "sign in first", which the dialog is already saying.
  useEffect(() => {
    if (!open || status !== 'signedIn') {
      setQuota(null)
      return
    }
    let live = true
    void fetchQuota().then((q) => {
      if (!live) return
      // Re-anchor the clock in the same breath as the answer. This dialog is
      // mounted for the whole session with open={false}, so a `tick` seeded at
      // mount is as old as the visit — and `unblockAt - tick` would then read a
      // 60-second wait as however long the page had been open. The countdown
      // must never start from a timestamp older than the quota it counts.
      setTick(Date.now())
      setQuota(q)
    })
    return () => {
      live = false
    }
  }, [open, status, sentId])

  // One second per second, and ONLY while a countdown is actually running.
  //
  // Rule 9 sends animation through the shared frame loop; this is a clock, not
  // animation, and putting it there would hold that loop awake at 60 Hz to
  // repaint a number sixty times less often than it ticks — the exact waste the
  // rule exists to prevent. So: a plain interval, born when a wait begins and
  // dead the moment it ends or the dialog closes.
  const msLeft = quota?.unblockAt ? quota.unblockAt - tick : 0
  useEffect(() => {
    const until = quota?.unblockAt
    if (!open || !until || until <= Date.now()) return
    const id = window.setInterval(() => {
      const now = Date.now()
      setTick(now)
      if (now >= until) window.clearInterval(id)
    }, 1000)
    return () => window.clearInterval(id)
  }, [open, quota])

  // The scroll lock, Escape and the focus return, counted across every dialog
  // on the page rather than owned by this one. See src/lib/modal.ts.
  useModal(open, onClose, closeRef)

  if (!open) return null

  const whoami = profile?.display_name || (profile?.username ? `@${profile.username}` : user?.email)

  // One line, two contexts. The cooldown wording differs by a clause because
  // "you can send another in a minute" answers a report that just landed,
  // while "one report at a time" answers a form somebody is still filling in.
  const formLine = quotaLine(quota, msLeft, false)
  const sentLine = quotaLine(quota, msLeft, true)

  function pickKind(id: string) {
    setKind(id)
    setError(null)
  }

  /**
   * The radiogroup's keyboard half: arrows and Home/End move the selection and
   * carry focus with it, wrapping at both ends. Selection FOLLOWS focus, which
   * is the pattern for a group this small — every option is one press away and
   * none of them costs anything to land on.
   */
  function moveKind(e: KeyboardEvent<HTMLButtonElement>, from: number) {
    const last = FEEDBACK_KINDS.length - 1
    const to =
      e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (from === last ? 0 : from + 1)
      : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? (from === 0 ? last : from - 1)
      : e.key === 'Home' ? 0
      : e.key === 'End' ? last
      : -1
    if (to < 0) return
    e.preventDefault()
    pickKind(FEEDBACK_KINDS[to].id)
    // The tile is about to become the only tabbable one in the group; move
    // focus to it in the same breath, or the reader is left standing on an
    // option that is no longer chosen.
    const group = e.currentTarget.parentElement
    const next = group?.children[to]
    if (next instanceof HTMLElement) next.focus()
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (sending) return
    if (!kind) {
      setError('Pick what kind of feedback this is.')
      return
    }
    if (!message.trim()) {
      setError('Write the feedback itself before sending.')
      messageRef.current?.focus()
      return
    }
    setError(null)
    setSending(true)
    const answer = await submitFeedback({ kind, message: message.trim(), contact })
    setSending(false)
    if (answer.error) {
      setError(answer.error)
      // The refusal may name a limit that started after this dialog opened —
      // a report sent from one of the other TDG apps two minutes ago spends
      // the same allowance. Re-ask, so a countdown appears under the sentence
      // that just refused rather than leaving it as a flat no.
      void fetchQuota().then((q) => {
        if (!q) return
        setTick(Date.now())
        setQuota(q)
      })
      return
    }
    setSentId(answer.id)
  }

  return (
    // The scrim closes on a press that both STARTED and ended on it. A click
    // whose mousedown was inside the card — the tail of a drag-select in the
    // textarea — is somebody editing, not somebody leaving.
    <div
      className="fb__backdrop"
      onMouseDown={(e) => {
        pressedBackdrop.current = e.target === e.currentTarget
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && pressedBackdrop.current) onClose()
      }}
    >
      <div className="fb__card" role="dialog" aria-modal="true" aria-labelledby="fb-title">
        <header className="fb__head">
          <div className="fb__eyebrow">Feedback</div>
          <button
            ref={closeRef}
            type="button"
            className="fb__x"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        {status !== 'signedIn' ? (
          <>
            <h2 className="fb__title" id="fb-title">
              Sign In First
            </h2>
            <p className="fb__sub">
              Feedback travels with your account, so we can write back to you. Sign in and try
              again.
            </p>
          </>
        ) : sentId != null ? (
          <>
            <h2 className="fb__title" id="fb-title">
              Sent — Thank You
            </h2>
            <p className="fb__sub">
              That went straight to the two of us, as report #{sentId}. If we reply, the answer
              opens right here the next time you visit.
            </p>
            {sentLine && (
              <p className="fb__quota" data-blocked={msLeft > 0 || undefined}>
                {sentLine}
              </p>
            )}
            <div className="fb__row fb__row--end">
              <button type="button" className="fb__btn fb__btn--primary" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="fb__title" id="fb-title">
              Tell Us What You Think
            </h2>
            <p className="fb__sub">
              It goes straight to the two of us, with your account attached — so if it needs an
              answer, we can put one back in front of you, right here.
            </p>

            <form className="fb__form" onSubmit={handleSubmit}>
              {/* A real radiogroup, keyboard contract included: arrows move
                  and select, and only one option is in the tab order at a time
                  (the checked one, or the first while nothing is chosen) so Tab
                  crosses the group rather than walking it. Announcing "radio,
                  1 of 5" and then ignoring the arrow keys is worse than five
                  plain buttons — see AGENTS.md rule 14. The legend is the
                  group's name; no aria-label, which would replace it. */}
              <fieldset className="fb__kinds" role="radiogroup">
                <legend className="fb__label">What Kind Of Feedback Is This?</legend>
                <div className="fb__kind-grid">
                  {FEEDBACK_KINDS.map((k, i) => (
                    <button
                      key={k.id}
                      type="button"
                      role="radio"
                      aria-checked={kind === k.id}
                      tabIndex={kind === k.id || (kind == null && i === 0) ? 0 : -1}
                      className="fb__kind"
                      data-active={kind === k.id || undefined}
                      onKeyDown={(e) => moveKind(e, i)}
                      onClick={() => pickKind(k.id)}
                    >
                      <span className="fb__kind-name">{k.name}</span>
                      <span className="fb__kind-what">{k.what}</span>
                    </button>
                  ))}
                </div>
              </fieldset>

              <div className="fb__field">
                <label className="fb__label" htmlFor="fb-message">
                  Your Feedback
                </label>
                <textarea
                  id="fb-message"
                  ref={messageRef}
                  className="fb__input fb__textarea"
                  rows={5}
                  maxLength={5000}
                  value={message}
                  placeholder="What happened, what you expected, what you'd change — anything."
                  onChange={(e) => setMessage(e.target.value)}
                />
                <p className="fb__hint" data-warn={message.length > 4700 || undefined}>
                  {message.length > 4500
                    ? `${5000 - message.length} characters left`
                    : 'The more specific, the faster we can act on it.'}
                </p>
              </div>

              <div className="fb__field">
                <label className="fb__label" htmlFor="fb-contact">
                  How To Reach You <span className="fb__optional">optional</span>
                </label>
                <input
                  id="fb-contact"
                  className="fb__input"
                  type="text"
                  maxLength={200}
                  value={contact}
                  placeholder="My instagram is @tdgluke"
                  autoComplete="off"
                  onChange={(e) => setContact(e.target.value)}
                />
                <p className="fb__hint">
                  Only if you want an answer somewhere else too — a handle, an email, anything.
                  Replies here work without it.
                </p>
              </div>

              {formLine && (
                <p className="fb__quota" data-blocked={msLeft > 0 || undefined}>
                  {formLine}
                </p>
              )}

              {error && (
                <p className="fb__error" role="alert">
                  {error}
                </p>
              )}

              <div className="fb__row">
                <span className="fb__signed">Sending as {whoami}.</span>
                {/* Deliberately still pressable during a wait. The gate is in
                    Postgres and only there (rule 12); a button that disabled
                    itself on a client-side clock would be one skewed machine
                    away from refusing a report somebody is entitled to send,
                    and the server's own refusal — which lands in the alert
                    above, worded to be read — is the honest answer either
                    way. The line above says the wait; this says nothing. */}
                <button
                  type="submit"
                  className="fb__btn fb__btn--primary"
                  disabled={sending}
                  data-busy={sending || undefined}
                >
                  {sending ? 'Sending…' : 'Send Feedback'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
