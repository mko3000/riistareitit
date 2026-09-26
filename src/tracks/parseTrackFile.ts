import type { ImportedTrack, TrackSourceFormat } from './types'
import { TrackParseError } from './parsers/common'
import { parseTcx } from './parsers/tcx'

// Formats whose parser has shipped. GPX (RII-25), KML (RII-15) and JSON
// (RII-18) are added here as they land.
const PARSERS: Partial<Record<TrackSourceFormat, (text: string) => ImportedTrack>> = {
  tcx: parseTcx,
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
    throw new TrackParseError(
      `Tiedostomuotoa ei tueta (${fileName}). Tuetut muodot: ${SUPPORTED_FORMATS_LABEL}.`,
    )
  }
  return parser(text)
}
