import type { ImportedTrack } from '../types'
import { buildTrack, childText, children, descendants, parseXml, toTrackPoint } from './common'

function toPoint(element: Element) {
  return toTrackPoint(
    element.getAttribute('lat') ?? undefined,
    element.getAttribute('lon') ?? undefined,
    childText(element, 'ele'),
    childText(element, 'time'),
  )
}

// RII-25: GPX 1.0/1.1. Tracks (<trk>/<trkseg>/<trkpt>) are preferred; routes
// (<rte>/<rtept>) are only used when there are no tracks, so a file carrying
// both doesn't draw the same walk twice. Waypoints are ignored.
export function parseGpx(text: string): ImportedTrack {
  const doc = parseXml(text, 'GPX', 'gpx')
  const root = doc.documentElement
  const tracks = children(root, 'trk')
  const hasTrackPoints = tracks.some((trk) => descendants(trk, 'trkpt').length > 0)

  if (hasTrackPoints) {
    return buildTrack({
      sourceFormat: 'gpx',
      name: childText(tracks[0], 'name') ?? metadataName(root),
      segments: tracks.flatMap((trk) =>
        children(trk, 'trkseg').map((trkseg) => children(trkseg, 'trkpt').map(toPoint)),
      ),
    })
  }

  const routes = children(root, 'rte')
  return buildTrack({
    sourceFormat: 'gpx',
    name: (routes[0] && childText(routes[0], 'name')) ?? metadataName(root),
    segments: routes.map((rte) => children(rte, 'rtept').map(toPoint)),
  })
}

function metadataName(root: Element): string | undefined {
  const metadata = children(root, 'metadata')[0]
  return metadata ? childText(metadata, 'name') : undefined
}
