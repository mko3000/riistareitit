import { useEffect, useState } from 'react'
import type { FormEvent, RefObject } from 'react'
import type { Popup as LeafletPopup } from 'leaflet'
import {
  deleteSighting,
  getSpecies,
  updateSighting,
  type PublicSighting,
  type Species,
  type SightingFieldErrors,
} from '../api'
import { nowRoundedTo30Min } from './dateTime'
import { SightingFieldsFieldset, OTHER, type Kind } from './SightingFieldsFieldset'

// 5 decimals is ~1.1m of precision at these latitudes — plenty for "did the
// pin end up roughly where I tapped", without a long string of noise digits.
function formatCoords(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`
}

interface SightingDetailPopupProps {
  sighting: PublicSighting
  // RII-34: SightingMarker's single source of truth for "where is this
  // marking right now" — the saved position, or a staged-but-unsaved one
  // while a move is in progress. Read directly in handleSave rather than
  // kept as a separately-synced local copy here; two copies of the same
  // value updated via two different paths is exactly how this drifted out
  // of sync the first time (marker visually moved, but Save still sent the
  // original position).
  currentPosition: { lat: number; lng: number }
  onUpdated: (sighting: PublicSighting) => void
  onDeleted: (id: string) => void
  // react-leaflet 5 has no usePopup() hook — SightingMarker holds the ref
  // to its own Popup instance and passes it down, since a ref can only be
  // created in a real component, not inside the .map() that renders markers.
  popupRef: RefObject<LeafletPopup | null>
  // RII-34: tells SightingMarker to close this popup and enter "waiting for
  // a map tap" mode for this sighting.
  onMove: () => void
  // RII-34: lets SightingMarker snap the marker back to its saved position
  // if an in-progress move is cancelled rather than saved.
  onCancelEdit: () => void
}

// RII-23: rendered as the Popup content nested inside each marker (see
// SightingMarker) — Leaflet opens/closes it natively on marker click, no
// open/closed state to manage here beyond view-vs-edit mode.
export function SightingDetailPopup({
  sighting,
  currentPosition,
  onUpdated,
  onDeleted,
  popupRef,
  onMove,
  onCancelEdit,
}: SightingDetailPopupProps) {
  // react-leaflet renders this component's output into Leaflet's popup via
  // a portal — it doesn't go through Leaflet's own setContent(), which is
  // what normally tells a popup its content size changed. Without this,
  // switching view -> edit mode (a large size jump) left the popup's white
  // background at its old (smaller) size while the actual content, no
  // longer confined to it, rendered past its edges. Re-running .update()
  // after every render keeps the two in sync regardless of which field
  // toggle caused the resize.
  useEffect(() => {
    popupRef.current?.update()
  })

  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [speciesList, setSpeciesList] = useState<Species[]>([])

  const [kind, setKind] = useState<Kind>(sighting.kind)
  const [selectedSpecies, setSelectedSpecies] = useState<string | null>(
    sighting.species?.key ?? (sighting.customSpecies ? OTHER : null),
  )
  const [customSpecies, setCustomSpecies] = useState(sighting.customSpecies ?? '')
  const [personDisplay, setPersonDisplay] = useState(sighting.personDisplay)
  const [editingPerson, setEditingPerson] = useState(false)
  const [date, setDate] = useState(sighting.observedDate)
  const [time, setTime] = useState(sighting.observedTime ?? nowRoundedTo30Min())
  const [notes, setNotes] = useState(sighting.notes ?? '')
  const [fieldErrors, setFieldErrors] = useState<SightingFieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Re-reads from the current `sighting` prop each time edit mode is
  // entered, rather than only at mount — this component's identity persists
  // across a save (same marker, same Popup instance), so a stale
  // useState() initializer would keep showing pre-edit values on a second
  // edit otherwise.
  function startEditing() {
    getSpecies().then(setSpeciesList)
    setKind(sighting.kind)
    setSelectedSpecies(sighting.species?.key ?? (sighting.customSpecies ? OTHER : null))
    setCustomSpecies(sighting.customSpecies ?? '')
    setPersonDisplay(sighting.personDisplay)
    setEditingPerson(false)
    setDate(sighting.observedDate)
    setTime(sighting.observedTime ?? nowRoundedTo30Min())
    setNotes(sighting.notes ?? '')
    setFieldErrors({})
    setFormError(null)
    setMode('edit')
  }

  const isValid =
    (selectedSpecies !== null && selectedSpecies !== OTHER) ||
    (selectedSpecies === OTHER && customSpecies.trim().length > 0)

  async function handleSave(event: FormEvent) {
    event.preventDefault()
    if (!isValid) return

    setSubmitting(true)
    setFormError(null)
    setFieldErrors({})

    const result = await updateSighting(sighting.id, {
      lat: currentPosition.lat,
      lng: currentPosition.lng,
      kind,
      speciesKey: selectedSpecies !== OTHER ? (selectedSpecies ?? undefined) : undefined,
      customSpecies: selectedSpecies === OTHER ? customSpecies.trim() : undefined,
      personDisplay,
      observedDate: date,
      observedTime: time,
      notes: notes.trim() || undefined,
    })

    setSubmitting(false)

    if (!result.ok) {
      setFormError(result.message)
      setFieldErrors(result.fieldErrors ?? {})
      return
    }

    onUpdated(result.sighting)
    setMode('view')
  }

  async function handleDelete() {
    // Ticket's own words: "a plain 'are you sure?' is enough" — the
    // native confirm() dialog says exactly that, no custom UI needed.
    if (!window.confirm('Delete this marking? This cannot be undone.')) return

    setDeleting(true)
    const result = await deleteSighting(sighting.id)
    setDeleting(false)

    if (!result.ok) {
      setFormError(result.message)
      return
    }

    onDeleted(sighting.id)
  }

  if (mode === 'view') {
    const speciesLabel = sighting.species?.nameFi ?? sighting.customSpecies ?? '?'
    return (
      // Same stopPropagation as the edit-mode form below — this was missing
      // here, which is exactly why clicking "edit" leaked through to the
      // map's own click handler and opened a new add-popup at the marker's
      // location instead of just switching this popup to edit mode.
      <div className="sighting-detail" onClick={(e) => e.stopPropagation()}>
        <p>
          <strong>{sighting.kind === 'kill' ? 'Kill' : 'Sighting'}</strong> — {speciesLabel}
        </p>
        <p>{formatCoords(sighting.lat, sighting.lng)}</p>
        <p>{sighting.personDisplay}</p>
        <p>
          {sighting.observedDate}
          {sighting.observedTime ? ` ${sighting.observedTime}` : ''}
        </p>
        {sighting.notes && <p className="notes">{sighting.notes}</p>}
        <button type="button" className="icon-button" onClick={startEditing} aria-label="Edit">
          ✏️
        </button>
      </div>
    )
  }

  return (
    <form className="sighting-form" onSubmit={handleSave} onClick={(e) => e.stopPropagation()}>
      {/* Same text+pencil pattern as the person field (SightingFieldsFieldset)
          — the pencil doesn't inline-edit here, it triggers the same map-tap
          move flow the old standalone "Move" button did. */}
      <div className="person-row">
        <span>{formatCoords(currentPosition.lat, currentPosition.lng)}</span>
        <button type="button" className="icon-button" onClick={onMove} aria-label="Move">
          ✏️
        </button>
      </div>

      <SightingFieldsFieldset
        speciesList={speciesList}
        kind={kind}
        onKindChange={setKind}
        selectedSpecies={selectedSpecies}
        onSelectedSpeciesChange={setSelectedSpecies}
        customSpecies={customSpecies}
        onCustomSpeciesChange={setCustomSpecies}
        personDisplay={personDisplay}
        onPersonDisplayChange={setPersonDisplay}
        editingPerson={editingPerson}
        onEditingPersonChange={setEditingPerson}
        date={date}
        onDateChange={setDate}
        time={time}
        onTimeChange={setTime}
        notes={notes}
        onNotesChange={setNotes}
        fieldErrors={fieldErrors}
      />

      {formError && <p className="form-error">{formError}</p>}

      <div className="edit-actions">
        <div className="edit-actions-group">
          <button
            type="button"
            className="icon-button"
            onClick={handleDelete}
            disabled={deleting}
            aria-label="Delete"
          >
            🗑️
          </button>
        </div>
        <div className="edit-actions-group">
          <button
            type="button"
            onClick={() => {
              onCancelEdit()
              setMode('view')
            }}
          >
            Cancel
          </button>
          <button type="submit" className="add-button" disabled={!isValid || submitting} aria-label="Save">
            ✓
          </button>
        </div>
      </div>
    </form>
  )
}
