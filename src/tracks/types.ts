// RII-2: the common shape every track file format is parsed into — see
// docs/SPEC.md §5. The map and the API only ever see this, never a
// format-specific structure.

export type TrackSourceFormat = 'tcx' | 'gpx' | 'kml' | 'json'

export interface TrackPoint {
  lat: number
  lng: number
  elevationM?: number
  recordedAt?: string // ISO 8601 UTC
}

export interface ImportedTrack {
  name?: string
  sourceFormat: TrackSourceFormat
  // Gaps between segments are recording pauses — drawn as separate lines,
  // never joined across.
  segments: TrackPoint[][]
  recordedDate?: string // "YYYY-MM-DD", browser-local date of the first timestamped point
}
