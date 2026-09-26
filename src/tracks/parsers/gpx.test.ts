import { describe, expect, it } from 'vitest'
import { parseGpx } from './gpx'
import { TrackParseError } from './common'

function gpx(body: string, ns = 'http://www.topografix.com/GPX/1/1'): string {
  return `<?xml version="1.0" encoding="UTF-8"?><gpx xmlns="${ns}" version="1.1" creator="test">${body}</gpx>`
}

describe('parseGpx', () => {
  it('turns each trkseg into a segment, keeping elevation and time', () => {
    const track = parseGpx(
      gpx(`<metadata><name>Metadata name</name></metadata>
        <trk><name>Aamulenkki</name>
          <trkseg>
            <trkpt lat="61.5" lon="23.75"><ele>120.5</ele><time>2026-01-10T08:00:05Z</time></trkpt>
            <trkpt lat="61.5001" lon="23.7502"><ele>121</ele><time>2026-01-10T08:00:10Z</time>
              <extensions><gpxtpx:TrackPointExtension xmlns:gpxtpx="x"><gpxtpx:hr>90</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions>
            </trkpt>
          </trkseg>
          <trkseg><trkpt lat="61.501" lon="23.751"/></trkseg>
        </trk>`),
    )
    expect(track).toEqual({
      sourceFormat: 'gpx',
      name: 'Aamulenkki',
      recordedDate: '2026-01-10',
      segments: [
        [
          { lat: 61.5, lng: 23.75, elevationM: 120.5, recordedAt: '2026-01-10T08:00:05.000Z' },
          { lat: 61.5001, lng: 23.7502, elevationM: 121, recordedAt: '2026-01-10T08:00:10.000Z' },
        ],
        [{ lat: 61.501, lng: 23.751 }],
      ],
    })
  })

  it('uses routes when the file has no track points (Sports Tracker route export)', () => {
    const track = parseGpx(
      gpx(`<metadata><name>Reitti</name></metadata>
        <rte><rtept lat="60.2" lon="24.9"><ele>82.9</ele></rtept><rtept lat="60.21" lon="24.91"/></rte>`),
    )
    expect(track.name).toBe('Reitti')
    expect(track.recordedDate).toBeUndefined()
    expect(track.segments).toEqual([[{ lat: 60.2, lng: 24.9, elevationM: 82.9 }, { lat: 60.21, lng: 24.91 }]])
  })

  it('ignores routes when tracks are present, so the walk is not drawn twice', () => {
    const track = parseGpx(
      gpx(`<rte><rtept lat="1" lon="1"/></rte><trk><trkseg><trkpt lat="2" lon="2"/></trkseg></trk>`),
    )
    expect(track.segments).toEqual([[{ lat: 2, lng: 2 }]])
  })

  it('accepts GPX 1.0', () => {
    const track = parseGpx(gpx(`<trk><trkseg><trkpt lat="60" lon="25"/></trkseg></trk>`, 'http://www.topografix.com/GPX/1/0'))
    expect(track.segments).toEqual([[{ lat: 60, lng: 25 }]])
  })

  it('fails with a Finnish error when there are only waypoints', () => {
    expect(() => parseGpx(gpx(`<wpt lat="60" lon="25"><name>Koju</name></wpt>`))).toThrow(
      new TrackParseError('Tiedostossa ei ole sijaintitietoja.'),
    )
  })

  it('fails with a Finnish error on malformed or non-GPX XML', () => {
    const invalid = new TrackParseError('Tiedostoa ei voitu lukea – se ei ole kelvollinen GPX-tiedosto.')
    expect(() => parseGpx('<gpx><trk>')).toThrow(invalid)
    expect(() => parseGpx('<kml/>')).toThrow(invalid)
  })
})
