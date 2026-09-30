import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { tileIntersectsFinland } from '../src/routes/tiles.js'
import { createTestApp } from './helpers.js'

// RII-6. fetch is stubbed throughout — these tests never call MML. The
// MML_API_KEY here is the fake one from vitest.config.ts.

let app: FastifyInstance

beforeAll(async () => {
  app = await createTestApp()
})
afterAll(async () => {
  await app.close()
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

// Tile containing central Helsinki at zoom 10, and one containing Paris.
const HELSINKI = { z: 10, x: 582, y: 296 }
const PARIS = { z: 10, x: 518, y: 352 }
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])

function stubMml(response: () => Response) {
  // Typed as fetch so mock.calls carries (url, init) for the assertions below.
  const fetchMock = vi.fn<typeof fetch>(async () => response())
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function getTile(layer: string, { z, x, y }: { z: number; x: number; y: number }) {
  return app.inject({ method: 'GET', url: `/tiles/${layer}/${z}/${x}/${y}` })
}

describe('GET /tiles/:layer/:z/:x/:y', () => {
  it('proxies a maastokartta tile with the key in Basic auth, not the URL', async () => {
    const fetchMock = stubMml(() => new Response(PNG_BYTES, { headers: { 'Content-Type': 'image/png' } }))

    const response = await getTile('maastokartta', HELSINKI)

    expect(response.statusCode).toBe(200)
    expect(response.rawPayload).toEqual(PNG_BYTES)
    expect(response.headers['content-type']).toBe('image/png')
    expect(response.headers['cache-control']).toBe('public, max-age=604800')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(
      'https://avoin-karttakuva.maanmittauslaitos.fi/avoin/wmts/1.0.0/maastokartta/default/WGS84_Pseudo-Mercator/10/296/582.png',
    )
    expect(String(url)).not.toContain('test-mml-api-key')
    const expectedAuth = `Basic ${Buffer.from('test-mml-api-key:').toString('base64')}`
    expect((init?.headers as Record<string, string>).Authorization).toBe(expectedAuth)
  })

  it('requests ortokuva as JPEG', async () => {
    const fetchMock = stubMml(() => new Response('jpeg', { headers: { 'Content-Type': 'image/jpeg' } }))
    const response = await getTile('ortokuva', HELSINKI)

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toBe('image/jpeg')
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/ortokuva\/default\/WGS84_Pseudo-Mercator\/10\/296\/582\.jpg$/)
  })

  it.each([
    ['unknown layer', '/tiles/selkokartta/10/582/296'],
    ['zoom above 16', '/tiles/maastokartta/17/0/0'],
    ['x out of range for the zoom', '/tiles/maastokartta/2/4/0'],
    ['negative index', '/tiles/maastokartta/10/-1/296'],
    ['non-numeric index', '/tiles/maastokartta/10/abc/296'],
  ])('rejects %s with 400 without calling MML', async (_case, url) => {
    const fetchMock = stubMml(() => new Response('unused'))
    const response = await app.inject({ method: 'GET', url })

    expect(response.statusCode).toBe(400)
    expect(response.json().error).toBe('invalid_tile')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('answers 404 for tiles outside Finland without calling MML', async () => {
    const fetchMock = stubMml(() => new Response('unused'))
    const response = await getTile('maastokartta', PARIS)

    expect(response.statusCode).toBe(404)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('answers 503 when MML_API_KEY is not set', async () => {
    vi.stubEnv('MML_API_KEY', '')
    const fetchMock = stubMml(() => new Response('unused'))
    const response = await getTile('maastokartta', HELSINKI)

    expect(response.statusCode).toBe(503)
    expect(response.json().error).toBe('tiles_not_configured')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('passes an MML 404 through as 404', async () => {
    stubMml(() => new Response('no such tile', { status: 404 }))
    expect((await getTile('maastokartta', HELSINKI)).statusCode).toBe(404)
  })

  it.each([401, 403, 500])('turns an MML %s into 502 tiles_unavailable', async (status) => {
    stubMml(() => new Response('nope', { status }))
    const response = await getTile('maastokartta', HELSINKI)

    expect(response.statusCode).toBe(502)
    expect(response.json().error).toBe('tiles_unavailable')
  })

  it('turns a network failure or timeout into 502', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new DOMException('timed out', 'TimeoutError'))))
    const response = await getTile('maastokartta', HELSINKI)
    expect(response.statusCode).toBe(502)
  })
})

describe('tileIntersectsFinland', () => {
  it('covers the whole country, from Hanko to Nuorgam and Åland to Ilomantsi', () => {
    const tileAt = (lat: number, lng: number, z: number) => {
      const x = Math.floor(((lng + 180) / 360) * 2 ** z)
      const latRad = (lat * Math.PI) / 180
      const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * 2 ** z)
      return [x, y] as const
    }
    for (const [lat, lng] of [
      [59.82, 22.97], // Hanko
      [70.08, 27.9], // Nuorgam
      [60.1, 19.94], // Mariehamn
      [62.67, 31.0], // Ilomantsi
    ]) {
      const [x, y] = tileAt(lat, lng, 16)
      expect(tileIntersectsFinland(16, x, y)).toBe(true)
    }
    const [x, y] = tileAt(59.33, 18.07, 16) // Stockholm
    expect(tileIntersectsFinland(16, x, y)).toBe(false)
  })

  it('includes the single world tile at zoom 0', () => {
    expect(tileIntersectsFinland(0, 0, 0)).toBe(true)
  })
})
