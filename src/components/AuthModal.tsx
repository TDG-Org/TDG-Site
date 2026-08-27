import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { FORM_REFUSAL, USERNAME_SHAPE, usernameShapeProblem } from '../auth/wording'
import { MODAL_LAYER, useBackdropClose, useModal } from '../lib/modal'
import { supabase } from '../lib/supabase'
import './AuthModal.css'

type TabKey = 'signup' | 'login'
type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid'

function normalizeUsername(raw: string) {
  return raw.trim().replace(/@/g, '')
}

/**
 * How strong this password looks, as an OPINION.
 *
 * It is not the policy and it must never become the gate. The minimum the
 * server will accept lives in the Supabase dashboard and can move with no
 * build here, which is why nothing in this component checks a length before
 * submitting — see the note beside `FORM_REFUSAL` in `src/auth/wording.ts`.
 * The 8 below is the meter's own opinion of where "too short" starts, and it
 * is allowed to be wrong about the server in the safe direction only.
 */
function getPasswordStrength(pw: string): { percent: number; label: string } {
  if (!pw) return { percent: 0, label: '' }
  if (pw.length < 8) return { percent: 18, label: 'Too short' }
  let score = 1
  if (pw.length >= 12) score++
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++
  if (/[0-9]/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++
  const steps = [
    { percent: 40, label: 'Weak' },
    { percent: 66, label: 'Good' },
    { percent: 85, label: 'Strong' },
    { percent: 100, label: 'Excellent' },
  ]
  return steps[Math.min(score, steps.length) - 1]
}

/* ── icons, copied from the design canvas's own inline SVGs ──────────────── */

function IconUser() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="4" />
      <path d="M16 8v5.2a2.8 2.8 0 0 0 5.6 0V12A9.6 9.6 0 1 0 17.2 20" />
    </svg>
  )
}
function IconCard() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <circle cx="9.4" cy="11" r="2.1" />
      <path d="M6 16.3c.6-1.3 1.9-2 3.4-2s2.8.7 3.4 2" />
      <path d="M15.6 10.4h3.2M15.6 13.4h3.2" />
    </svg>
  )
}
function IconMail() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="M3.5 6.5l8.5 6.5 8.5-6.5" />
    </svg>
  )
}
function IconLock() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="5" y="10.5" width="14" height="9.5" rx="2.2" />
      <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" />
    </svg>
  )
}
function IconEye() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}
function IconEyeOff() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M3 3l18 18" />
      <path d="M10.6 5.2A11 11 0 0 1 12 5c7 0 11 7 11 7a13.2 13.2 0 0 1-3.2 3.8M6.5 6.6C3.4 8.5 1 12 1 12s4 7 11 7a10.6 10.6 0 0 0 4.2-.9" />
      <path d="M9.9 10a3 3 0 0 0 4.2 4.2" />
    </svg>
  )
}
function IconCheck() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M4 12.5l5.5 5.5L20 6" />
    </svg>
  )
}
function IconArrow() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M5 12h13" />
      <path d="M12.5 6.5 19 12l-6.5 5.5" />
    </svg>
  )
}
function IconGitHub() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="#181717" aria-hidden="true" focusable="false">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.09 3.29 9.39 7.86 10.91.57.1.78-.25.78-.55 0-.27-.01-1.13-.02-2.04-3.2.7-3.88-1.35-3.88-1.35-.53-1.33-1.29-1.69-1.29-1.69-1.05-.72.08-.7.08-.7 1.17.08 1.78 1.2 1.78 1.2 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.55-.29-5.23-1.28-5.23-5.68 0-1.25.45-2.28 1.18-3.08-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.15 1.18a10.9 10.9 0 0 1 5.73 0c2.19-1.49 3.15-1.18 3.15-1.18.62 1.58.23 2.75.11 3.04.73.8 1.18 1.83 1.18 3.08 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.06.78 2.15 0 1.55-.01 2.8-.01 3.18 0 .3.2.66.79.55A11.51 11.51 0 0 0 23.5 12c0-6.35-5.15-11.5-11.5-11.5Z" />
    </svg>
  )
}
function IconGoogle() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z" />
      <path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29A11.97 11.97 0 0 0 0 12c0 1.94.46 3.77 1.29 5.38l3.98-3.09z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z" />
    </svg>
  )
}

/* ── small stateful pieces ─────────────────────────────────────────────── */

/**
 * The last fixed SVG def id in `src/`, and it is kept on a precondition rather
 * than by oversight.
 *
 * SVG ids are document-global: two elements sharing a gradient id and every
 * `url(#...)` in the document resolves to the FIRST of them. That is the bug
 * `CrossGlyph.tsx`, `scene/Moon.tsx` and `KeyArt.tsx` each fixed this pass by
 * taking their def ids from `useId`, and all three had to — three crosses, two
 * moons and five covers render on the home page at once.
 *
 * **This one cannot collide, and the reason is structural rather than lucky.**
 * `grep -rn '<AuthModal' src/` returns one line, `App.tsx`, beside
 * `FeedbackDialog` and `ReplyInbox`; the component returns `null` while closed;
 * and `TdgMark` is drawn once inside it. So the document holds at most one
 * `#authModalCrossGrad` and usually none.
 *
 * Left as it is rather than converted, deliberately. AGENTS.md §4 names this
 * modal as not up for redesign, and a change that fixes no bug and moves no
 * pixel is still a change to it. But "only one modal can exist" is a
 * precondition, not a property of SVG, and an unwritten precondition is one
 * somebody breaks without noticing — so it is written here instead. **The day
 * a second instance renders** — a re-auth prompt over the page, a harness that
 * mounts two — **this must become `useId`**, the way `CrossGlyph.tsx` and
 * `scene/Moon.tsx` do it: `useId().replace(/[^a-zA-Z0-9_-]/g, '')`, one uid
 * interpolated into both the `id` and the `url(#...)`.
 */
function TdgMark() {
  return (
    <span className="authmodal__mark">
      <svg viewBox="0 0 42 100" className="authmodal__mark-cross" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="authModalCrossGrad" x1="6%" y1="0%" x2="94%" y2="100%">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.34" stopColor="#f2f2f5" />
            <stop offset="0.78" stopColor="#9a9aa6" />
            <stop offset="1" stopColor="#6e6e79" />
          </linearGradient>
        </defs>
        <path d="M16.6 0H25.4V26.5H42V35.3H25.4V100H16.6V35.3H0V26.5H16.6Z" fill="url(#authModalCrossGrad)" />
      </svg>
      <span className="authmodal__mark-text">DG</span>
    </span>
  )
}

function CloseButton({ onClick }: { onClick: () => void }) {
  const [ring, setRing] = useState(false)
  const [ringKey, setRingKey] = useState(0)
  return (
    <button
      type="button"
      className="authmodal__close"
      aria-label="Close"
      onClick={onClick}
      onMouseEnter={() => {
        setRing(true)
        setRingKey((k) => k + 1)
      }}
      onMouseLeave={() => setRing(false)}
    >
      {ring && (
        <span key={ringKey} className="authmodal__close-orbit" aria-hidden="true" onAnimationEnd={() => setRing(false)}>
          <span className="authmodal__close-dot" />
        </span>
      )}
      <span className="authmodal__close-x" aria-hidden="true">×</span>
    </button>
  )
}

type GlowFieldProps = {
  id: string
  label: ReactNode | null
  optionalTag?: boolean
  className?: string
  icon: ReactNode
  type: 'text' | 'email' | 'password'
  value: string
  onChange: (value: string) => void
  placeholder: string
  autoComplete?: string
  required?: boolean
  masked?: boolean
  rightSlot?: ReactNode
  hint?: ReactNode
}

function GlowField({
  id,
  label,
  optionalTag,
  className,
  icon,
  type,
  value,
  onChange,
  placeholder,
  autoComplete,
  required,
  masked,
  rightSlot,
  hint,
}: GlowFieldProps) {
  const [focused, setFocused] = useState(false)
  const glyphs = masked ? '•'.repeat(value.length) : value

  return (
    <div
      className={`authmodal__field${rightSlot ? ' authmodal__field--has-eye' : ''}${className ? ` ${className}` : ''}`}
    >
      {label !== null && (
        <label htmlFor={id} className="authmodal__label">
          {label}
          {optionalTag && <span className="authmodal__optional"> optional</span>}
        </label>
      )}
      <div className="authmodal__input-wrap">
        <span className="authmodal__input-icon" aria-hidden="true">
          {icon}
        </span>
        <input
          id={id}
          name={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
          className="authmodal__input"
        />
        <div className="authmodal__input-glow" aria-hidden="true">
          {Array.from(glyphs).map((ch, i) => (
            <span key={i} className="authmodal__glyph">
              {ch}
            </span>
          ))}
          {focused && <span className="authmodal__caret" />}
        </div>
        {rightSlot}
      </div>
      {hint}
    </div>
  )
}

function EyeToggle({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className="authmodal__eye"
      onClick={onToggle}
      aria-label={shown ? 'Hide password' : 'Show password'}
      aria-pressed={shown}
    >
      {shown ? <IconEyeOff /> : <IconEye />}
    </button>
  )
}

function RingButton({ children, busy }: { children: ReactNode; busy?: boolean }) {
  const [ring, setRing] = useState(false)
  const [ringKey, setRingKey] = useState(0)
  return (
    <button
      type="submit"
      className="authmodal__cta"
      disabled={busy}
      onMouseEnter={() => {
        setRing(true)
        setRingKey((k) => k + 1)
      }}
      onMouseLeave={() => setRing(false)}
    >
      {ring && (
        <span key={ringKey} className="authmodal__cta-ring" aria-hidden="true" onAnimationEnd={() => setRing(false)} />
      )}
      <span className="authmodal__cta-fill" aria-hidden="true" />
      <span className="authmodal__cta-label">{busy ? 'Please wait…' : children}</span>
    </button>
  )
}

function Divider({ label }: { label: string }) {
  return (
    <div className="authmodal__divider">
      <span className="authmodal__divider-line" />
      <span className="authmodal__divider-label">{label}</span>
      <span className="authmodal__divider-line" />
    </div>
  )
}

function SocialRow({ onGitHub, onGoogle }: { onGitHub: () => void; onGoogle: () => void }) {
  return (
    <div className="authmodal__socials">
      <button type="button" className="authmodal__social" onClick={onGitHub}>
        <span className="authmodal__social-icon">
          <IconGitHub />
        </span>
        <span>GitHub</span>
      </button>
      <button type="button" className="authmodal__social authmodal__social--google" onClick={onGoogle}>
        <span className="authmodal__social-icon">
          <IconGoogle />
        </span>
        <span>Google</span>
      </button>
    </div>
  )
}

/* ── the modal ─────────────────────────────────────────────────────────── */

type AuthModalProps = {
  open: boolean
  initialTab: TabKey
  onClose: () => void
}

export function AuthModal({ open, initialTab, onClose }: AuthModalProps) {
  const {
    signUp,
    signIn,
    signInWithOAuth,
    resetPassword,
    updatePassword,
    recovery,
    oauthError,
    dismissOauthError,
  } = useAuth()

  // What Tab is not allowed to leave. See src/lib/modal.ts.
  const cardRef = useRef<HTMLDivElement | null>(null)
  // A scrim that needs a press which both started and ended on it. This card
  // holds a half-typed password, and a drag-select out of a field was landing
  // its click on the backdrop and closing the whole modal. See src/lib/modal.ts.
  const backdrop = useBackdropClose(onClose)

  const [tab, setTab] = useState<TabKey>(initialTab)
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loginId, setLoginId] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [showLoginPassword, setShowLoginPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showNewPasswordConfirm, setShowNewPasswordConfirm] = useState(false)
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Fresh slate every time the modal opens. Half-typed data from a dismissed
  // attempt should not resurface later.
  useEffect(() => {
    if (!open) return
    setTab(initialTab)
    setUsername('')
    setDisplayName('')
    setEmail('')
    setPassword('')
    setConfirm('')
    setLoginId('')
    setLoginPassword('')
    setNewPassword('')
    setNewPasswordConfirm('')
    setShowPassword(false)
    setShowConfirm(false)
    setShowLoginPassword(false)
    setShowNewPassword(false)
    setShowNewPasswordConfirm(false)
    setUsernameStatus('idle')
    setSubmitting(false)
    setFormError(null)
    setNotice(null)
  }, [open, initialTab])

  // A provider that isn't enabled yet sends the browser back here with an
  // error on the URL; AuthProvider captures it once, we surface it once.
  useEffect(() => {
    if (open && oauthError) {
      setTab('login')
      setFormError(oauthError)
      dismissOauthError()
    }
  }, [open, oauthError, dismissOauthError])

  // The scroll lock, Escape, Tab and the focus return, counted across every
  // dialog on the page rather than owned by this one. See src/lib/modal.ts.
  // No `focusFirst`: this modal's first field is the one somebody came here to
  // type in, and the browser's own autofill wants it left alone until they do.
  useModal({ open, onClose, layer: MODAL_LAYER.auth, dialog: cardRef })

  // Live availability check against the shared profiles table, debounced.
  useEffect(() => {
    if (!open || tab !== 'signup') return
    const normalized = normalizeUsername(username)
    if (!normalized) {
      setUsernameStatus('idle')
      return
    }
    // The shape check is `wording.ts`'s, not a second copy of it here: the
    // sentence the hint prints and the pattern it is about have to be the same
    // fact, or the form refuses on one rule and explains a different one.
    if (usernameShapeProblem(normalized)) {
      setUsernameStatus('invalid')
      return
    }
    setUsernameStatus('checking')
    const timer = window.setTimeout(() => {
      supabase
        .rpc('bea_username_available', { uname: normalized })
        .then(({ data, error }) => {
          if (error) {
            setUsernameStatus('idle')
            return
          }
          setUsernameStatus(data ? 'available' : 'taken')
        })
    }, 450)
    return () => window.clearTimeout(timer)
  }, [open, tab, username])

  if (!open) return null

  function switchTab(next: TabKey) {
    setTab(next)
    setFormError(null)
    setNotice(null)
  }

  async function handleSignUpSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setNotice(null)
    const normalized = normalizeUsername(username)
    if (usernameStatus === 'taken') {
      setFormError(FORM_REFUSAL.usernameTaken)
      return
    }
    const shapeProblem = usernameShapeProblem(normalized)
    if (shapeProblem) {
      setFormError(shapeProblem)
      return
    }
    // No password-length check on purpose. The minimum is a dashboard setting
    // this repo cannot see, so the only honest refusal is the server's own —
    // see the note beside FORM_REFUSAL in src/auth/wording.ts.
    if (password !== confirm) {
      setFormError(FORM_REFUSAL.passwordMismatch)
      return
    }
    setFormError(null)
    setSubmitting(true)

    /*
     * Ask ONE more time, right here, and refuse on anything but a clear yes.
     *
     * The check that runs while you type is debounced, so a fast typist can
     * submit before its answer lands, and the cost of missing is invisible:
     * tdg-core's handle_new_user trigger does not fail on a taken
     * username, it silently stores NULL and creates the account anyway.
     * Somebody would sign up as "clyde", be told it worked, and have no
     * username at all, with nothing anywhere saying why.
     *
     * A network failure refuses too. Guessing "probably free" is what produces
     * that same silent drop, and asking somebody to press the button again is
     * the cheaper mistake.
     */
    const { data: stillFree, error: checkError } = await supabase.rpc('bea_username_available', {
      uname: normalized,
    })
    if (checkError || stillFree !== true) {
      setSubmitting(false)
      setUsernameStatus(checkError ? 'idle' : 'taken')
      setFormError(
        checkError ? FORM_REFUSAL.usernameUncheckable : FORM_REFUSAL.usernameTakenJustNow,
      )
      return
    }

    const { error, needsEmailConfirm } = await signUp({
      email,
      password,
      username: normalized,
      displayName: displayName.trim(),
    })
    setSubmitting(false)
    if (error) {
      setFormError(error)
      return
    }
    if (needsEmailConfirm) {
      setNotice(`Check ${email} for a confirmation link to finish creating your account.`)
    } else {
      onClose()
    }
  }

  async function handleLoginSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setNotice(null)
    const identifier = loginId.trim()
    if (!identifier) {
      setFormError(FORM_REFUSAL.identifierMissing)
      return
    }
    if (!loginPassword) {
      setFormError(FORM_REFUSAL.passwordMissing)
      return
    }
    setFormError(null)
    setSubmitting(true)
    // Username OR email, resolved server-side by tdg-site-account, because a
    // browser may not turn a public handle into somebody's email address.
    const { error } = await signIn({ identifier, password: loginPassword })
    setSubmitting(false)
    if (error) {
      setFormError(error)
      return
    }
    onClose()
  }

  async function handleForgotPassword() {
    const identifier = loginId.trim()
    if (!identifier) {
      setFormError(FORM_REFUSAL.identifierForReset)
      return
    }
    setFormError(null)
    setNotice(null)
    setSubmitting(true)
    const { error } = await resetPassword(identifier)
    setSubmitting(false)
    if (error) {
      setFormError(error)
      return
    }
    setNotice('If that account exists, a reset link is on its way. Check the inbox for its email address.')
  }

  async function handleUpdatePasswordSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    // No length check here either: `updatePassword` comes back with GoTrue's
    // own `weak_password` sentence, which is the only one that cannot go stale.
    if (newPassword !== newPasswordConfirm) {
      setFormError(FORM_REFUSAL.passwordMismatch)
      return
    }
    setFormError(null)
    setSubmitting(true)
    const { error } = await updatePassword(newPassword)
    setSubmitting(false)
    if (error) {
      setFormError(error)
      return
    }
    setNotice('Password updated. Close this and carry on.')
    setNewPassword('')
    setNewPasswordConfirm('')
  }

  async function handleOAuth(provider: 'github' | 'google') {
    setFormError(null)
    const { error } = await signInWithOAuth(provider)
    if (error) setFormError(error)
  }

  function handleGuest() {
    onClose()
  }

  const usernameHint =
    usernameStatus === 'checking' ? (
      <div className="authmodal__hint">Checking…</div>
    ) : usernameStatus === 'available' ? (
      <div className="authmodal__hint authmodal__hint--good">✓ Available</div>
    ) : usernameStatus === 'taken' ? (
      <div className="authmodal__hint authmodal__hint--bad">Already taken</div>
    ) : usernameStatus === 'invalid' ? (
      <div className="authmodal__hint authmodal__hint--bad">{USERNAME_SHAPE}</div>
    ) : undefined

  const strength = getPasswordStrength(password)
  const passwordHint = password ? (
    <div className="authmodal__meter">
      <div className="authmodal__meter-track">
        <div className="authmodal__meter-fill" style={{ width: `${strength.percent}%` }} />
      </div>
      <div className="authmodal__meter-label">{strength.label}</div>
    </div>
  ) : undefined

  const confirmHint = confirm ? (
    confirm === password ? (
      <div className="authmodal__match">
        <IconCheck />
        <span>Match</span>
      </div>
    ) : (
      <div className="authmodal__hint authmodal__hint--bad">Doesn't match yet</div>
    )
  ) : undefined

  const newPasswordStrength = getPasswordStrength(newPassword)
  const newPasswordHint = newPassword ? (
    <div className="authmodal__meter">
      <div className="authmodal__meter-track">
        <div className="authmodal__meter-fill" style={{ width: `${newPasswordStrength.percent}%` }} />
      </div>
      <div className="authmodal__meter-label">{newPasswordStrength.label}</div>
    </div>
  ) : undefined

  const newPasswordConfirmHint = newPasswordConfirm ? (
    newPasswordConfirm === newPassword ? (
      <div className="authmodal__match">
        <IconCheck />
        <span>Match</span>
      </div>
    ) : (
      <div className="authmodal__hint authmodal__hint--bad">Doesn't match yet</div>
    )
  ) : undefined

  return (
    <div className="authmodal__backdrop" {...backdrop}>
      <div
        ref={cardRef}
        className="authmodal__card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="authmodal-title"
      >
        <div className="authmodal__glow-top" aria-hidden="true" />
        <div className="authmodal__glow-inset" aria-hidden="true" />

        <div className="authmodal__head">
          <TdgMark />
          <CloseButton onClick={onClose} />
        </div>

        <div className="authmodal__intro">
          <div className="authmodal__eyebrow">{recovery ? 'Password reset' : 'Welcome'}</div>
          <h1 className="authmodal__title" id="authmodal-title">
            {recovery ? 'Choose a new password' : tab === 'signup' ? 'Create your account' : 'Welcome back'}
          </h1>
          <p className="authmodal__subtitle">
            {recovery
              ? "You're signed in from the reset link. Set a new password to finish."
              : tab === 'signup'
                ? 'One account for everything TDG builds.'
                : 'Good to see you again.'}
          </p>
        </div>

        {recovery ? (
          <form className="authmodal__form" onSubmit={handleUpdatePasswordSubmit}>
            <GlowField
              id="rec-password"
              label="New password"
              icon={<IconLock />}
              type={showNewPassword ? 'text' : 'password'}
              masked={!showNewPassword}
              value={newPassword}
              onChange={setNewPassword}
              placeholder="••••••••"
              autoComplete="new-password"
              required
              rightSlot={<EyeToggle shown={showNewPassword} onToggle={() => setShowNewPassword((v) => !v)} />}
              hint={newPasswordHint}
            />
            <GlowField
              id="rec-password-confirm"
              className="authmodal__field--pre-cta"
              label="Confirm new password"
              icon={<IconLock />}
              type={showNewPasswordConfirm ? 'text' : 'password'}
              masked={!showNewPasswordConfirm}
              value={newPasswordConfirm}
              onChange={setNewPasswordConfirm}
              placeholder="••••••••"
              autoComplete="new-password"
              required
              rightSlot={
                <EyeToggle
                  shown={showNewPasswordConfirm}
                  onToggle={() => setShowNewPasswordConfirm((v) => !v)}
                />
              }
              hint={newPasswordConfirmHint}
            />

            {formError && (
              <div className="authmodal__error" role="alert">
                {formError}
              </div>
            )}
            {notice && (
              <div className="authmodal__notice" role="status">
                {notice}
              </div>
            )}

            <div className="authmodal__cta-row">
              <RingButton busy={submitting}>Update password</RingButton>
            </div>
            <div className="authmodal__foot">TDG Brothers</div>
          </form>
        ) : (
          <>
        <div className="authmodal__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'signup'}
            className={`authmodal__tab${tab === 'signup' ? ' authmodal__tab--active' : ''}`}
            onClick={() => switchTab('signup')}
          >
            Sign up
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'login'}
            className={`authmodal__tab${tab === 'login' ? ' authmodal__tab--active' : ''}`}
            onClick={() => switchTab('login')}
          >
            Log in
          </button>
        </div>

        {tab === 'signup' ? (
          <form className="authmodal__form" onSubmit={handleSignUpSubmit}>
            <div className="authmodal__grid2">
              <GlowField
                id="su-username"
                label="Username"
                icon={<IconUser />}
                type="text"
                value={username}
                onChange={setUsername}
                placeholder="clydemc"
                autoComplete="username"
                required
                hint={usernameHint}
              />
              <GlowField
                id="su-display"
                label="Display name"
                optionalTag
                icon={<IconCard />}
                type="text"
                value={displayName}
                onChange={setDisplayName}
                placeholder="Clyde M."
                autoComplete="name"
              />
            </div>

            <GlowField
              id="su-email"
              label="Email"
              icon={<IconMail />}
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />

            <div className="authmodal__grid2 authmodal__grid2--pre-cta">
              <GlowField
                id="su-password"
                label="Password"
                icon={<IconLock />}
                type={showPassword ? 'text' : 'password'}
                masked={!showPassword}
                value={password}
                onChange={setPassword}
                placeholder="••••••••"
                autoComplete="new-password"
                required
                rightSlot={<EyeToggle shown={showPassword} onToggle={() => setShowPassword((v) => !v)} />}
                hint={passwordHint}
              />
              <GlowField
                id="su-confirm"
                label="Confirm"
                icon={<IconLock />}
                type={showConfirm ? 'text' : 'password'}
                masked={!showConfirm}
                value={confirm}
                onChange={setConfirm}
                placeholder="••••••••"
                autoComplete="new-password"
                required
                rightSlot={<EyeToggle shown={showConfirm} onToggle={() => setShowConfirm((v) => !v)} />}
                hint={confirmHint}
              />
            </div>

            {formError && (
              <div className="authmodal__error" role="alert">
                {formError}
              </div>
            )}
            {notice && (
              <div className="authmodal__notice" role="status">
                {notice}
              </div>
            )}

            <div className="authmodal__cta-row">
              <RingButton busy={submitting}>Create account</RingButton>
            </div>

            <Divider label="or sign up with" />
            <SocialRow onGitHub={() => handleOAuth('github')} onGoogle={() => handleOAuth('google')} />

            <div className="authmodal__guest-row">
              <button type="button" className="authmodal__guest" onClick={handleGuest}>
                <span>Continue as guest</span>
                <IconArrow />
              </button>
            </div>
            <div className="authmodal__foot">TDG Brothers</div>
          </form>
        ) : (
          <form className="authmodal__form" onSubmit={handleLoginSubmit}>
            <GlowField
              id="li-id"
              label="Email or username"
              icon={<IconUser />}
              type="text"
              value={loginId}
              onChange={setLoginId}
              placeholder="you@example.com or clydemc"
              autoComplete="username"
              required
            />

            <div className="authmodal__label-row">
              <label htmlFor="li-password" className="authmodal__label">
                Password
              </label>
              <button type="button" className="authmodal__forgot" onClick={handleForgotPassword}>
                Forgot password?
              </button>
            </div>
            <GlowField
              id="li-password"
              className="authmodal__field--pre-cta"
              label={null}
              icon={<IconLock />}
              type={showLoginPassword ? 'text' : 'password'}
              masked={!showLoginPassword}
              value={loginPassword}
              onChange={setLoginPassword}
              placeholder="••••••••"
              autoComplete="current-password"
              required
              rightSlot={<EyeToggle shown={showLoginPassword} onToggle={() => setShowLoginPassword((v) => !v)} />}
            />

            {formError && (
              <div className="authmodal__error" role="alert">
                {formError}
              </div>
            )}
            {notice && (
              <div className="authmodal__notice" role="status">
                {notice}
              </div>
            )}

            <div className="authmodal__cta-row">
              <RingButton busy={submitting}>Log in</RingButton>
            </div>

            <Divider label="or log in with" />
            <SocialRow onGitHub={() => handleOAuth('github')} onGoogle={() => handleOAuth('google')} />

            <div className="authmodal__guest-row">
              <button type="button" className="authmodal__guest" onClick={handleGuest}>
                <span>Continue as guest</span>
                <IconArrow />
              </button>
            </div>
            <div className="authmodal__foot">TDG Brothers</div>
          </form>
        )}
          </>
        )}
      </div>
    </div>
  )
}
