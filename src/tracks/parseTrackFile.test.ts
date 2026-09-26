import { describe, expect, it } from 'vitest'
import { parseTrackFile } from './parseTrackFile'
import { TrackParseError } from './parsers/common'

const MINIMAL_TCX = `<TrainingCenterDatabase><Activities><Activity><Lap><Track><Trackpoint>
  <Position><LatitudeDegrees>60.1</LatitudeDegrees><LongitudeDegrees>24.9</LongitudeDegrees></Position>
</Trackpoint></Track></Lap></Activity></Activities></TrainingCenterDatabase>`

describe('parseTrackFile', () => {
  it('picks the parser by extension, case-insensitively', () => {
    expect(parseTrackFile('walk.TCX', MINIMAL_TCX).sourceFormat).toBe('tcx')
  })

  it('rejects unsupported extensions with a Finnish message naming the file', () => {
    expect(() => parseTrackFile('photo.jpg', '')).toThrow(
      new TrackParseError('Tiedostomuotoa ei tueta (photo.jpg). Tuetut muodot: TCX.'),
    )
    expect(() => parseTrackFile('no-extension', '')).toThrow(TrackParseError)
  })
})
