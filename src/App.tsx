import { useState } from 'react'
import { MapContainer, TileLayer } from 'react-leaflet'
import { SignupForm } from './auth/SignupForm'
import type { PublicUser } from './api'

// Roughly centers the initial view over Finland.
const DEFAULT_CENTER: [number, number] = [64.5, 26.0]
const DEFAULT_ZOOM = 5

function App() {
  const [signedUpAs, setSignedUpAs] = useState<PublicUser | null>(null)

  return (
    <>
      <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} className="map">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
      </MapContainer>

      {/*
        RII-29: proves sign-up works end to end. Floating panel is a
        placeholder location — RII-31 (top nav bar) gives this a permanent
        home and adds the "who's logged in" state that persists across
        reloads (via RII-30's /me). This panel does not persist on reload.
      */}
      <div className="auth-panel">
        {signedUpAs ? (
          <p>Signed up as {signedUpAs.displayName}</p>
        ) : (
          <SignupForm onSignedUp={setSignedUpAs} />
        )}
      </div>
    </>
  )
}

export default App
