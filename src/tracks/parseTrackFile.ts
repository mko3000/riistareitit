import type { ImportedTrack, TrackSourceFormat } from './types'
import { TrackParseError } from './parsers/common'
import { parseGpx } from './parsers/gpx'
import { parseKml } from './parsers/kml'
import { parseTcx } from './parsers/tcx'
import { t } from '../i18n'

// Formats whose parser has shipped. JSON (RII-18) is added here when it
// lands.
const PARSERS: Partial<Record<TrackSourceFormat, (text: string) => ImportedTrack>> = {
  tcx: parseTcx,
  gpx: parseGpx,
  kml: parseKml,
}

export const SUPPORTED_FORMATS_LABEL = Object.keys(PARSERS)
  .map((format) => format.toUpperCase())
  .join(', ')

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot === -1 ? '' : fileName.slice(dot + 1).toLowerCase()
}

// Picks the parser by file extension. Throws TrackParseError (Finnish
// message) for unsupported or unreadable files.
export function parseTrackFile(fileName: string, text: string): ImportedTrack {
  const parser = PARSERS[extensionOf(fileName) as TrackSourceFormat]
  if (!parser) {
    throw new TrackParseError(t.tracks.errors.unsupportedFormat(fileName, SUPPORTED_FORMATS_LABEL))
  }
  return parser(text)
}
