import { useState } from 'react'
import type { FormEvent } from 'react'
import { signUp, type PublicUser, type SignUpFieldErrors } from '../api'

interface SignupFormProps {
  onSignedUp: (user: PublicUser) => void
}

// RII-29: minimal sign-up form, no design system — matching the app's
// existing minimal-CSS approach (RII-26). Where this form lives on the page
// is temporary; RII-31 (top nav bar) is what gives it a permanent home.
export function SignupForm({ onSignedUp }: SignupFormProps) {
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<SignUpFieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setFormError(null)
    setFieldErrors({})

    const result = await signUp({ email, displayName, password })
    setSubmitting(false)

    if (!result.ok) {
      setFormError(result.message)
      setFieldErrors(result.fieldErrors ?? {})
      return
    }

    onSignedUp(result.user)
  }

  return (
    <form className="signup-form" onSubmit={handleSubmit}>
      <h2>Sign up</h2>

      <label htmlFor="signup-email">Email</label>
      <input
        id="signup-email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
        required
      />
      {fieldErrors.email && <p className="field-error">{fieldErrors.email}</p>}

      <label htmlFor="signup-display-name">Display name</label>
      <input
        id="signup-display-name"
        type="text"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        autoComplete="name"
        required
      />
      {fieldErrors.displayName && <p className="field-error">{fieldErrors.displayName}</p>}

      <label htmlFor="signup-password">Password</label>
      <input
        id="signup-password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="new-password"
        required
      />
      {fieldErrors.password && <p className="field-error">{fieldErrors.password}</p>}

      {formError && <p className="form-error">{formError}</p>}

      <button type="submit" disabled={submitting}>
        {submitting ? 'Signing up…' : 'Sign up'}
      </button>
    </form>
  )
}
