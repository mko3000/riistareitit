import { useEffect, useRef, useState } from 'react'
import { Popup, useMapEvents } from 'react-leaflet'
import type { Popup as LeafletPopup } from 'leaflet'
import { getSightings, type PublicSighting } from '../api'
import { AddSightingForm } from './AddSightingForm'
import { SightingMarker } from './SightingMarker'

interface PendingLocation {
  lat: number
  lng: number
}

interface PendingMoveTarget {
  sightingId: string
  lat: number
  lng: number
}

// RII-22/RII-23/RII-34. Rendered as a child of <MapContainer> (useMapEvents
// only works inside the map's own React tree). Marker appearance
// (species icon + sighting/kill color, RII-5) lives in speciesIcons.ts.
export function SightingsLayer() {
  const [sightings, setSightings] = useState<PublicSighting[]>([])
  const [pendingLocation, setPendingLocation] = useState<PendingLocation | null>(null)
  const addPopupRef = useRef<LeafletPopup>(null)

  // RII-34: which sighting (if any) is waiting for its next map tap to
  // become its new location, and — once that tap lands — the one-shot
  // delivery of where. Two separate pieces of state rather than one,
  // because "waiting" needs to survive across renders until a tap occurs,
  // while "delivered" needs to reset back to null immediately after
  // SightingMarker consumes it (see its own comment on this).
  const [movingSightingId, setMovingSightingId] = useState<string | null>(null)
  const [pendingMoveTarget, setPendingMoveTarget] = useState<PendingMoveTarget | null>(null)

  useEffect(() => {
    getSightings().then(setSightings)
  }, [])

  // RII-34: Escape backs out of "pick a new location" mode without
  // changing anything — the popup was already closed when Move was
  // clicked, so there's no visible cancel button to offer otherwise.
  useEffect(() => {
    if (!movingSightingId) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMovingSightingId(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [movingSightingId])

  useMapEvents({
    click(event) {
      if (movingSightingId) {
        setPendingMoveTarget({ sightingId: movingSightingId, lat: event.latlng.lat, lng: event.latlng.lng })
        setMovingSightingId(null)
        return
      }
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
      {movingSightingId && (
        <div className="move-banner">Tap the map to move this marking (Esc to cancel)</div>
      )}

      {sightings.map((sighting) => (
        <SightingMarker
          key={sighting.id}
          sighting={sighting}
          onUpdated={handleUpdated}
          onDeleted={handleDeleted}
          onStartMove={setMovingSightingId}
          moveTarget={pendingMoveTarget?.sightingId === sighting.id ? pendingMoveTarget : null}
          onMoveTargetConsumed={() => setPendingMoveTarget(null)}
        />
      ))}

      {pendingLocation && (
        <Popup
          ref={addPopupRef}
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
          <AddSightingForm
            lat={pendingLocation.lat}
            lng={pendingLocation.lng}
            onCreated={handleCreated}
            popupRef={addPopupRef}
          />
        </Popup>
      )}
    </>
  )
}
