import { useEffect, useState } from 'react'
import { getMe, logout, type PublicUser } from '../api'
import { SignupForm } from './SignupForm'
import { LoginForm } from './LoginForm'

type AuthView = 'signup' | 'login' | null

// RII-31: the permanent home for sign-up/login/logout — replaces the
// temporary floating panel RII-29/RII-30 used just to prove the endpoints
// worked. Owns its own auth state; nothing else in the app currently needs
// to know who's logged in.
export function AuthBar() {
  const [user, setUser] = useState<PublicUser | null>(null)
  const [checkingSession, setCheckingSession] = useState(true)
  const [authView, setAuthView] = useState<AuthView>(null)

  // RII-30's acceptance criterion: session (and now the UI reflecting it)
  // persists across a reload.
  useEffect(() => {
    getMe()
      .then(setUser)
      .finally(() => setCheckingSession(false))
  }, [])

  function handleAuthenticated(authenticatedUser: PublicUser) {
    setUser(authenticatedUser)
    setAuthView(null)
  }

  async function handleLogout() {
    await logout()
    setUser(null)
  }

  return (
    <header className="top-nav">
      <span className="app-name">Riistareitit</span>

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
