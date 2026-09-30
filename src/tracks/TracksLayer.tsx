import { useEffect, useMemo, useState } from 'react'
import { Polyline, Popup } from 'react-leaflet'
import L from 'leaflet'
import { getTracks, type PartySummary, type PublicTrack, type PublicUser } from '../api'
import { joinShortGaps } from './gapJoining'
import { SavedTrackPopup } from './SavedTrackPopup'
import { TrackImportControl } from './TrackImportControl'

interface TracksLayerProps {
  user: PublicUser | null
  barControls: HTMLElement | null
  // Changes when party membership changes (RII-45) — reload what's visible.
  reloadKey: number
  // RII-46: for the "Näkyy" pickers and popup labels.
  myParties: PartySummary[]
  // RII-49: the fog-of-war overlay is computed from the same list.
  onTracksChange: (tracks: PublicTrack[]) => void
}

// RII-3: saved tracks (solid) + the import control with its previews
// (dashed). Tracks are login-only, so logged out this shows no tracks. See
// docs/SPEC.md §5/§6.
export function TracksLayer({ user, barControls, reloadKey, myParties, onTracksChange }: TracksLayerProps) {
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
  }, [userId, reloadKey])

  const visibleTracks = user ? tracks : []

  useEffect(() => onTracksChange(tracks), [tracks, onTracksChange])

  // RII-38: what's drawn per track — short gaps joined, long ones left out.
  // Computed once per track list, not on every render.
  const drawnLines = useMemo(() => new Map(tracks.map((track) => [track.id, joinShortGaps(track.segments)])), [tracks])

  function handleSaved(track: PublicTrack) {
    setTracks((current) => [track, ...current])
  }

  function handleUpdated(updated: PublicTrack) {
    setTracks((current) => current.map((track) => (track.id === updated.id ? updated : track)))
  }

  function handleDeleted(id: string) {
    setTracks((current) => current.filter((track) => track.id !== id))
  }

  return (
    <>
      {visibleTracks.map((track) => (
        <Polyline key={track.id} positions={drawnLines.get(track.id) ?? []} pathOptions={pathOptions}>
          <Popup>
            <SavedTrackPopup
              track={track}
              drawnLines={drawnLines.get(track.id) ?? []}
              user={user}
              myParties={myParties}
              onUpdated={handleUpdated}
              onDeleted={handleDeleted}
            />
          </Popup>
        </Polyline>
      ))}
      <TrackImportControl user={user} onSaved={handleSaved} barControls={barControls} myParties={myParties} />
    </>
  )
}
