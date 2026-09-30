import { describe, expect, it } from 'vitest'
import { trackDistanceM, trackPointCount } from './trackStats'
import type { ImportedTrack } from './types'

describe('track stats', () => {
  const track: ImportedTrack = {
    sourceFormat: 'tcx',
    segments: [
      [
        { lat: 60, lng: 25 },
        { lat: 60.01, lng: 25 }, // ~1112 m north
      ],
      // Far away after a pause: the jump between segments must not count.
      [{ lat: 61, lng: 25 }],
    ],
  }

  it('leaves out a long gap (over 500 m) from the distance', () => {
    expect(trackDistanceM(track)).toBeCloseTo(1112, -1)
  })

  it('counts a short gap as walked, since it is drawn joined (RII-38)', () => {
    const withShortGap: ImportedTrack = {
      sourceFormat: 'tcx',
      segments: [
        [
          { lat: 60, lng: 25 },
          { lat: 60.001, lng: 25 }, // ~111 m
        ],
        [{ lat: 60.003, lng: 25 }], // ~222 m gap, joined
      ],
    }
    expect(trackDistanceM(withShortGap)).toBeCloseTo(334, -1)
  })

  it('counts points across segments', () => {
    expect(trackPointCount(track)).toBe(3)
  })
})
