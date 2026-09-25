import type { Species, SightingFieldErrors } from '../api'
import { HALF_HOUR_OPTIONS } from './dateTime'

export type Kind = 'sighting' | 'kill'

// Sentinel for "custom species text entry selected", distinct from any real
// species.key (which are all lowercase-with-hyphens English identifiers —
// see CLAUDE.md's "code in English, UI in Finnish").
export const OTHER = '__other__' as const

// RII-22/RII-23: the type/species/person/date/time (+ optional notes)
// fields shared between the add popup (RII-22) and the edit mode of the
// view/edit/delete popup (RII-23). Purely presentational — all state lives
// in the caller, passed down as value+onChange pairs, so add vs. edit can
// each own their own submit/cancel/delete behavior around it.
interface SightingFieldsFieldsetProps {
  speciesList: Species[]
  kind: Kind
  onKindChange: (kind: Kind) => void
  selectedSpecies: string | null // a species key, or OTHER
  onSelectedSpeciesChange: (value: string | null) => void
  customSpecies: string
  onCustomSpeciesChange: (value: string) => void
  personDisplay: string
  onPersonDisplayChange: (value: string) => void
  editingPerson: boolean
  onEditingPersonChange: (value: boolean) => void
  date: string
  onDateChange: (value: string) => void
  time: string
  onTimeChange: (value: string) => void
  // Undefined (not just empty string) means "don't render a notes field at
  // all". Both the add popup and edit mode pass it now (optional, can be
  // left blank in either); kept optional here in case a future caller of
  // this fieldset genuinely doesn't want it.
  notes?: string
  onNotesChange?: (value: string) => void
  fieldErrors: SightingFieldErrors
}

export function SightingFieldsFieldset({
  speciesList,
  kind,
  onKindChange,
  selectedSpecies,
  onSelectedSpeciesChange,
  customSpecies,
  onCustomSpeciesChange,
  personDisplay,
  onPersonDisplayChange,
  editingPerson,
  onEditingPersonChange,
  date,
  onDateChange,
  time,
  onTimeChange,
  notes,
  onNotesChange,
  fieldErrors,
}: SightingFieldsFieldsetProps) {
  return (
    <>
      <div className="button-row" role="group" aria-label="Type">
        <button
          type="button"
          className={kind === 'sighting' ? 'selected' : ''}
          onClick={() => onKindChange('sighting')}
        >
          Sighting
        </button>
        <button type="button" className={kind === 'kill' ? 'selected' : ''} onClick={() => onKindChange('kill')}>
          Kill
        </button>
      </div>

      <div className="button-row" role="group" aria-label="Species">
        {speciesList.map((species) => (
          <button
            key={species.key}
            type="button"
            className={selectedSpecies === species.key ? 'selected' : ''}
            onClick={() => onSelectedSpeciesChange(species.key)}
          >
            {species.nameFi}
          </button>
        ))}
        <button
          type="button"
          className={selectedSpecies === OTHER ? 'selected' : ''}
          onClick={() => onSelectedSpeciesChange(OTHER)}
        >
          Other
        </button>
      </div>
      {selectedSpecies === OTHER && (
        <input
          type="text"
          value={customSpecies}
          onChange={(e) => onCustomSpeciesChange(e.target.value)}
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
              onChange={(e) => onPersonDisplayChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  onEditingPersonChange(false)
                }
              }}
              aria-label="Person"
              autoFocus
            />
            <button
              type="button"
              className="icon-button"
              onClick={() => onEditingPersonChange(false)}
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
              onClick={() => onEditingPersonChange(true)}
              aria-label="Edit person"
            >
              ✏️
            </button>
          </>
        )}
      </div>

      <label>
        Date
        <input type="date" value={date} onChange={(e) => onDateChange(e.target.value)} />
      </label>

      <label>
        Time
        <select value={time} onChange={(e) => onTimeChange(e.target.value)}>
          {HALF_HOUR_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>

      {notes !== undefined && onNotesChange && (
        <label>
          Notes
          <textarea rows={2} value={notes} onChange={(e) => onNotesChange(e.target.value)} />
        </label>
      )}
    </>
  )
}
