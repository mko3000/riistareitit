import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { createPortal } from 'react-dom'
import { Polyline, useMap } from 'react-leaflet'
import L, { type LatLngTuple } from 'leaflet'
import { createTrack, type PublicTrack, type PublicUser } from '../api'
import { formatFinnishDate, formatKm } from './format'
import { parseTrackFile } from './parseTrackFile'
import { TrackParseError } from './parsers/common'
import { trackDistanceM, trackPointCount } from './trackStats'
import type { ImportedTrack } from './types'
import { t } from '../i18n'

type ParsedEntry = {
  id: number
  fileName: string
  status: 'ok'
  name: string // from the file, else the file name
  track: ImportedTrack
  positions: LatLngTuple[][]
  distanceM: number
  pointCount: number
  saving: boolean
  saveError: string | null
}

type ImportEntry = ParsedEntry | { id: number; fileName: string; status: 'error'; message: string }

// Dashed so an unsaved preview reads differently from a saved (solid) track.
// Orange to stay clear of the sighting (blue) / kill (red) pins.
const PREVIEW_PATH_OPTIONS = { color: '#ea580c', weight: 4, dashArray: '6 8', interactive: false }

let nextEntryId = 1

function withoutExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot > 0 ? fileName.slice(0, dot) : fileName
}

async function parseFile(file: File): Promise<ImportEntry> {
  const id = nextEntryId++
  try {
    const track = parseTrackFile(file.name, await file.text())
    return {
      id,
      fileName: file.name,
      status: 'ok',
      name: track.name ?? withoutExtension(file.name),
      track,
      positions: track.segments.map((segment) => segment.map((p): LatLngTuple => [p.lat, p.lng])),
      distanceM: trackDistanceM(track),
      pointCount: trackPointCount(track),
      saving: false,
      saveError: null,
    }
  } catch (err) {
    const message =
      err instanceof TrackParseError ? err.message : t.tracks.errors.readFailed(file.name)
    if (!(err instanceof TrackParseError)) console.error(err)
    return { id, fileName: file.name, status: 'error', message }
  }
}

interface TrackImportControlProps {
  user: PublicUser | null
  onSaved: (track: PublicTrack) => void
  // RII-40: where the "Tuo reittejä" button renders — the top bar's controls
  // slot. Null until the top bar has mounted.
  barControls: HTMLElement | null
}

// RII-16: pick track files (several at once), parse them in the browser and
// preview them on the map. RII-3: save them (login required). See
// docs/SPEC.md §5 "Import UI". Rendered inside <MapContainer> for useMap();
// the panel stops its own clicks from reaching the map so they don't open
// the add-sighting popup. The button is portaled into the top bar (RII-40);
// the panel and previews stay on the map.
export function TrackImportControl({ user, onSaved, barControls }: TrackImportControlProps) {
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

  function updateParsed(id: number, patch: Partial<ParsedEntry>) {
    setEntries((current) =>
      current.map((entry) => (entry.id === id && entry.status === 'ok' ? { ...entry, ...patch } : entry)),
    )
  }

  async function saveEntry(entry: ParsedEntry) {
    updateParsed(entry.id, { saving: true, saveError: null })
    const result = await createTrack({ ...entry.track, name: entry.name })
    if (!result.ok) {
      updateParsed(entry.id, { saving: false, saveError: result.message })
      return
    }
    removeEntry(entry.id)
    onSaved(result.track)
  }

  // One request per track, in order — keeps each request's body bounded and
  // lets each row succeed or fail on its own.
  async function saveAll() {
    const unsaved = entries.filter((entry): entry is ParsedEntry => entry.status === 'ok' && !entry.saving)
    for (const entry of unsaved) await saveEntry(entry)
  }

  const parsedCount = entries.filter((entry) => entry.status === 'ok').length
  const anySaving = entries.some((entry) => entry.status === 'ok' && entry.saving)

  return (
    <>
      {entries.map((entry) =>
        entry.status === 'ok' ? (
          <Polyline key={entry.id} positions={entry.positions} pathOptions={PREVIEW_PATH_OPTIONS} />
        ) : null,
      )}

      {barControls &&
        createPortal(
          <>
            {/* No `accept` filter on purpose — on phones it greys out .tcx/.gpx/.kml
                files, since those have no well-known MIME type. Bad files are
                rejected per file after picking instead. */}
            <input ref={fileInputRef} type="file" multiple hidden onChange={handleFilesPicked} />
            <button type="button" disabled={reading} onClick={() => fileInputRef.current?.click()}>
              {reading ? t.tracks.reading : t.tracks.importButton}
            </button>
          </>,
          barControls,
        )}

      <div ref={panelRef} className="track-import">
        {entries.length > 0 && (
          <div className="track-import-panel">
            {!user && <p className="track-import-note">{t.tracks.loginToSave}</p>}
            <ul className="track-import-list">
              {entries.map((entry) => (
                <li key={entry.id} className={entry.status === 'error' ? 'track-import-error' : undefined}>
                  <div className="track-import-entry-text">
                    <span className="track-import-name">{entry.status === 'ok' ? entry.name : entry.fileName}</span>
                    {entry.status === 'ok' && (
                      <span>
                        {entry.track.recordedDate && `${formatFinnishDate(entry.track.recordedDate)} · `}
                        {formatKm(entry.distanceM)} · {t.tracks.pointCount(entry.pointCount)}
                      </span>
                    )}
                    {entry.status === 'error' && <span>{entry.message}</span>}
                    {entry.status === 'ok' && entry.saveError && <span className="form-error">{entry.saveError}</span>}
                    {entry.status === 'ok' && user && (
                      <button
                        type="button"
                        className="track-save-button"
                        disabled={entry.saving}
                        onClick={() => saveEntry(entry)}
                      >
                        {entry.saving ? t.tracks.saving : t.common.save}
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={t.tracks.removeFile(entry.fileName)}
                    disabled={entry.status === 'ok' && entry.saving}
                    onClick={() => removeEntry(entry.id)}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
            <div className="track-import-actions">
              {user && parsedCount > 1 && (
                <button type="button" className="track-save-button" disabled={anySaving} onClick={saveAll}>
                  {t.tracks.saveAll}
                </button>
              )}
              <button type="button" className="link-button" disabled={anySaving} onClick={() => setEntries([])}>
                {t.tracks.clearAll}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
