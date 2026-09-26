import type { ImportedTrack } from '../types'
import { buildTrack, childText, children, descendants, parseXml, toTrackPoint } from './common'

// RII-16: Garmin Training Center XML — what Google Fit's Takeout export
// contains. Each <Track> (one per <Lap> in Google Fit exports, separated by
// recording pauses) becomes its own segment.
export function parseTcx(text: string): ImportedTrack {
  const doc = parseXml(text, 'TCX', 'TrainingCenterDatabase')

  const segments = descendants(doc, 'Track').map((track) =>
    children(track, 'Trackpoint').map((trackpoint) => {
      // Google Fit writes a position-less point at the start of each lap.
      const position = children(trackpoint, 'Position')[0]
      if (!position) return null
      return toTrackPoint(
        childText(position, 'LatitudeDegrees'),
        childText(position, 'LongitudeDegrees'),
        childText(trackpoint, 'AltitudeMeters'),
        childText(trackpoint, 'Time'),
      )
    }),
  )

  return buildTrack({ sourceFormat: 'tcx', segments })
}
