import { useEffect, useRef } from 'react'
import { CircleMarker, Popup, useMap } from 'react-leaflet'
import type { Popup as LeafletPopup } from 'leaflet'
import type { PublicSighting } from '../api'
import { SightingDetailPopup } from './SightingDetailPopup'

const MARKER_COLOR: Record<PublicSighting['kind'], string> = {
  sighting: '#2563eb', // same blue as .link-button, for visual consistency
  kill: '#b00020', // same red as .field-error/.form-error
}

interface SightingMarkerProps {
  sighting: PublicSighting
  onUpdated: (sighting: PublicSighting) => void
  onDeleted: (id: string) => void
  onStartMove: (sightingId: string) => void
  // RII-34: non-null exactly once, right after SightingsLayer's map click
  // handler picks up the new location for *this* sighting. SightingMarker
  // reopens the popup here (rather than in SightingDetailPopup, which has
  // no access to the map instance); SightingDetailPopup applies the actual
  // lat/lng to its own local state from the same prop.
  moveTarget: { lat: number; lng: number } | null
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

  // Runs once per delivered move: reopens the popup (closed when Move was
  // clicked, to get it out of the way for the map tap) and immediately
  // tells the parent the delivery was received, so this doesn't refire on
  // every subsequent render.
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

  return (
    <CircleMarker
      center={[sighting.lat, sighting.lng]}
      radius={8}
      pathOptions={{
        color: MARKER_COLOR[sighting.kind],
        fillColor: MARKER_COLOR[sighting.kind],
        fillOpacity: 0.9,
      }}
    >
      <Popup ref={popupRef}>
        <SightingDetailPopup
          sighting={sighting}
          onUpdated={onUpdated}
          onDeleted={onDeleted}
          popupRef={popupRef}
          onMove={handleMove}
          pendingNewLocation={moveTarget}
        />
      </Popup>
    </CircleMarker>
  )
}
