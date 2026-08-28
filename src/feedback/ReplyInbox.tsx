import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { STORE_APPS } from '../data/store'
import { MODAL_LAYER, useBackdropClose, useModal } from '../lib/modal'
import { ackReply, fetchInbox, type InboxReply } from './api'
// The notices folder owns the fact; this panel draws it. See src/notices/api.ts
// for why they arrive in ONE panel rather than two dialogs over each other.
import { ackNotice, fetchNotices, type Notice } from '../notices/api'
import './Feedback.css'

/**
 * The panel that delivers what is waiting for this account.
 *
 * Two things arrive here and both are the same promise. A **reply**: somebody
 * sent feedback and one of us answered it from the Developer console. A
 * **notice**: one of us changed what their account owns — granted a pack,
 * ended a subscription, put a product out of reach — and ticked the box beside
 * Save that says tell them. Either way the message waits in tdg-core until the
 * person's own app asks for it, and on this site this is the asking: once per
 * sign-in, at boot, over the page.
 *
 * A reply is quoted alongside what they originally wrote, because a bare "fixed
 * now!" with no context is a puzzle. A notice needs no quote — it is about
 * their own account and its subject says which part.
 *
 * ## Why they share one panel
 *
 * Because two dialogs opening over each other at boot is worse than either, and
 * because there is no difference the reader cares about: both are a message
 * from us. Splitting them would also split Got It, and somebody who dismissed
 * one panel and found a second underneath would reasonably stop reading it.
 *
 * ## Seen means SEEN, and only Got It says it
 *
 * A message is marked seen only when the reader presses Got It. Escape and the
 * scrim close the panel without acking, so a reflex-dismissal costs nothing:
 * it comes back next visit. The console shows the difference — a developer
 * watching "NOT SEEN YET" is watching this exact mechanism — and the panel says
 * which of the two closings is which.
 */
export function ReplyInbox() {
  const { status, user } = useAuth()
  const [replies, setReplies] = useState<InboxReply[]>([])
  const [notices, setNotices] = useState<Notice[]>([])
  const [open, setOpen] = useState(false)
  const askedFor = useRef<string | null>(null)
  const closeRef = useRef<HTMLButtonElement | null>(null)
  // What Tab is not allowed to leave. See src/lib/modal.ts.
  const cardRef = useRef<HTMLDivElement | null>(null)

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
    // Both at once, and opened once. Asked separately with a `setOpen` each,
    // the second answer would re-open a panel the reader had already dealt
    // with — the same reflex-dismissal problem `gotIt` exists to avoid,
    // arriving a few hundred milliseconds later.
    void Promise.all([fetchInbox(), fetchNotices()]).then(([list, waiting]) => {
      if (!live || (list.length === 0 && waiting.length === 0)) return
      setReplies(list)
      setNotices(waiting)
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
    for (const n of notices) ackNotice(n.id)
    setOpen(false)
  }

  // The scroll lock, Escape, Tab and the focus return, counted across every
  // dialog on the page rather than owned by this one. See src/lib/modal.ts.
  // Focus lands on the close button, never on Got It: this panel opens by
  // itself, and a stray Enter must not be able to ack a reply nobody read.
  useModal({
    open,
    onClose: dismiss,
    layer: MODAL_LAYER.feedback,
    dialog: cardRef,
    focusFirst: closeRef,
  })

  if (!open || (replies.length === 0 && notices.length === 0)) return null

  const total = replies.length + notices.length
  const one = total === 1
  // What the panel is MOSTLY about, so the title is the true one in the common
  // case — all replies, or all notices — and an honest compromise in the rare
  // mixed one. "We Wrote Back" over a message about somebody losing a pack
  // would be the wrong words on the sentence that matters most.
  const onlyNotices = replies.length === 0
  const onlyReplies = notices.length === 0

  return (
    <div className="fb__backdrop" {...backdrop}>
      <div
        ref={cardRef}
        className="fb__card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fb-inbox-title"
      >
        <header className="fb__head">
          <div className="fb__eyebrow">{onlyNotices ? 'Your Account' : 'Feedback'}</div>
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
          {onlyNotices
            ? one
              ? 'Something Changed On Your Account'
              : notices.length + ' Changes On Your Account'
            : onlyReplies
              ? one
                ? 'We Wrote Back'
                : 'We Wrote Back — ' + replies.length + ' Replies'
              : total + ' Messages For You'}
        </h2>
        <p className="fb__sub">
          {onlyNotices
            ? 'We changed what your account has, and this is what we did.'
            : onlyReplies
              ? one
                ? 'You sent us feedback, and there is an answer.'
                : 'You sent us feedback, and there are answers.'
              : 'An answer to your feedback, and a change to your account.'}
        </p>

        <div className="fb__thread">
          {/* Notices first. One of them may be somebody finding out they have
              lost access to something, and that is not a thing to read after
              two replies about a typo. */}
          {notices.map((n) => (
            <div key={'notice-' + n.id} className="fb__item">
              <p className="fb__quote">
                <span className="fb__quote-tag">account</span> about {appLabel(n.app)}:
                <span className="fb__quote-text"> {n.subject}</span>
              </p>
              <div className="fb__reply">
                <p className="fb__reply-body">{n.body}</p>
                <p className="fb__reply-by">— TDG, {when(n.created_at)}</p>
              </div>
            </div>
          ))}
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
