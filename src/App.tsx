import { useEffect, useState } from 'react'
import { MapContainer, TileLayer } from 'react-leaflet'
import { getMe, type PublicUser } from './api'
import { AuthBar } from './auth/AuthBar'
import { SightingsLayer } from './sightings/SightingsLayer'
import { TracksLayer } from './tracks/TracksLayer'

// Roughly centers the initial view over Finland.
const DEFAULT_CENTER: [number, number] = [64.5, 26.0]
const DEFAULT_ZOOM = 5

function App() {
  const [user, setUser] = useState<PublicUser | null>(null)
  const [checkingSession, setCheckingSession] = useState(true)

  // RII-30's acceptance criterion: session (and now the UI reflecting it)
  // persists across a reload.
  useEffect(() => {
    getMe()
      .then(setUser)
      .finally(() => setCheckingSession(false))
  }, [])

  return (
    <div className="app-shell">
      <AuthBar user={user} checkingSession={checkingSession} onUserChange={setUser} />
      <div className="map-area">
        <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} className="map">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <TracksLayer user={user} />
          <SightingsLayer />
        </MapContainer>
      </div>
    </div>
  )
}

export default App
