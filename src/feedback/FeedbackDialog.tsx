import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { FEEDBACK_KINDS, submitFeedback } from './api'
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
  const messageRef = useRef<HTMLTextAreaElement | null>(null)

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

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!open) return null

  const whoami = profile?.display_name || (profile?.username ? `@${profile.username}` : user?.email)

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
      return
    }
    setSentId(answer.id)
  }

  return (
    <div className="fb__backdrop" onClick={onClose}>
      <div
        className="fb__card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fb-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="fb__head">
          <div className="fb__eyebrow">Feedback</div>
          <button type="button" className="fb__x" aria-label="Close" onClick={onClose}>
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
              <fieldset className="fb__kinds" role="radiogroup" aria-label="What kind of feedback">
                <legend className="fb__label">What Kind Of Feedback Is This?</legend>
                <div className="fb__kind-grid">
                  {FEEDBACK_KINDS.map((k) => (
                    <button
                      key={k.id}
                      type="button"
                      role="radio"
                      aria-checked={kind === k.id}
                      className="fb__kind"
                      data-active={kind === k.id || undefined}
                      onClick={() => {
                        setKind(k.id)
                        setError(null)
                      }}
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

              {error && (
                <p className="fb__error" role="alert">
                  {error}
                </p>
              )}

              <div className="fb__row">
                <span className="fb__signed">Sending as {whoami}.</span>
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
