import { distanceM, type LatLngPair } from './geo'

// RII-38: gaps between a track's segments (recording pauses) up to this
// long are drawn as one continuous line; longer ones aren't drawn at all.
// Rendering only — stored segments never change, so this can be tuned any
// time. Why 500 m: docs/SPEC.md §6 "Gap joining".
export const MAX_JOINED_GAP_M = 500

// Merges consecutive segments whose gap (last point of one to first point
// of the next) is at most maxGapM. Returns the runs to draw, one polyline
// each. Doesn't modify its input.
export function joinShortGaps(segments: LatLngPair[][], maxGapM = MAX_JOINED_GAP_M): LatLngPair[][] {
  const runs: LatLngPair[][] = []
  for (const segment of segments) {
    if (segment.length === 0) continue
    const current = runs.at(-1)
    if (current && distanceM(current[current.length - 1], segment[0]) <= maxGapM) {
      // A loop, not push(...segment): long segments would overflow the call stack.
      for (const point of segment) current.push(point)
    } else {
      runs.push([...segment])
    }
  }
  return runs
}
