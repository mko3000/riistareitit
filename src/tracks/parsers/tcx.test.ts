import { describe, expect, it } from 'vitest'
import { parseTcx } from './tcx'
import { TrackParseError } from './common'

// Synthetic data shaped like a Google Fit Takeout export: multiple laps,
// each starting with a position-less trackpoint.
function tcx(activities: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
  <Activities>${activities}</Activities>
</TrainingCenterDatabase>`
}

function trackpoint(time: string, position?: [number, number], altitude?: number): string {
  return `<Trackpoint>
    <Time>${time}</Time>
    ${position ? `<Position><LatitudeDegrees>${position[0]}</LatitudeDegrees><LongitudeDegrees>${position[1]}</LongitudeDegrees></Position>` : ''}
    ${altitude !== undefined ? `<AltitudeMeters>${altitude}</AltitudeMeters>` : ''}
  </Trackpoint>`
}

const TWO_LAPS = tcx(`
  <Activity Sport="Walking">
    <Id>2026-01-10T08:00:00.000Z</Id>
    <Lap StartTime="2026-01-10T08:00:00.000Z"><Track>
      ${trackpoint('2026-01-10T08:00:00.000Z')}
      ${trackpoint('2026-01-10T08:00:05.000Z', [61.5, 23.75], 120.5)}
      ${trackpoint('2026-01-10T08:00:10.000Z', [61.5001, 23.7502], 121)}
    </Track></Lap>
    <Lap StartTime="2026-01-10T08:10:00.000Z"><Track>
      ${trackpoint('2026-01-10T08:10:00.000Z')}
      ${trackpoint('2026-01-10T08:10:05.000Z', [61.501, 23.751])}
    </Track></Lap>
  </Activity>`)

describe('parseTcx', () => {
  it('turns each lap track into its own segment, keeping elevation and time', () => {
    const track = parseTcx(TWO_LAPS)
    expect(track.sourceFormat).toBe('tcx')
    expect(track.segments).toEqual([
      [
        { lat: 61.5, lng: 23.75, elevationM: 120.5, recordedAt: '2026-01-10T08:00:05.000Z' },
        { lat: 61.5001, lng: 23.7502, elevationM: 121, recordedAt: '2026-01-10T08:00:10.000Z' },
      ],
      [{ lat: 61.501, lng: 23.751, recordedAt: '2026-01-10T08:10:05.000Z' }],
    ])
  })

  it('derives recordedDate from the first timestamped point', () => {
    expect(parseTcx(TWO_LAPS).recordedDate).toBe('2026-01-10')
  })

  it('works with a namespace prefix on the elements', () => {
    const prefixed = `<?xml version="1.0"?>
<t:TrainingCenterDatabase xmlns:t="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
  <t:Activities><t:Activity><t:Lap><t:Track><t:Trackpoint>
    <t:Position><t:LatitudeDegrees>60.1</t:LatitudeDegrees><t:LongitudeDegrees>24.9</t:LongitudeDegrees></t:Position>
  </t:Trackpoint></t:Track></t:Lap></t:Activity></t:Activities>
</t:TrainingCenterDatabase>`
    expect(parseTcx(prefixed).segments).toEqual([[{ lat: 60.1, lng: 24.9 }]])
  })

  it('skips out-of-range positions and drops an unparseable time without dropping the point', () => {
    const track = parseTcx(
      tcx(`<Activity><Lap><Track>
        ${trackpoint('2026-01-10T08:00:00.000Z', [91, 23])}
        ${trackpoint('not-a-time', [61.5, 23.75])}
      </Track></Lap></Activity>`),
    )
    expect(track.segments).toEqual([[{ lat: 61.5, lng: 23.75 }]])
    expect(track.recordedDate).toBeUndefined()
  })

  it('fails with a Finnish error when there is no GPS data (step-only activity)', () => {
    const stepsOnly = tcx(`<Activity><Lap><Track>
      ${trackpoint('2026-01-10T08:00:00.000Z')}
      ${trackpoint('2026-01-10T08:00:05.000Z')}
    </Track></Lap></Activity>`)
    expect(() => parseTcx(stepsOnly)).toThrow(new TrackParseError('Tiedostossa ei ole sijaintitietoja.'))
  })

  it('fails with a Finnish error on malformed XML', () => {
    expect(() => parseTcx('<TrainingCenterDatabase><Activities>')).toThrow(
      new TrackParseError('Tiedostoa ei voitu lukea – se ei ole kelvollinen TCX-tiedosto.'),
    )
  })

  it('fails when the file is well-formed XML but not TCX', () => {
    expect(() => parseTcx('<gpx><trk/></gpx>')).toThrow(TrackParseError)
  })
})
