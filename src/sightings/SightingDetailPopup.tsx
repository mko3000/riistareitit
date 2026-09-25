import { useState } from 'react'
import type { FormEvent } from 'react'
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

interface SightingDetailPopupProps {
  sighting: PublicSighting
  onUpdated: (sighting: PublicSighting) => void
  onDeleted: (id: string) => void
}

// RII-23: rendered as the Popup content nested inside each marker (see
// SightingsLayer) — Leaflet opens/closes it natively on marker click, no
// open/closed state to manage here beyond view-vs-edit mode.
export function SightingDetailPopup({ sighting, onUpdated, onDeleted }: SightingDetailPopupProps) {
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
      <div className="sighting-detail">
        <p>
          <strong>{sighting.kind === 'kill' ? 'Kill' : 'Sighting'}</strong> — {speciesLabel}
        </p>
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
        <button type="button" className="icon-button" onClick={handleDelete} disabled={deleting} aria-label="Delete">
          🗑️
        </button>
        <button type="button" onClick={() => setMode('view')}>
          Cancel
        </button>
        <button type="submit" className="add-button" disabled={!isValid || submitting} aria-label="Save">
          ✓
        </button>
      </div>
    </form>
  )
}
