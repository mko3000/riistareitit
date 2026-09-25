import { useRef } from 'react'
import { CircleMarker, Popup } from 'react-leaflet'
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
}

// RII-23. Split out from SightingsLayer so each marker can hold its own ref
// to its Leaflet Popup instance — react-leaflet 5 has no usePopup() hook
// (only useMap/useMapEvent/useMapEvents), and a ref can't be created inside
// the .map() callback that renders these, since that would call useRef
// conditionally/out of order. See SightingDetailPopup for why the ref is
// needed at all.
export function SightingMarker({ sighting, onUpdated, onDeleted }: SightingMarkerProps) {
  const popupRef = useRef<LeafletPopup>(null)

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
        <SightingDetailPopup sighting={sighting} onUpdated={onUpdated} onDeleted={onDeleted} popupRef={popupRef} />
      </Popup>
    </CircleMarker>
  )
}
