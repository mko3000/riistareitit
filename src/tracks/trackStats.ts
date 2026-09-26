import type { ImportedTrack, TrackPoint } from './types'

const EARTH_RADIUS_M = 6371008.8

function haversineM(a: TrackPoint, b: TrackPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h))
}

// Summed within segments only — the jump across a pause isn't walked distance.
export function trackDistanceM(track: ImportedTrack): number {
  let total = 0
  for (const segment of track.segments) {
    for (let i = 1; i < segment.length; i++) total += haversineM(segment[i - 1], segment[i])
  }
  return total
}

export function trackPointCount(track: ImportedTrack): number {
  return track.segments.reduce((sum, segment) => sum + segment.length, 0)
}
