import { describe, expect, it } from 'vitest'
import type { LatLngPair } from '../tracks/geo'
import {
  cellKey,
  computeFogCells as computeFromPrepared,
  FOG_CELL_SIZE_MERC,
  fogBinIndex,
  prepareFogTrack,
  thinLines,
  toMercator,
  type FogCell,
  type FogSighting,
  type FogTrack,
} from './fogGrid'

// Synthetic data only: a straight east–west walk at 64°N.
const LAT = 64
const LNG = 25
const M_PER_DEG_LAT = 111_195
const M_PER_DEG_LNG = M_PER_DEG_LAT * Math.cos((LAT * Math.PI) / 180)

// A point `east` m east and `north` m north of (LAT, LNG).
function at(east: number, north = 0): LatLngPair {
  return [LAT + north / M_PER_DEG_LAT, LNG + east / M_PER_DEG_LNG]
}

// Points every 10 m from `from` to `to` metres east.
function line(from: number, to: number): LatLngPair[] {
  const points: LatLngPair[] = []
  for (let east = from; east <= to; east += 10) points.push(at(east))
  return points
}

function cellAt(cells: Map<string, FogCell>, point: LatLngPair): FogCell | undefined {
  const { x, y } = toMercator(point)
  return cells.get(cellKey(Math.floor(x / FOG_CELL_SIZE_MERC), Math.floor(y / FOG_CELL_SIZE_MERC)))
}

function computeFogCells(tracks: FogTrack[], sightings: FogSighting[]) {
  return computeFromPrepared(tracks.map(prepareFogTrack), sightings)
}

const DAY = '2026-09-20'
const walk: FogTrack = { recordedDate: DAY, lines: [line(0, 1000)] }

describe('grid', () => {
  it('has ~50 m cells on the ground at 64°N', () => {
    const a = toMercator(at(0))
    const b = toMercator(at(0, 1000))
    const cellsPerKm = (b.y - a.y) / FOG_CELL_SIZE_MERC
    expect(cellsPerKm).toBeCloseTo(20, 1)
  })

  it('keeps the last point of a run when thinning', () => {
    const [thinned] = thinLines([[at(0), at(5), at(12)]])
    expect(thinned).toHaveLength(2)
    expect(thinned[1]).toEqual(toMercator(at(12)))
  })
})

describe('coverage', () => {
  const cells = computeFogCells([walk], [])

  it('covers cells within the view range of the line', () => {
    expect(cellAt(cells, at(500, 0))?.visits).toBe(1)
    expect(cellAt(cells, at(500, 100))?.visits).toBe(1)
    expect(cellAt(cells, at(500, -100))?.visits).toBe(1)
    expect(cellAt(cells, at(1080, 0))?.visits).toBe(1) // past the end, within range
  })

  it("doesn't cover cells beyond the view range", () => {
    expect(cellAt(cells, at(500, 200))).toBeUndefined()
    expect(cellAt(cells, at(1250, 0))).toBeUndefined()
  })

  it("doesn't cover the gap between two drawn runs", () => {
    const withGap = computeFogCells([{ recordedDate: DAY, lines: [line(0, 500), line(2500, 3000)] }], [])
    expect(cellAt(withGap, at(250))).toBeDefined()
    expect(cellAt(withGap, at(1500))).toBeUndefined()
    expect(cellAt(withGap, at(2750))).toBeDefined()
  })

  it('counts each covering track as a visit', () => {
    const twice = computeFogCells([walk, walk], [])
    expect(cellAt(twice, at(500))?.visits).toBe(2)
  })
})

describe('sightings', () => {
  function sighting(point: LatLngPair, observedDate = DAY) {
    return { lat: point[0], lng: point[1], observedDate }
  }

  it('credits covered cells around the nearest point on the route', () => {
    // 200 m off the line: outside the view range, inside the attribution range.
    const cells = computeFogCells([walk], [sighting(at(500, 200))])
    expect(cellAt(cells, at(500))?.birds).toBe(1)
    expect(cellAt(cells, at(500, -100))?.birds).toBe(1)
    expect(cellAt(cells, at(900))?.birds).toBe(0)
    // Crediting never creates cells outside the track's coverage.
    expect(cellAt(cells, at(500, 200))).toBeUndefined()
  })

  it('ignores sightings from another day', () => {
    const cells = computeFogCells([walk], [sighting(at(500), '2026-09-21')])
    expect(cellAt(cells, at(500))?.birds).toBe(0)
  })

  it('ignores sightings beyond the attribution range', () => {
    const cells = computeFogCells([walk], [sighting(at(500, 300))])
    expect(cellAt(cells, at(500))?.birds).toBe(0)
  })

  it('gives a track without a date no sightings', () => {
    const cells = computeFogCells([{ ...walk, recordedDate: null }], [sighting(at(500))])
    expect(cellAt(cells, at(500))).toEqual(expect.objectContaining({ visits: 1, birds: 0 }))
  })

  it('is birds per visit: seen on one of two walks → 0.5', () => {
    const otherDay: FogTrack = { ...walk, recordedDate: '2026-09-27' }
    const cells = computeFogCells([walk, otherDay], [sighting(at(500))])
    const cell = cellAt(cells, at(500))!
    expect(cell).toEqual(expect.objectContaining({ visits: 2, birds: 1 }))
    expect(fogBinIndex(cell)).toBe(2)
  })
})

describe('fogBinIndex', () => {
  const bin = (birds: number, visits = 1) => fogBinIndex({ ix: 0, iy: 0, visits, birds })

  it('maps rates to the documented bins', () => {
    expect(bin(0)).toBe(0)
    expect(bin(1, 4)).toBe(1) // 0.25
    expect(bin(1, 2)).toBe(2) // 0.5
    expect(bin(1)).toBe(3)
    expect(bin(3, 2)).toBe(3) // 1.5
    expect(bin(2)).toBe(4)
  })
})
