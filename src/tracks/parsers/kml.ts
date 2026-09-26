import type { ImportedTrack, TrackPoint } from '../types'
import { buildTrack, childText, children, descendants, parseXml, toTrackPoint } from './common'

// "lng,lat[,ele]" tuples separated by whitespace.
function parseLineString(lineString: Element): Array<TrackPoint | null> {
  const coordinates = childText(lineString, 'coordinates') ?? ''
  return coordinates
    .split(/\s+/)
    .filter(Boolean)
    .map((tuple) => {
      const [lng, lat, elevation] = tuple.split(',')
      return toTrackPoint(lat, lng, elevation)
    })
}

// gx:Track: <when> and <gx:coord> ("lng lat [ele]") are parallel lists.
function parseGxTrack(track: Element): Array<TrackPoint | null> {
  const times = children(track, 'when').map((when) => when.textContent?.trim())
  return children(track, 'coord').map((coord, i) => {
    const [lng, lat, elevation] = (coord.textContent ?? '').trim().split(/\s+/)
    return toTrackPoint(lat, lng, elevation, times[i])
  })
}

// RII-15: KML (Sports Tracker, Google Earth / My Maps). Every <LineString>
// and every <gx:Track> is a segment, wherever it's nested; points and
// polygons are ignored.
export function parseKml(text: string): ImportedTrack {
  const doc = parseXml(text, 'KML', 'kml')

  const segments = [
    ...descendants(doc, 'LineString').map(parseLineString),
    // Local name "Track" is gx:Track; plain KML has no other element by that name.
    ...descendants(doc, 'Track').map(parseGxTrack),
  ]

  // Deliberately not <Document><name>: that's usually the exporting app's
  // generic label, so the UI's file-name fallback is more useful.
  const namedPlacemark = descendants(doc, 'Placemark').find(
    (placemark) =>
      (descendants(placemark, 'LineString').length > 0 || descendants(placemark, 'Track').length > 0) &&
      childText(placemark, 'name'),
  )

  return buildTrack({
    sourceFormat: 'kml',
    name: namedPlacemark && childText(namedPlacemark, 'name'),
    segments,
  })
}
