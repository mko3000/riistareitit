import { useMemo, useState } from 'react'
import { deleteTrack, type PublicTrack, type PublicUser } from '../api'
import { formatFinnishDate, formatKm } from './format'
import { trackDistanceM } from './trackStats'

interface SavedTrackPopupProps {
  track: PublicTrack
  user: PublicUser | null
  onDeleted: (id: string) => void
}

// RII-3: popup content for a saved track. Delete is owner-only (the server
// enforces it too — this just hides the button for others).
export function SavedTrackPopup({ track, user, onDeleted }: SavedTrackPopupProps) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const distanceM = useMemo(
    () =>
      trackDistanceM({
        sourceFormat: track.sourceFormat,
        segments: track.segments.map((segment) => segment.map(([lat, lng]) => ({ lat, lng }))),
      }),
    [track],
  )
  const isOwn = user !== null && track.owner?.id === user.id

  async function handleDelete() {
    // Same pattern as sightings: the native confirm() says exactly what's needed.
    if (!window.confirm(`Poistetaanko reitti "${track.name}"? Tätä ei voi perua.`)) return
    setDeleting(true)
    setError(null)
    const result = await deleteTrack(track.id)
    if (!result.ok) {
      setDeleting(false)
      setError(result.message)
      return
    }
    onDeleted(track.id)
  }

  return (
    <div className="track-detail">
      <p className="track-import-name">{track.name}</p>
      <p>
        {track.recordedDate && `${formatFinnishDate(track.recordedDate)} · `}
        {formatKm(distanceM)}
      </p>
      <p>Tuonut: {track.owner?.displayName ?? 'tuntematon'}</p>
      {isOwn && (
        <button type="button" onClick={handleDelete} disabled={deleting}>
          {deleting ? 'Poistetaan…' : 'Poista reitti'}
        </button>
      )}
      {error && <p className="form-error">{error}</p>}
    </div>
  )
}
