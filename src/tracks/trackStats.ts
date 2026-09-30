import { joinShortGaps } from './gapJoining'
import { distanceM, type LatLngPair } from './geo'
import type { ImportedTrack } from './types'

// Length of the given lines, summed within each line only — never across
// from one line to the next.
export function pathDistanceM(lines: LatLngPair[][]): number {
  let total = 0
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) total += distanceM(line[i - 1], line[i])
  }
  return total
}

export function toLatLngPairs(track: ImportedTrack): LatLngPair[][] {
  return track.segments.map((segment) => segment.map((point): LatLngPair => [point.lat, point.lng]))
}

// RII-38: distance of the track as drawn — short gaps joined (so they count),
// long gaps left out (so they don't). Keeps the number and the line in agreement.
export function trackDistanceM(track: ImportedTrack): number {
  return pathDistanceM(joinShortGaps(toLatLngPairs(track)))
}

export function trackPointCount(track: ImportedTrack): number {
  return track.segments.reduce((sum, segment) => sum + segment.length, 0)
}
