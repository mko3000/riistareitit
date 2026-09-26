import { useEffect, useMemo, useState } from 'react'
import { Polyline, Popup } from 'react-leaflet'
import L from 'leaflet'
import { getTracks, type PublicTrack, type PublicUser } from '../api'
import { SavedTrackPopup } from './SavedTrackPopup'
import { TrackImportControl } from './TrackImportControl'

interface TracksLayerProps {
  user: PublicUser | null
  barControls: HTMLElement | null
}

// RII-3: saved tracks (solid) + the import control with its previews
// (dashed). Tracks are login-only, so logged out this shows no tracks. See
// docs/SPEC.md §5/§6.
export function TracksLayer({ user, barControls }: TracksLayerProps) {
  const [tracks, setTracks] = useState<PublicTrack[]>([])

  // One canvas for all saved tracks — much cheaper than an SVG path per
  // segment once there are many long tracks. Tolerance widens the tap
  // target on phones without drawing a thicker line.
  const renderer = useMemo(() => L.canvas({ tolerance: 8 }), [])
  const pathOptions = useMemo(
    () => ({
      color: '#ea580c',
      weight: 4,
      renderer,
      // Otherwise the tap also reaches the map and opens the add-sighting popup.
      bubblingMouseEvents: false,
    }),
    [renderer],
  )

  const userId = user?.id
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    getTracks().then((loaded) => {
      if (!cancelled) setTracks(loaded)
    })
    return () => {
      cancelled = true
    }
  }, [userId])

  const visibleTracks = user ? tracks : []

  function handleSaved(track: PublicTrack) {
    setTracks((current) => [track, ...current])
  }

  function handleDeleted(id: string) {
    setTracks((current) => current.filter((track) => track.id !== id))
  }

  return (
    <>
      {visibleTracks.map((track) => (
        <Polyline key={track.id} positions={track.segments} pathOptions={pathOptions}>
          <Popup>
            <SavedTrackPopup track={track} user={user} onDeleted={handleDeleted} />
          </Popup>
        </Polyline>
      ))}
      <TrackImportControl user={user} onSaved={handleSaved} barControls={barControls} />
    </>
  )
}
