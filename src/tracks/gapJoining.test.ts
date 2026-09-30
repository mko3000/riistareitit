import { describe, expect, it } from 'vitest'
import { joinShortGaps, MAX_JOINED_GAP_M } from './gapJoining'
import type { LatLngPair } from './geo'

// Synthetic points near 60°N. 0.001° of latitude ≈ 111 m.
const A: LatLngPair[] = [
  [60.0, 25.0],
  [60.001, 25.0],
]
const aboutMetresNorthOf = (from: LatLngPair, metres: number): LatLngPair => [from[0] + metres / 111_195, from[1]]

describe('joinShortGaps', () => {
  it('joins a gap under the threshold into one run', () => {
    const start = aboutMetresNorthOf(A[1], 300)
    const B: LatLngPair[] = [start, aboutMetresNorthOf(start, 100)]
    expect(joinShortGaps([A, B])).toEqual([[...A, ...B]])
  })

  it('keeps a gap over the threshold as separate runs', () => {
    const start = aboutMetresNorthOf(A[1], 800)
    const B: LatLngPair[] = [start, aboutMetresNorthOf(start, 100)]
    expect(joinShortGaps([A, B])).toEqual([A, B])
  })

  it('joins right at the threshold, not just past it', () => {
    const atLimit: LatLngPair[] = [aboutMetresNorthOf(A[1], MAX_JOINED_GAP_M - 1)]
    const pastLimit: LatLngPair[] = [aboutMetresNorthOf(A[1], MAX_JOINED_GAP_M + 1)]
    expect(joinShortGaps([A, atLimit])).toHaveLength(1)
    expect(joinShortGaps([A, pastLimit])).toHaveLength(2)
  })

  it('chains several short gaps and breaks only at the long one', () => {
    const b0 = aboutMetresNorthOf(A[1], 100)
    const B: LatLngPair[] = [b0, aboutMetresNorthOf(b0, 50)]
    const c0 = aboutMetresNorthOf(B[1], 5_000)
    const C: LatLngPair[] = [c0]
    const d0 = aboutMetresNorthOf(c0, 20)
    const D: LatLngPair[] = [d0]
    expect(joinShortGaps([A, B, C, D])).toEqual([
      [...A, ...B],
      [...C, ...D],
    ])
  })

  it('honours a custom threshold', () => {
    const B: LatLngPair[] = [aboutMetresNorthOf(A[1], 300)]
    expect(joinShortGaps([A, B], 100)).toHaveLength(2)
  })

  it('skips empty segments and leaves its input untouched', () => {
    const input = [A, [], [aboutMetresNorthOf(A[1], 10)]]
    const snapshot = JSON.stringify(input)
    expect(joinShortGaps(input)).toHaveLength(1)
    expect(JSON.stringify(input)).toBe(snapshot)
  })

  it('handles segments too long to spread into push()', () => {
    const long: LatLngPair[] = Array.from({ length: 200_000 }, (_, i) => [60 + i * 1e-7, 25])
    const next: LatLngPair[] = [aboutMetresNorthOf(long[long.length - 1], 1)]
    expect(joinShortGaps([long, next])[0]).toHaveLength(200_001)
  })
})
