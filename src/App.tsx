import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { MapContainer } from 'react-leaflet'
import { getMe, type PublicSighting, type PublicTrack, type PublicUser } from './api'
import { AuthBar } from './auth/AuthBar'
import { FogOfWarOverlay } from './fog/FogOfWarLayer'
import { BaseLayers } from './map/BaseLayers'
import { JoinPartyDialog } from './parties/JoinPartyDialog'
import { PartiesMenu } from './parties/PartiesMenu'
import { useMyParties } from './parties/useMyParties'
import { SightingsLayer } from './sightings/SightingsLayer'
import { TracksLayer } from './tracks/TracksLayer'
import { t } from './i18n'

// Roughly centers the initial view over Finland.
const DEFAULT_CENTER: [number, number] = [64.5, 26.0]
const DEFAULT_ZOOM = 5

function App() {
  const [user, setUser] = useState<PublicUser | null>(null)
  const [checkingSession, setCheckingSession] = useState(true)
  // RII-40: the top bar's controls slot, handed to map-side features that
  // portal their buttons into it. State (not a ref) so they re-render once
  // the element exists.
  const [barControls, setBarControls] = useState<HTMLDivElement | null>(null)
  // RII-45: bumped after joining/leaving/deleting a party — what the map may
  // show changed, so sightings and tracks reload (and an open parties list).
  const [membershipVersion, setMembershipVersion] = useState(0)
  const bumpMembership = () => setMembershipVersion((version) => version + 1)
  // RII-46: for the "Näkyy" pickers and popup labels.
  const myParties = useMyParties(user?.id, membershipVersion)
  // RII-49: what the tracks and sightings layers loaded, for the fog of war.
  const [tracks, setTracks] = useState<PublicTrack[]>([])
  const [sightings, setSightings] = useState<PublicSighting[]>([])

  // RII-30's acceptance criterion: session (and now the UI reflecting it)
  // persists across a reload.
  useEffect(() => {
    getMe()
      .then(setUser)
      .finally(() => setCheckingSession(false))
  }, [])

  return (
    <div className="app-shell">
      <AuthBar user={user} checkingSession={checkingSession} onUserChange={setUser} controlsSlotRef={setBarControls} />
      <div className="map-area">
        <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} className="map">
          {/* RII-41: which base layers are offered depends on login, so wait
              for the session check rather than loading OSM tiles first. */}
          {!checkingSession && (
            <BaseLayers key={user ? 'in' : 'out'} loggedIn={user !== null}>
              {user && <FogOfWarOverlay tracks={tracks} sightings={sightings} />}
            </BaseLayers>
          )}
          <TracksLayer
            user={user}
            barControls={barControls}
            reloadKey={membershipVersion}
            myParties={myParties}
            onTracksChange={setTracks}
          />
          <SightingsLayer
            user={user}
            reloadKey={membershipVersion}
            myParties={myParties}
            onSightingsChange={setSightings}
          />
        </MapContainer>
        {/* RII-43: logged out, no sightings or tracks are visible or addable. */}
        {!checkingSession && !user && <div className="login-notice">{t.map.loginToSeeData}</div>}
        <JoinPartyDialog user={user} checkingSession={checkingSession} onJoined={bumpMembership} />
      </div>
      {user &&
        barControls &&
        createPortal(
          <PartiesMenu user={user} onMembershipChanged={bumpMembership} membershipVersion={membershipVersion} />,
          barControls,
        )}
    </div>
  )
}

export default App
