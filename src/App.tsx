import { MapContainer, TileLayer } from 'react-leaflet'
import { AuthBar } from './auth/AuthBar'
import { SightingsLayer } from './sightings/SightingsLayer'

// Roughly centers the initial view over Finland.
const DEFAULT_CENTER: [number, number] = [64.5, 26.0]
const DEFAULT_ZOOM = 5

function App() {
  return (
    <div className="app-shell">
      <AuthBar />
      <div className="map-area">
        <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} className="map">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <SightingsLayer />
        </MapContainer>
      </div>
    </div>
  )
}

export default App
