import { useState } from 'react'
import type { FormEvent } from 'react'
import { login, type PublicUser } from '../api'

interface LoginFormProps {
  onLoggedIn: (user: PublicUser) => void
  onSwitchToSignup: () => void
}

// RII-30: minimal login form, same approach as RII-29's SignupForm — no
// design system, temporary placement until RII-31's nav bar.
export function LoginForm({ onLoggedIn, onSwitchToSignup }: LoginFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setFormError(null)

    const result = await login({ email, password })
    setSubmitting(false)

    if (!result.ok) {
      // Login only ever has one generic error (no per-field errors — the
      // server deliberately doesn't say which of email/password was wrong).
      setFormError(result.message)
      return
    }

    onLoggedIn(result.user)
  }

  return (
    <form className="signup-form" onSubmit={handleSubmit}>
      <h2>Log in</h2>

      <label htmlFor="login-email">Email</label>
      <input
        id="login-email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
        required
      />

      <label htmlFor="login-password">Password</label>
      <input
        id="login-password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="current-password"
        required
      />

      {formError && <p className="form-error">{formError}</p>}

      <button type="submit" disabled={submitting}>
        {submitting ? 'Logging in…' : 'Log in'}
      </button>

      <button type="button" className="link-button" onClick={onSwitchToSignup}>
        Need an account? Sign up
      </button>
    </form>
  )
}
