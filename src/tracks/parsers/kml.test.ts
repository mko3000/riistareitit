import { describe, expect, it } from 'vitest'
import { parseKml } from './kml'
import { TrackParseError } from './common'

function kml(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">
  <Document><name>Sports Tracker Route</name>${body}</Document>
</kml>`
}

describe('parseKml', () => {
  it('parses LineString coordinates (lng,lat,ele) in Sports Tracker layout, without a Document-name fallback', () => {
    const track = parseKml(
      kml(`<Folder><name>Route</name><Placemark><visibility>1</visibility><LineString><coordinates>
        22.17364,60.14959,39.3 22.173457,60.14964,38.2
        22.173375,60.149712
      </coordinates></LineString></Placemark></Folder>`),
    )
    expect(track).toEqual({
      sourceFormat: 'kml',
      segments: [
        [
          { lat: 60.14959, lng: 22.17364, elevationM: 39.3 },
          { lat: 60.14964, lng: 22.173457, elevationM: 38.2 },
          { lat: 60.149712, lng: 22.173375 },
        ],
      ],
    })
  })

  it('makes each LineString in a MultiGeometry its own segment and takes the placemark name', () => {
    const track = parseKml(
      kml(`<Placemark><name>Syysjahti</name><MultiGeometry>
        <LineString><coordinates>25,60 25.001,60.001</coordinates></LineString>
        <LineString><coordinates>25.01,60.01</coordinates></LineString>
      </MultiGeometry></Placemark>`),
    )
    expect(track.name).toBe('Syysjahti')
    expect(track.segments).toHaveLength(2)
  })

  it('parses gx:Track with paired when/coord, keeping time', () => {
    const track = parseKml(
      kml(`<Placemark><gx:MultiTrack><gx:Track>
        <when>2026-01-10T08:00:05Z</when><when>2026-01-10T08:00:10Z</when>
        <gx:coord>23.75 61.5 120.5</gx:coord><gx:coord>23.7502 61.5001 121</gx:coord>
      </gx:Track></gx:MultiTrack></Placemark>`),
    )
    expect(track.recordedDate).toBe('2026-01-10')
    expect(track.segments).toEqual([
      [
        { lat: 61.5, lng: 23.75, elevationM: 120.5, recordedAt: '2026-01-10T08:00:05.000Z' },
        { lat: 61.5001, lng: 23.7502, elevationM: 121, recordedAt: '2026-01-10T08:00:10.000Z' },
      ],
    ])
  })

  it('fails with a Finnish error when there are only points and polygons', () => {
    expect(() =>
      parseKml(
        kml(`<Placemark><Point><coordinates>25,60</coordinates></Point></Placemark>
          <Placemark><Polygon><outerBoundaryIs><LinearRing><coordinates>25,60 25.1,60 25,60.1 25,60</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`),
      ),
    ).toThrow(new TrackParseError('Tiedostossa ei ole sijaintitietoja.'))
  })

  it('fails with a Finnish error on malformed or non-KML XML', () => {
    const invalid = new TrackParseError('Tiedostoa ei voitu lukea – se ei ole kelvollinen KML-tiedosto.')
    expect(() => parseKml('<kml><Document>')).toThrow(invalid)
    expect(() => parseKml('<gpx/>')).toThrow(invalid)
  })
})
