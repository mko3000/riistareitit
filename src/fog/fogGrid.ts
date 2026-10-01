import type { LatLngPair } from '../tracks/geo'

// RII-49: the fog-of-war grid — which cells the visible tracks covered and
// how many birds per visit were seen there. Pure logic, no Leaflet. See
// docs/SPEC.md §6 "Fog of war" for every rule and constant below.

// How far a hunter sees in the forest (first guess, tune freely).
export const VIEW_RANGE_M = 150
// How far from a route a sighting may be and still count for it — wider than
// the view range because markings aren't exact either.
export const ATTRIBUTION_RANGE_M = 250
// Points closer than this to the previous kept point are dropped before
// rasterising — the error it adds is far below the view range.
const THIN_DISTANCE_M = 20

// Web Mercator (EPSG:3857), the map's own projection.
const MERC_RADIUS = 6378137
const DEG = Math.PI / 180
// 50 m on the ground at 64°N, the middle of Finland; ~57 m at 60°N, ~43 m at 68°N.
export const FOG_CELL_SIZE_MERC = 50 / Math.cos(64 * DEG)

export interface MercPoint {
  x: number
  y: number
}

export function toMercator([lat, lng]: LatLngPair): MercPoint {
  return { x: MERC_RADIUS * lng * DEG, y: MERC_RADIUS * Math.log(Math.tan(Math.PI / 4 + (lat * DEG) / 2)) }
}

// Mercator metres per ground metre at a Mercator y (1 / cos(latitude)).
function mercScaleAt(y: number): number {
  return Math.cosh(y / MERC_RADIUS)
}

export function cellKey(ix: number, iy: number): string {
  return `${ix},${iy}`
}

function cellCenter(ix: number, iy: number): MercPoint {
  return { x: (ix + 0.5) * FOG_CELL_SIZE_MERC, y: (iy + 0.5) * FOG_CELL_SIZE_MERC }
}

function distanceSq(a: MercPoint, b: MercPoint): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2
}

// Closest point to p on segment a–b.
function closestOnSegment(p: MercPoint, a: MercPoint, b: MercPoint): MercPoint {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSq = dx * dx + dy * dy
  if (lengthSq === 0) return a
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq))
  return { x: a.x + t * dx, y: a.y + t * dy }
}

// Calls visit(ix, iy) for every cell whose centre is within radiusMerc of
// segment a–b (a === b for a single point).
function forEachCellNear(a: MercPoint, b: MercPoint, radiusMerc: number, visit: (ix: number, iy: number) => void) {
  const size = FOG_CELL_SIZE_MERC
  const minIx = Math.floor((Math.min(a.x, b.x) - radiusMerc) / size)
  const maxIx = Math.floor((Math.max(a.x, b.x) + radiusMerc) / size)
  const minIy = Math.floor((Math.min(a.y, b.y) - radiusMerc) / size)
  const maxIy = Math.floor((Math.max(a.y, b.y) + radiusMerc) / size)
  const radiusSq = radiusMerc * radiusMerc
  for (let ix = minIx; ix <= maxIx; ix++) {
    for (let iy = minIy; iy <= maxIy; iy++) {
      const center = cellCenter(ix, iy)
      if (distanceSq(center, closestOnSegment(center, a, b)) <= radiusSq) visit(ix, iy)
    }
  }
}

// A track's drawn lines in Mercator, thinned. Runs are kept apart: the gap
// between two runs was not walked.
export function thinLines(lines: LatLngPair[][]): MercPoint[][] {
  return lines
    .filter((line) => line.length > 0)
    .map((line) => {
      const points = line.map(toMercator)
      const kept = [points[0]]
      for (let i = 1; i < points.length; i++) {
        const last = kept[kept.length - 1]
        const minMerc = THIN_DISTANCE_M * mercScaleAt(last.y)
        // Always keep a run's last point so its end isn't cut short.
        if (distanceSq(points[i], last) >= minMerc * minMerc || i === points.length - 1) kept.push(points[i])
      }
      return kept
    })
}

// Keys of the cells a track's lines cover (centre within the view range).
export function coveredCells(lines: MercPoint[][]): Set<string> {
  const cells = new Set<string>()
  const add = (ix: number, iy: number) => cells.add(cellKey(ix, iy))
  for (const line of lines) {
    if (line.length === 1) {
      forEachCellNear(line[0], line[0], VIEW_RANGE_M * mercScaleAt(line[0].y), add)
      continue
    }
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i]
      const b = line[i + 1]
      forEachCellNear(a, b, VIEW_RANGE_M * mercScaleAt((a.y + b.y) / 2), add)
    }
  }
  return cells
}

// The nearest point on the lines to p and its ground distance in metres, or
// null when there are no lines.
export function nearestOnLines(p: MercPoint, lines: MercPoint[][]): { point: MercPoint; distanceM: number } | null {
  let best: MercPoint | null = null
  let bestSq = Infinity
  for (const line of lines) {
    for (let i = 0; i < line.length; i++) {
      const candidate = closestOnSegment(p, line[i], line[i + 1] ?? line[i])
      const dSq = distanceSq(p, candidate)
      if (dSq < bestSq) {
        best = candidate
        bestSq = dSq
      }
    }
  }
  if (!best) return null
  return { point: best, distanceM: Math.sqrt(bestSq) / mercScaleAt((p.y + best.y) / 2) }
}

export interface FogTrack {
  recordedDate: string | null // "YYYY-MM-DD"
  lines: LatLngPair[][] // as drawn (after gap joining)
}

export interface FogSighting {
  lat: number
  lng: number
  observedDate: string // "YYYY-MM-DD"
}

// How many birds one marking stands for. 1 until RII-51 adds a count; then
// this takes the sighting and returns its count.
export function sightingWeight(): number {
  return 1
}

// A track's thinned lines and covered cells — the expensive part, so it's
// computed once per track list and reused when only sightings change.
export interface PreparedFogTrack {
  recordedDate: string | null
  lines: MercPoint[][]
  covered: Set<string>
}

export function prepareFogTrack(track: FogTrack): PreparedFogTrack {
  const lines = thinLines(track.lines)
  return { recordedDate: track.recordedDate, lines, covered: coveredCells(lines) }
}

export interface FogCell {
  ix: number
  iy: number
  visits: number
  birds: number
}

// Every covered cell with its visits (tracks covering it) and birds (credited
// sightings). Rate = birds / visits.
export function computeFogCells(tracks: PreparedFogTrack[], sightings: FogSighting[]): Map<string, FogCell> {
  const cells = new Map<string, FogCell>()
  const sightingsByDate = new Map<string, FogSighting[]>()
  for (const sighting of sightings) {
    const list = sightingsByDate.get(sighting.observedDate) ?? []
    list.push(sighting)
    sightingsByDate.set(sighting.observedDate, list)
  }

  for (const { recordedDate, lines, covered } of tracks) {
    for (const key of covered) {
      let cell = cells.get(key)
      if (!cell) {
        const [ix, iy] = key.split(',').map(Number)
        cell = { ix, iy, visits: 0, birds: 0 }
        cells.set(key, cell)
      }
      cell.visits += 1
    }

    // Same day only; a track without a date gets no sightings.
    const sameDay = recordedDate ? (sightingsByDate.get(recordedDate) ?? []) : []
    for (const sighting of sameDay) {
      const nearest = nearestOnLines(toMercator([sighting.lat, sighting.lng]), lines)
      if (!nearest || nearest.distanceM > ATTRIBUTION_RANGE_M) continue
      const radius = VIEW_RANGE_M * mercScaleAt(nearest.point.y)
      const weight = sightingWeight()
      forEachCellNear(nearest.point, nearest.point, radius, (ix, iy) => {
        const key = cellKey(ix, iy)
        if (covered.has(key)) cells.get(key)!.birds += weight
      })
    }
  }
  return cells
}

// Colour bins, docs/SPEC.md §6 "Fog of war". Index 0 = explored, nothing seen.
export const FOG_BINS = [
  { minRate: 0, color: '#8a8580', opacity: 0.25 },
  { minRate: Number.MIN_VALUE, color: '#b9a7f5', opacity: 0.45 },
  { minRate: 0.5, color: '#8f6ee8', opacity: 0.45 },
  { minRate: 1, color: '#6a3fd4', opacity: 0.45 },
  { minRate: 2, color: '#4a1fa8', opacity: 0.45 },
] as const

export function fogBinIndex(cell: FogCell): number {
  const rate = cell.visits > 0 ? cell.birds / cell.visits : 0
  for (let i = FOG_BINS.length - 1; i > 0; i--) {
    if (rate >= FOG_BINS[i].minRate) return i
  }
  return 0
}
