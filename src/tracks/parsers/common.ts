import type { ImportedTrack, TrackPoint, TrackSourceFormat } from '../types'

// Thrown for anything wrong with the *file*. `message` is Finnish and shown
// to the user as-is; any other error escaping a parser is a bug.
export class TrackParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TrackParseError'
  }
}

export function invalidFileMessage(formatLabel: string): string {
  return `Tiedostoa ei voitu lukea – se ei ole kelvollinen ${formatLabel}-tiedosto.`
}

export const NO_LOCATION_MESSAGE = 'Tiedostossa ei ole sijaintitietoja.'

export function parseXml(text: string, formatLabel: string, expectedRootName: string): Document {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length > 0 || doc.documentElement.localName !== expectedRootName) {
    throw new TrackParseError(invalidFileMessage(formatLabel))
  }
  return doc
}

// Matched by local name so a namespace prefix (or lack of one) in the
// source file doesn't matter.
export function descendants(root: Document | Element, localName: string): Element[] {
  return Array.from(root.getElementsByTagNameNS('*', localName))
}

export function children(parent: Element, localName: string): Element[] {
  return Array.from(parent.children).filter((child) => child.localName === localName)
}

export function childText(parent: Element, localName: string): string | undefined {
  const text = children(parent, localName)[0]?.textContent?.trim()
  return text ? text : undefined
}

function parseNumber(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

// Returns null for a point without a usable position — callers skip those
// rather than failing the whole file. Bad elevation/time only drops that field.
export function toTrackPoint(
  lat: string | undefined,
  lng: string | undefined,
  elevation?: string,
  time?: string,
): TrackPoint | null {
  const latNum = parseNumber(lat)
  const lngNum = parseNumber(lng)
  if (latNum === undefined || lngNum === undefined) return null
  if (latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) return null

  const point: TrackPoint = { lat: latNum, lng: lngNum }
  const elevationNum = parseNumber(elevation)
  if (elevationNum !== undefined) point.elevationM = elevationNum
  if (time) {
    const ms = Date.parse(time)
    if (!Number.isNaN(ms)) point.recordedAt = new Date(ms).toISOString()
  }
  return point
}

function localDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function buildTrack(input: {
  sourceFormat: TrackSourceFormat
  name?: string
  segments: Array<Array<TrackPoint | null>>
}): ImportedTrack {
  const segments = input.segments
    .map((segment) => segment.filter((point): point is TrackPoint => point !== null))
    .filter((segment) => segment.length > 0)
  if (segments.length === 0) throw new TrackParseError(NO_LOCATION_MESSAGE)

  const track: ImportedTrack = { sourceFormat: input.sourceFormat, segments }
  const name = input.name?.trim()
  if (name) track.name = name
  const firstTime = segments.flat().find((point) => point.recordedAt)?.recordedAt
  if (firstTime) track.recordedDate = localDate(firstTime)
  return track
}
