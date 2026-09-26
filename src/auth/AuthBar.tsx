import { useState } from 'react'
import { logout, type PublicUser } from '../api'
import { SignupForm } from './SignupForm'
import { LoginForm } from './LoginForm'

type AuthView = 'signup' | 'login' | null

interface AuthBarProps {
  user: PublicUser | null
  checkingSession: boolean
  onUserChange: (user: PublicUser | null) => void
  // RII-40: other features render their top-bar controls into this element
  // (via a portal) — e.g. the track import button, which has to live inside
  // the map's React tree.
  controlsSlotRef: (element: HTMLDivElement | null) => void
}

// RII-31: the permanent home for sign-up/login/logout — replaces the
// temporary floating panel RII-29/RII-30 used just to prove the endpoints
// worked. Auth state itself lives in App since RII-3: the tracks layer also
// needs to know who's logged in (tracks are login-only, delete is
// owner-only).
export function AuthBar({ user, checkingSession, onUserChange, controlsSlotRef }: AuthBarProps) {
  const [authView, setAuthView] = useState<AuthView>(null)

  function handleAuthenticated(authenticatedUser: PublicUser) {
    onUserChange(authenticatedUser)
    setAuthView(null)
  }

  async function handleLogout() {
    await logout()
    onUserChange(null)
  }

  return (
    <header className="top-nav">
      <span className="app-name">Riistareitit</span>
      <div ref={controlsSlotRef} className="bar-controls"></div>

      <div className="auth-controls">
        {checkingSession ? (
          <span>Checking session…</span>
        ) : user ? (
          <>
            <span>Signed in as {user.displayName}</span>
            <button type="button" onClick={handleLogout}>
              Log out
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setAuthView((current) => (current === 'login' ? null : 'login'))}
            >
              Log in
            </button>
          </>
        )}
      </div>

      {!user && authView && (
        <div className="auth-dropdown">
          {authView === 'signup' ? (
            <SignupForm onSignedUp={handleAuthenticated} onSwitchToLogin={() => setAuthView('login')} />
          ) : (
            <LoginForm onLoggedIn={handleAuthenticated} onSwitchToSignup={() => setAuthView('signup')} />
          )}
        </div>
      )}
    </header>
  )
}
