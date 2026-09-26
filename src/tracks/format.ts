// Finnish display formatting shared by the import panel and saved-track popups.

export function formatFinnishDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  return `${day}.${month}.${year}`
}

export function formatKm(meters: number): string {
  return `${(meters / 1000).toFixed(1).replace('.', ',')} km`
}
