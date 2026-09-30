import type { PartySummary } from '../api'
import { t } from '../i18n'
import type { Visibility } from './visibility'

interface VisibilityPickerProps {
  parties: PartySummary[]
  value: Visibility
  onChange: (value: Visibility) => void
  label?: string
  disabled?: boolean
}

const PRIVATE_OPTION = '__private__'

// RII-46: the "Näkyy" select — "Vain minä" plus my parties. If the current
// value is a party I've since left (editing my own old item), it stays as a
// selectable option so saving other changes doesn't move the item.
export function VisibilityPicker({ parties, value, onChange, label = t.visibility.label, disabled }: VisibilityPickerProps) {
  const isLeftParty = value !== null && !parties.some((party) => party.id === value)

  return (
    <label className="visibility-picker">
      {label}
      <select
        value={value ?? PRIVATE_OPTION}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value === PRIVATE_OPTION ? null : event.target.value)}
      >
        <option value={PRIVATE_OPTION}>{t.visibility.private}</option>
        {parties.map((party) => (
          <option key={party.id} value={party.id}>
            {party.name}
          </option>
        ))}
        {isLeftParty && <option value={value}>{t.visibility.leftParty}</option>}
      </select>
    </label>
  )
}
