import { useEffect, useRef, useState } from 'react'
import { Marker, Popup, useMap } from 'react-leaflet'
import type { Popup as LeafletPopup } from 'leaflet'
import type { PublicSighting } from '../api'
import { SightingDetailPopup } from './SightingDetailPopup'
import { markerIconFor } from './speciesIcons'

interface MoveTarget {
  lat: number
  lng: number
}

interface SightingMarkerProps {
  sighting: PublicSighting
  onUpdated: (sighting: PublicSighting) => void
  onDeleted: (id: string) => void
  onStartMove: (sightingId: string) => void
  // RII-34: non-null exactly once, right after SightingsLayer's map click
  // handler picks up the new location for *this* sighting. SightingMarker
  // reopens the popup here (rather than in SightingDetailPopup, which has
  // no access to the map instance) and applies the new coordinates to its
  // own stagedPosition below — see currentPosition's comment for why
  // SightingDetailPopup doesn't keep its own separate copy of this.
  moveTarget: MoveTarget | null
  onMoveTargetConsumed: () => void
}

// RII-23/RII-34. Split out from SightingsLayer so each marker can hold its
// own ref to its Leaflet Popup instance — react-leaflet 5 has no usePopup()
// hook (only useMap/useMapEvent/useMapEvents), and a ref can't be created
// inside the .map() callback that renders these, since that would call
// useRef conditionally/out of order. See SightingDetailPopup for why the
// ref is needed at all.
export function SightingMarker({
  sighting,
  onUpdated,
  onDeleted,
  onStartMove,
  moveTarget,
  onMoveTargetConsumed,
}: SightingMarkerProps) {
  const popupRef = useRef<LeafletPopup>(null)
  const map = useMap()

  // RII-34 UX fix: originally the marker stayed put until Save, so tapping
  // the map to move it gave zero visible feedback — Miko's report of
  // "tapping doesn't do anything" was this, not the tap actually being
  // dropped. The marker now jumps to the tapped spot immediately (still
  // unsaved; reverts on cancel, confirmed on save) so there's something to
  // actually see happen.
  const [stagedPosition, setStagedPosition] = useState<MoveTarget | null>(null)

  // Derived-during-render (not an effect): the same "adjust state when a
  // prop changes" pattern used in SightingDetailPopup, guarded by state
  // (not a ref) since refs aren't safe to read/write during render.
  const [lastAppliedMoveTarget, setLastAppliedMoveTarget] = useState<MoveTarget | null>(null)
  if (moveTarget && moveTarget !== lastAppliedMoveTarget) {
    setLastAppliedMoveTarget(moveTarget)
    setStagedPosition({ lat: moveTarget.lat, lng: moveTarget.lng })
  }

  // The imperative half (reopening the popup, telling the parent the
  // delivery was received) stays in an effect — real side effects, not
  // state derivation, so this doesn't trip the same lint rule.
  useEffect(() => {
    if (moveTarget) {
      popupRef.current?.openOn(map)
      onMoveTargetConsumed()
    }
  }, [moveTarget, map, onMoveTargetConsumed])

  function handleMove() {
    popupRef.current?.close()
    onStartMove(sighting.id)
  }

  // Once a save actually lands, `sighting.lat/lng` (from the refreshed
  // parent array) already matches what was staged — drop the local
  // override so future renders rely on the authoritative prop again.
  function handleUpdated(updated: PublicSighting) {
    setStagedPosition(null)
    onUpdated(updated)
  }

  // Cancelling a move without saving must snap the marker back — otherwise
  // it's left sitting at an unsaved position indefinitely.
  function handleCancelEdit() {
    setStagedPosition(null)
  }

  // Single source of truth for "where is this marking right now" — staged
  // (unsaved) if a move is in progress, the saved position otherwise.
  // SightingDetailPopup reads this same value directly for its Save
  // payload rather than keeping its own separately-synced copy: two copies
  // of "the current position" updated via two different delivery paths is
  // exactly the kind of setup that drifts out of sync, which is what was
  // actually happening — Save was sending the *original* lat/lng, not the
  // staged one, even though the marker itself had already visually moved.
  const currentPosition = stagedPosition ?? { lat: sighting.lat, lng: sighting.lng }

  return (
    // RII-5: species silhouette on a sighting/kill-colored badge — see
    // speciesIcons.ts. Icon reflects the *saved* species/kind; unsaved edits
    // in the popup don't restyle the marker until Save, same as before.
    <Marker position={[currentPosition.lat, currentPosition.lng]} icon={markerIconFor(sighting)}>
      {/* remove fires on any close, including Leaflet's own "×" button —
          not just our explicit Cancel button — so a staged-but-unsaved
          move gets reverted no matter how the popup was closed. Also fires
          from our own popupRef.current?.close() when Move is clicked, but
          stagedPosition is always still null at that exact point, so
          clearing it again there is harmless. */}
      <Popup ref={popupRef} eventHandlers={{ remove: handleCancelEdit }}>
        <SightingDetailPopup
          sighting={sighting}
          currentPosition={currentPosition}
          onUpdated={handleUpdated}
          onDeleted={onDeleted}
          onCancelEdit={handleCancelEdit}
          popupRef={popupRef}
          onMove={handleMove}
        />
      </Popup>
    </Marker>
  )
}
