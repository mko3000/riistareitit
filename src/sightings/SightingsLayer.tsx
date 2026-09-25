import { useEffect, useState } from 'react'
import { CircleMarker, Popup, useMapEvents } from 'react-leaflet'
import { getSightings, type PublicSighting } from '../api'
import { AddSightingForm } from './AddSightingForm'
import { SightingDetailPopup } from './SightingDetailPopup'

interface PendingLocation {
  lat: number
  lng: number
}

const MARKER_COLOR: Record<PublicSighting['kind'], string> = {
  sighting: '#2563eb', // same blue as .link-button, for visual consistency
  kill: '#b00020', // same red as .field-error/.form-error
}

// RII-22/RII-23. Rendered as a child of <MapContainer> (useMapEvents only
// works inside the map's own React tree). Markers here are deliberately
// basic — a colored dot distinguishing sighting vs. kill — per-species
// icons are RII-5's job, not either ticket's.
export function SightingsLayer() {
  const [sightings, setSightings] = useState<PublicSighting[]>([])
  const [pendingLocation, setPendingLocation] = useState<PendingLocation | null>(null)

  useEffect(() => {
    getSightings().then(setSightings)
  }, [])

  useMapEvents({
    click(event) {
      // Ignore taps while the add form is already open — avoid silently
      // relocating the pending add or opening a second one. Taps on an
      // *existing* marker never reach here at all: Leaflet's marker click
      // handling stops the event from also being seen as a map click.
      if (pendingLocation) return
      setPendingLocation({ lat: event.latlng.lat, lng: event.latlng.lng })
    },
  })

  function handleCreated(sighting: PublicSighting) {
    setSightings((current) => [sighting, ...current])
    setPendingLocation(null)
  }

  function handleUpdated(updated: PublicSighting) {
    setSightings((current) => current.map((s) => (s.id === updated.id ? updated : s)))
  }

  function handleDeleted(id: string) {
    setSightings((current) => current.filter((s) => s.id !== id))
  }

  return (
    <>
      {sightings.map((sighting) => (
        <CircleMarker
          key={sighting.id}
          center={[sighting.lat, sighting.lng]}
          radius={8}
          pathOptions={{
            color: MARKER_COLOR[sighting.kind],
            fillColor: MARKER_COLOR[sighting.kind],
            fillOpacity: 0.9,
          }}
        >
          {/* Nested Popup: Leaflet opens/closes this natively on marker
              click/close, no manual "which marker is open" state needed. */}
          <Popup autoPan={false}>
            <SightingDetailPopup sighting={sighting} onUpdated={handleUpdated} onDeleted={handleDeleted} />
          </Popup>
        </CircleMarker>
      ))}

      {pendingLocation && (
        <Popup
          position={[pendingLocation.lat, pendingLocation.lng]}
          eventHandlers={{ remove: () => setPendingLocation(null) }}
          // The form's content resizes as fields toggle (e.g. editing the
          // person name, picking "Other" species) — autoPan repositioning
          // the map mid-edit was a suspected trigger for the popup
          // appearing to close unexpectedly. Disabled since this popup
          // doesn't need to auto-pan into view anyway (it opens exactly
          // where the user just tapped).
          autoPan={false}
        >
          <AddSightingForm lat={pendingLocation.lat} lng={pendingLocation.lng} onCreated={handleCreated} />
        </Popup>
      )}
    </>
  )
}
