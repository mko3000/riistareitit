import type { FastifyInstance } from 'fastify'
import { env } from '../env.js'
import { getSessionUser } from '../session.js'

// RII-6: proxies base map tiles from the National Land Survey of Finland's
// (MML) open WMTS so the API key stays on the server. Login required since
// RII-41, so it isn't an open proxy running on our key. See docs/SPEC.md "Map
// tiles API".

const MML_WMTS_BASE = 'https://avoin-karttakuva.maanmittauslaitos.fi/avoin/wmts/1.0.0'
const LAYERS: Record<string, { extension: string }> = {
  maastokartta: { extension: 'png' },
  ortokuva: { extension: 'jpg' },
}
const MAX_ZOOM = 16 // the open service's limit in WGS84_Pseudo-Mercator
const UPSTREAM_TIMEOUT_MS = 10_000
const BROWSER_CACHE_SECONDS = 7 * 24 * 60 * 60

// MML's coverage (Finland) plus a margin. Tiles outside it would be blank,
// so they're answered locally without calling MML.
const FINLAND_BOUNDS = { south: 58.8, north: 70.3, west: 19.0, east: 32.0 }

function tileLng(x: number, z: number): number {
  return (x / 2 ** z) * 360 - 180
}

function tileLat(y: number, z: number): number {
  return (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI
}

export function tileIntersectsFinland(z: number, x: number, y: number): boolean {
  const west = tileLng(x, z)
  const east = tileLng(x + 1, z)
  const north = tileLat(y, z)
  const south = tileLat(y + 1, z)
  return (
    east > FINLAND_BOUNDS.west &&
    west < FINLAND_BOUNDS.east &&
    north > FINLAND_BOUNDS.south &&
    south < FINLAND_BOUNDS.north
  )
}

function parseTileIndex(value: string): number | null {
  return /^\d+$/.test(value) ? Number(value) : null
}

export default async function tilesRoutes(app: FastifyInstance) {
  app.get('/tiles/:layer/:z/:x/:y', async (request, reply) => {
    // First, so logged-out requests never reach MML (nor learn anything else).
    if (!(await getSessionUser(request))) {
      return reply.status(401).send({ error: 'not_logged_in', message: 'Log in to use the MML map layers.' })
    }

    const params = request.params as { layer: string; z: string; x: string; y: string }
    const layer = LAYERS[params.layer]
    const z = parseTileIndex(params.z)
    const x = parseTileIndex(params.x)
    const y = parseTileIndex(params.y)
    if (!layer || z === null || x === null || y === null || z > MAX_ZOOM || x >= 2 ** z || y >= 2 ** z) {
      return reply.status(400).send({ error: 'invalid_tile', message: 'Invalid layer or tile coordinates.' })
    }

    const apiKey = env.mmlApiKey
    if (!apiKey) {
      return reply
        .status(503)
        .send({ error: 'tiles_not_configured', message: 'MML_API_KEY is not set on the server.' })
    }

    if (!tileIntersectsFinland(z, x, y)) {
      return reply.status(404).send({ error: 'not_found', message: 'Tile is outside the map coverage.' })
    }

    // WMTS REST order is TileMatrix/TileRow/TileCol, i.e. z/y/x.
    const url = `${MML_WMTS_BASE}/${params.layer}/default/WGS84_Pseudo-Mercator/${z}/${y}/${x}.${layer.extension}`
    let upstream: Response
    try {
      upstream = await fetch(url, {
        // Basic auth (key as username, empty password) rather than an
        // api-key URL parameter, so the key never shows up in logged URLs.
        headers: { Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}` },
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      })
    } catch (err) {
      request.log.warn({ err }, 'MML tile request failed')
      return reply.status(502).send({ error: 'tiles_unavailable', message: 'Map tile service unavailable.' })
    }

    if (upstream.status === 404) {
      return reply.status(404).send({ error: 'not_found', message: 'Tile not found.' })
    }
    if (!upstream.ok) {
      if (upstream.status === 401 || upstream.status === 403) {
        request.log.error(`MML rejected the tile request (${upstream.status}) — check MML_API_KEY`)
      } else {
        request.log.warn(`MML tile request failed with ${upstream.status}`)
      }
      return reply.status(502).send({ error: 'tiles_unavailable', message: 'Map tile service unavailable.' })
    }

    const body = Buffer.from(await upstream.arrayBuffer())
    return reply
      .header('Content-Type', upstream.headers.get('content-type') ?? `image/${layer.extension === 'jpg' ? 'jpeg' : 'png'}`)
      // private: login-only content must not be served from a shared cache.
      .header('Cache-Control', `private, max-age=${BROWSER_CACHE_SECONDS}`)
      .send(body)
  })
}
