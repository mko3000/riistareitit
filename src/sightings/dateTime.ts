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

// "Now", rounded down to the nearest 30 minutes — matches the 30-minute
// increments the time input itself steps by.
export function nowRoundedTo30Min(): string {
  const now = new Date()
  const minutes = now.getMinutes() < 30 ? '00' : '30'
  const hours = String(now.getHours()).padStart(2, '0')
  return `${hours}:${minutes}`
}
