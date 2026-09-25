import { useEffect, useState } from 'react'
import { MapContainer, TileLayer } from 'react-leaflet'
import { SignupForm } from './auth/SignupForm'
import { LoginForm } from './auth/LoginForm'
import { getMe, logout, type PublicUser } from './api'

// Roughly centers the initial view over Finland.
const DEFAULT_CENTER: [number, number] = [64.5, 26.0]
const DEFAULT_ZOOM = 5

function App() {
  const [user, setUser] = useState<PublicUser | null>(null)
  const [checkingSession, setCheckingSession] = useState(true)
  const [authView, setAuthView] = useState<'signup' | 'login'>('signup')

  // RII-30: proves the session actually persists across a reload, not just
  // within one page visit — check /me once on mount.
  useEffect(() => {
    getMe()
      .then(setUser)
      .finally(() => setCheckingSession(false))
  }, [])

  async function handleLogout() {
    await logout()
    setUser(null)
  }

  return (
    <>
      <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} className="map">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
      </MapContainer>

      {/*
        RII-29/RII-30: proves sign-up, login, logout, and the /me session
        check all work end to end. Floating panel is a placeholder location
        — RII-31 (top nav bar) gives this a permanent home.
      */}
      <div className="auth-panel">
        {checkingSession ? (
          <p>Checking session…</p>
        ) : user ? (
          <>
            <p>Signed in as {user.displayName}</p>
            <button type="button" onClick={handleLogout}>
              Log out
            </button>
          </>
        ) : authView === 'signup' ? (
          <SignupForm onSignedUp={setUser} onSwitchToLogin={() => setAuthView('login')} />
        ) : (
          <LoginForm onLoggedIn={setUser} onSwitchToSignup={() => setAuthView('signup')} />
        )}
      </div>
    </>
  )
}

export default App
