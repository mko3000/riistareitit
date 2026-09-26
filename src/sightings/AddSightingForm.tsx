import { useEffect, useState } from 'react'
import type { FormEvent, RefObject } from 'react'
import type { Popup as LeafletPopup } from 'leaflet'
import {
  createSighting,
  getMe,
  getSpecies,
  type PublicSighting,
  type Species,
  type SightingFieldErrors,
} from '../api'
import { nowRoundedTo30Min, todayIsoDate } from './dateTime'
import { SightingFieldsFieldset, OTHER, type Kind } from './SightingFieldsFieldset'
import { t } from '../i18n'

interface AddSightingFormProps {
  lat: number
  lng: number
  onCreated: (sighting: PublicSighting) => void
  // See SightingDetailPopup for why this is needed: react-leaflet portals
  // content into the popup rather than going through Leaflet's own
  // setContent(), so nothing tells the popup to resize as fields toggle
  // (e.g. "Other" species revealing a text input) without calling
  // popupRef.current.update() ourselves.
  popupRef: RefObject<LeafletPopup | null>
}

// RII-22: the popup form opened by tapping the map. Rendered inside a
// Leaflet Popup (see SightingsLayer) — its native close button ("×", top
// right) is the ticket's cancel action; nothing custom needed for that.
// Field rendering itself lives in SightingFieldsFieldset, shared with
// RII-23's edit mode.
export function AddSightingForm({ lat, lng, onCreated, popupRef }: AddSightingFormProps) {
  const [speciesList, setSpeciesList] = useState<Species[]>([])
  const [kind, setKind] = useState<Kind>('sighting')
  const [selectedSpecies, setSelectedSpecies] = useState<string | null>(null)
  const [customSpecies, setCustomSpecies] = useState('')
  const [personDisplay, setPersonDisplay] = useState('unknown')
  const [editingPerson, setEditingPerson] = useState(false)
  const [date, setDate] = useState(todayIsoDate)
  const [time, setTime] = useState(nowRoundedTo30Min)
  const [notes, setNotes] = useState('')
  const [fieldErrors, setFieldErrors] = useState<SightingFieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    getSpecies().then(setSpeciesList)
    getMe().then((user) => setPersonDisplay(user?.displayName ?? 'unknown'))
  }, [])

  useEffect(() => {
    popupRef.current?.update()
  })

  const isValid =
    (selectedSpecies !== null && selectedSpecies !== OTHER) ||
    (selectedSpecies === OTHER && customSpecies.trim().length > 0)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!isValid) return

    setSubmitting(true)
    setFormError(null)
    setFieldErrors({})

    const result = await createSighting({
      lat,
      lng,
      kind,
      speciesKey: selectedSpecies !== OTHER ? (selectedSpecies ?? undefined) : undefined,
      customSpecies: selectedSpecies === OTHER ? customSpecies.trim() : undefined,
      notes: notes.trim() || undefined,
      personDisplay,
      observedDate: date,
      observedTime: time,
    })

    setSubmitting(false)

    if (!result.ok) {
      setFormError(result.message)
      setFieldErrors(result.fieldErrors ?? {})
      return
    }

    onCreated(result.sighting)
  }

  return (
    // Extra safety net on top of Leaflet's own disableClickPropagation:
    // stop every click here from bubbling past this form, so nothing
    // upstream (the map, the popup's own resize/reposition handling) ever
    // sees a click as originating outside the popup.
    <form className="sighting-form" onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()}>
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

      <button type="submit" className="add-button" disabled={!isValid || submitting} aria-label={t.sightings.add}>
        {submitting ? '…' : '+'}
      </button>
    </form>
  )
}
