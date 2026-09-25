// Small local helpers for the add-sighting form's date/time defaults.
// Deliberately local (not shared with server/) — the two sides format
// dates/times independently; see server/src/routes/sightings.ts for its
// own UTC-getter formatting and why.

export function todayIsoDate(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

// "Now", rounded down to the nearest 30 minutes — matches HALF_HOUR_OPTIONS.
export function nowRoundedTo30Min(): string {
  const now = new Date()
  const minutes = now.getMinutes() < 30 ? '00' : '30'
  const hours = String(now.getHours()).padStart(2, '0')
  return `${hours}:${minutes}`
}

// The 48 valid "HH:MM" slots in a day, 30 minutes apart. Used as a <select>
// rather than `<input type="time" step={1800}>`: browsers' native time
// picker doesn't actually restrict which values are selectable to the
// step — it just shows every minute — so step alone can't guarantee the
// "adjustable in 30-minute increments" requirement. A plain dropdown does.
export const HALF_HOUR_OPTIONS: string[] = Array.from({ length: 48 }, (_, i) => {
  const hours = String(Math.floor(i / 2)).padStart(2, '0')
  const minutes = i % 2 === 0 ? '00' : '30'
  return `${hours}:${minutes}`
})
