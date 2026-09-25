import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  createSighting,
  getMe,
  getSpecies,
  type PublicSighting,
  type Species,
  type SightingFieldErrors,
} from '../api'
import { HALF_HOUR_OPTIONS, nowRoundedTo30Min, todayIsoDate } from './dateTime'

interface AddSightingFormProps {
  lat: number
  lng: number
  onCreated: (sighting: PublicSighting) => void
}

type Kind = 'sighting' | 'kill'

const OTHER = '__other__' as const

// RII-22: the popup form opened by tapping the map. Rendered inside a
// Leaflet Popup (see SightingsLayer) — its native close button ("×", top
// right) is the ticket's cancel action; nothing custom needed for that.
export function AddSightingForm({ lat, lng, onCreated }: AddSightingFormProps) {
  const [speciesList, setSpeciesList] = useState<Species[]>([])
  const [kind, setKind] = useState<Kind>('sighting')
  const [selectedSpecies, setSelectedSpecies] = useState<string | null>(null) // species key, or OTHER
  const [customSpecies, setCustomSpecies] = useState('')
  const [personDisplay, setPersonDisplay] = useState('unknown')
  const [editingPerson, setEditingPerson] = useState(false)
  const [date, setDate] = useState(todayIsoDate)
  const [time, setTime] = useState(nowRoundedTo30Min)
  const [fieldErrors, setFieldErrors] = useState<SightingFieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // getMe() is a real network + DB round-trip and can resolve well after the
  // form has mounted. Without this guard, editing the person field before
  // it resolves gets silently overwritten the moment it does — a race that
  // fires essentially every time for a fast edit, not an occasional glitch.
  const personTouchedRef = useRef(false)

  useEffect(() => {
    getSpecies().then(setSpeciesList)
    getMe().then((user) => {
      if (!personTouchedRef.current) {
        setPersonDisplay(user?.displayName ?? 'unknown')
      }
    })
  }, [])

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
      <div className="button-row" role="group" aria-label="Type">
        <button
          type="button"
          className={kind === 'sighting' ? 'selected' : ''}
          onClick={() => setKind('sighting')}
        >
          Sighting
        </button>
        <button type="button" className={kind === 'kill' ? 'selected' : ''} onClick={() => setKind('kill')}>
          Kill
        </button>
      </div>

      <div className="button-row" role="group" aria-label="Species">
        {speciesList.map((species) => (
          <button
            key={species.key}
            type="button"
            className={selectedSpecies === species.key ? 'selected' : ''}
            onClick={() => setSelectedSpecies(species.key)}
          >
            {species.nameFi}
          </button>
        ))}
        <button
          type="button"
          className={selectedSpecies === OTHER ? 'selected' : ''}
          onClick={() => setSelectedSpecies(OTHER)}
        >
          Other
        </button>
      </div>
      {selectedSpecies === OTHER && (
        <input
          type="text"
          value={customSpecies}
          onChange={(e) => setCustomSpecies(e.target.value)}
          placeholder="Species"
          aria-label="Custom species"
        />
      )}
      {fieldErrors.species && <p className="field-error">{fieldErrors.species}</p>}

      <div className="person-row">
        {editingPerson ? (
          <>
            <input
              type="text"
              value={personDisplay}
              onChange={(e) => {
                personTouchedRef.current = true
                setPersonDisplay(e.target.value)
              }}
              onKeyDown={(e) => {
                // Enter confirms and exits edit mode, rather than letting it
                // fall through to native implicit form submission.
                if (e.key === 'Enter') {
                  e.preventDefault()
                  setEditingPerson(false)
                }
              }}
              aria-label="Person"
              autoFocus
            />
            {/* Explicit confirm button, not onBlur — onBlur firing at an
                unexpected moment (e.g. if the popup repositions itself as
                its content resizes) was the suspected cause of the whole
                popup appearing to close when editing the name. */}
            <button
              type="button"
              className="icon-button"
              onClick={() => setEditingPerson(false)}
              aria-label="Done editing person"
            >
              ✓
            </button>
          </>
        ) : (
          <>
            <span>{personDisplay}</span>
            <button
              type="button"
              className="icon-button"
              onClick={() => setEditingPerson(true)}
              aria-label="Edit person"
            >
              ✏️
            </button>
          </>
        )}
      </div>

      <label>
        Date
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>

      <label>
        Time
        <select value={time} onChange={(e) => setTime(e.target.value)}>
          {HALF_HOUR_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>

      {formError && <p className="form-error">{formError}</p>}

      <button type="submit" className="add-button" disabled={!isValid || submitting} aria-label="Add">
        {submitting ? '…' : '+'}
      </button>
    </form>
  )
}
