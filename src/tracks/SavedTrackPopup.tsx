import { useMemo, useState } from 'react'
import { deleteTrack, setTrackParty, type PartySummary, type PublicTrack, type PublicUser } from '../api'
import { formatFinnishDate, formatKm } from './format'
import type { LatLngPair } from './geo'
import { pathDistanceM } from './trackStats'
import { t } from '../i18n'
import { VisibilityPicker } from '../parties/VisibilityPicker'
import { visibilityName } from '../parties/visibility'

interface SavedTrackPopupProps {
  track: PublicTrack
  // The lines actually drawn for this track (short gaps joined, RII-38) —
  // the distance shown is theirs, so number and line agree.
  drawnLines: LatLngPair[][]
  user: PublicUser | null
  // RII-46: for the "Näkyy" label, and the owner's picker to move the track.
  myParties: PartySummary[]
  onUpdated: (track: PublicTrack) => void
  onDeleted: (id: string) => void
}

// RII-3: popup content for a saved track. Delete is owner-only (the server
// enforces it too — this just hides the button for others).
export function SavedTrackPopup({ track, drawnLines, user, myParties, onUpdated, onDeleted }: SavedTrackPopupProps) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [changingParty, setChangingParty] = useState(false)

  const distanceM = useMemo(() => pathDistanceM(drawnLines), [drawnLines])
  const isOwn = user !== null && track.owner?.id === user.id

  // RII-46: applied immediately — there's nothing else to edit on a track.
  async function handlePartyChange(partyId: string | null) {
    setChangingParty(true)
    setError(null)
    const result = await setTrackParty(track.id, partyId)
    setChangingParty(false)
    if (!result.ok) {
      setError(result.message)
      return
    }
    onUpdated(result.track)
  }

  async function handleDelete() {
    // Same pattern as sightings: the native confirm() says exactly what's needed.
    if (!window.confirm(t.tracks.confirmDelete(track.name))) return
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
      <p>{t.tracks.importedBy(track.owner?.displayName ?? t.tracks.unknownImporter)}</p>
      {isOwn ? (
        <VisibilityPicker
          parties={myParties}
          value={track.partyId}
          onChange={handlePartyChange}
          disabled={changingParty}
        />
      ) : (
        <p className="parties-muted">{t.visibility.shownIn(visibilityName(track.partyId, myParties))}</p>
      )}
      {isOwn && (
        <button type="button" onClick={handleDelete} disabled={deleting}>
          {deleting ? t.tracks.deleting : t.tracks.deleteTrack}
        </button>
      )}
      {error && <p className="form-error">{error}</p>}
    </div>
  )
}
