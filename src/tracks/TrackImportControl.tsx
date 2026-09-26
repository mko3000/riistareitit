import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Polyline, useMap } from 'react-leaflet'
import L, { type LatLngTuple } from 'leaflet'
import { parseTrackFile } from './parseTrackFile'
import { TrackParseError } from './parsers/common'
import { trackDistanceM, trackPointCount } from './trackStats'
import type { ImportedTrack } from './types'

type ImportEntry =
  | {
      id: number
      fileName: string
      status: 'ok'
      track: ImportedTrack
      positions: LatLngTuple[][]
      distanceM: number
      pointCount: number
    }
  | { id: number; fileName: string; status: 'error'; message: string }

// Preview only: dashed so it reads as "not saved" once RII-3 draws saved
// tracks solid. Orange to stay clear of the sighting (blue) / kill (red) pins.
const PREVIEW_PATH_OPTIONS = { color: '#ea580c', weight: 4, dashArray: '6 8', interactive: false }

let nextEntryId = 1

async function parseFile(file: File): Promise<ImportEntry> {
  const id = nextEntryId++
  try {
    const track = parseTrackFile(file.name, await file.text())
    return {
      id,
      fileName: file.name,
      status: 'ok',
      track,
      positions: track.segments.map((segment) => segment.map((p): LatLngTuple => [p.lat, p.lng])),
      distanceM: trackDistanceM(track),
      pointCount: trackPointCount(track),
    }
  } catch (err) {
    const message =
      err instanceof TrackParseError ? err.message : `Tiedoston ${file.name} lukeminen epäonnistui.`
    if (!(err instanceof TrackParseError)) console.error(err)
    return { id, fileName: file.name, status: 'error', message }
  }
}

function formatFinnishDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  return `${day}.${month}.${year}`
}

function formatKm(meters: number): string {
  return `${(meters / 1000).toFixed(1).replace('.', ',')} km`
}

// RII-16: pick track files (several at once), parse them in the browser and
// preview them on the map. See docs/SPEC.md §5 "Import UI". Rendered inside
// <MapContainer> for useMap(); the panel stops its own clicks from reaching
// the map so they don't open the add-sighting popup.
export function TrackImportControl() {
  const map = useMap()
  const [entries, setEntries] = useState<ImportEntry[]>([])
  const [reading, setReading] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    L.DomEvent.disableClickPropagation(panel)
    L.DomEvent.disableScrollPropagation(panel)
  }, [])

  async function handleFilesPicked(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    // Reset so picking the same file again still fires onChange.
    event.target.value = ''
    if (files.length === 0) return

    setReading(true)
    const parsed = await Promise.all(files.map(parseFile))
    setReading(false)
    setEntries((current) => [...current, ...parsed])

    const newPositions = parsed.flatMap((entry) => (entry.status === 'ok' ? entry.positions.flat() : []))
    if (newPositions.length > 0) map.fitBounds(L.latLngBounds(newPositions), { padding: [24, 24] })
  }

  function removeEntry(id: number) {
    setEntries((current) => current.filter((entry) => entry.id !== id))
  }

  return (
    <>
      {entries.map((entry) =>
        entry.status === 'ok' ? (
          <Polyline key={entry.id} positions={entry.positions} pathOptions={PREVIEW_PATH_OPTIONS} />
        ) : null,
      )}

      <div ref={panelRef} className="track-import">
        {/* No `accept` filter on purpose — on phones it greys out .tcx/.gpx/.kml
            files, since those have no well-known MIME type. Bad files are
            rejected per file after picking instead. */}
        <input ref={fileInputRef} type="file" multiple hidden onChange={handleFilesPicked} />
        <button type="button" className="track-import-button"
          disabled={reading}
          onClick={() => fileInputRef.current?.click()}
        >
          {reading ? 'Luetaan…' : 'Tuo reittejä'}
        </button>

        {entries.length > 0 && (
          <div className="track-import-panel">
            <p className="track-import-note">Esikatselu – reittejä ei vielä tallenneta.</p>
            <ul className="track-import-list">
              {entries.map((entry) => (
                <li key={entry.id} className={entry.status === 'error' ? 'track-import-error' : undefined}>
                  <div className="track-import-entry-text">
                    <span className="track-import-name">
                      {entry.status === 'ok' ? (entry.track.name ?? entry.fileName) : entry.fileName}
                    </span>
                    {entry.status === 'ok' && (
                      <span>
                        {entry.track.recordedDate && `${formatFinnishDate(entry.track.recordedDate)} · `}
                        {formatKm(entry.distanceM)} · {entry.pointCount} pistettä
                      </span>
                    )}
                    {entry.status === 'error' && <span>{entry.message}</span>}
                  </div>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Poista ${entry.fileName}`}
                    onClick={() => removeEntry(entry.id)}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="link-button" onClick={() => setEntries([])}>
              Tyhjennä kaikki
            </button>
          </div>
        )}
      </div>
    </>
  )
}
