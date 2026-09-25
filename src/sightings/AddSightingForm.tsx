import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  createSighting,
  getMe,
  getSpecies,
  type PublicSighting,
  type Species,
  type SightingFieldErrors,
} from '../api'
import { nowRoundedTo30Min, todayIsoDate } from './dateTime'

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

  useEffect(() => {
    getSpecies().then(setSpeciesList)
    getMe().then((user) => setPersonDisplay(user?.displayName ?? 'unknown'))
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
    <form className="sighting-form" onSubmit={handleSubmit}>
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
          <input
            type="text"
            value={personDisplay}
            onChange={(e) => setPersonDisplay(e.target.value)}
            onBlur={() => setEditingPerson(false)}
            aria-label="Person"
            autoFocus
          />
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
        <input type="time" step={1800} value={time} onChange={(e) => setTime(e.target.value)} />
      </label>

      {formError && <p className="form-error">{formError}</p>}

      <button type="submit" className="add-button" disabled={!isValid || submitting} aria-label="Add">
        {submitting ? '…' : '+'}
      </button>
    </form>
  )
}
