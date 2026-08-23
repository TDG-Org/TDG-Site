import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { STORE_APPS } from '../data/store'
import { MODAL_LAYER, useBackdropClose, useModal } from '../lib/modal'
import { ackReply, fetchInbox, type InboxReply } from './api'
import './Feedback.css'

/**
 * The panel that delivers a developer's reply.
 *
 * When somebody sends feedback and one of us answers it from the Developer
 * console, the answer waits in tdg-core until the person's app asks for it.
 * On this site, this is the asking: once per sign-in, at boot, and if there
 * is anything waiting it opens over the page — quoted alongside what they
 * originally wrote, because a bare "fixed now!" with no context is a puzzle.
 *
 * ## Seen means SEEN, and only Got It says it
 *
 * A reply is marked seen only when the reader presses Got It. Escape and the
 * scrim close the panel without acking, so a reflex-dismissal costs nothing:
 * the reply comes back next visit. The console shows the difference — a
 * developer watching "NOT SEEN YET" is watching this exact mechanism — and
 * the panel says which of the two closings is which.
 */
export function ReplyInbox() {
  const { status, user } = useAuth()
  const [replies, setReplies] = useState<InboxReply[]>([])
  const [open, setOpen] = useState(false)
  const askedFor = useRef<string | null>(null)
  const closeRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    // Signing out forgets who we asked for, so signing back in — as the same
    // account or another one — asks again. Without this, a reply written while
    // somebody was signed out sat unshown until a full reload: `askedFor` still
    // held their id from the first visit and the check below skipped the read.
    if (status !== 'signedIn' || !user) {
      askedFor.current = null
      return
    }
    // Once per account per sign-in. A re-render does not ask again.
    if (askedFor.current === user.id) return
    askedFor.current = user.id
    let live = true
    void fetchInbox().then((list) => {
      if (!live || list.length === 0) return
      setReplies(list)
      setOpen(true)
    })
    return () => {
      live = false
    }
  }, [status, user])

  const dismiss = useCallback(() => setOpen(false), [])

  // A press that both started and ended on the scrim. Nothing typed is at
  // stake here, but a reflex drag that closed the panel would still cost the
  // reader the reply they were half-way through reading. See src/lib/modal.ts.
  const backdrop = useBackdropClose(dismiss)

  const gotIt = () => {
    for (const r of replies) ackReply(r.reply_id)
    setOpen(false)
  }

  // The scroll lock, Escape and the focus return, counted across every dialog
  // on the page rather than owned by this one. See src/lib/modal.ts. Focus
  // lands on the close button, never on Got It: this panel opens by itself, and
  // a stray Enter must not be able to ack a reply nobody has read yet.
  useModal(open, dismiss, MODAL_LAYER.feedback, closeRef)

  if (!open || replies.length === 0) return null

  const one = replies.length === 1

  return (
    <div className="fb__backdrop" {...backdrop}>
      <div className="fb__card" role="dialog" aria-modal="true" aria-labelledby="fb-inbox-title">
        <header className="fb__head">
          <div className="fb__eyebrow">Feedback</div>
          <button
            ref={closeRef}
            type="button"
            className="fb__x"
            aria-label="Close and keep unread"
            onClick={dismiss}
          >
            ×
          </button>
        </header>

        <h2 className="fb__title" id="fb-inbox-title">
          {one ? 'We Wrote Back' : 'We Wrote Back — ' + replies.length + ' Replies'}
        </h2>
        <p className="fb__sub">
          {one
            ? 'You sent us feedback, and there is an answer.'
            : 'You sent us feedback, and there are answers.'}
        </p>

        <div className="fb__thread">
          {replies.map((r) => (
            <div key={r.reply_id} className="fb__item">
              <p className="fb__quote">
                <span className="fb__quote-tag">{r.kind}</span> you wrote about {appLabel(r.app)}:
                <span className="fb__quote-text"> “{clip(r.message, 220)}”</span>
              </p>
              <div className="fb__reply">
                <p className="fb__reply-body">{r.body}</p>
                <p className="fb__reply-by">
                  — {r.replied_by}, {when(r.replied_at)}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="fb__row fb__row--end">
          <button type="button" className="fb__btn" onClick={dismiss}>
            Show Me Next Time
          </button>
          <button type="button" className="fb__btn fb__btn--primary" onClick={gotIt}>
            Got It
          </button>
        </div>
      </div>
    </div>
  )
}

/** What to call the app a report came from, in a sentence. */
function appLabel(id: string): string {
  if (id === 'tdg-site') return 'this site'
  const sold = STORE_APPS.find((a) => a.id === id)
  if (sold) return sold.title
  // An app the shop has no copy for still gets a legible name. Deliberately
  // not imported from src/dev/ — that folder is a lazy chunk only developers'
  // browsers ever fetch, and this panel is for everybody.
  return id
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => (w.toLowerCase() === 'tdg' ? 'TDG' : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1).trimEnd() + '…'
}

/** "21 Aug" — the reply names its day, not a timestamp. */
const shortDate = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })

function when(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? 'recently' : shortDate.format(d)
}
