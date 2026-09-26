import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { Prisma, type Track, type User } from '@prisma/client'
import { prisma } from '../prisma.js'
import { getSessionUser } from '../session.js'
import { formatDate } from './sightings.js'

// RII-3. See docs/SPEC.md §5 "Tracks API". Tracks are parsed client-side;
// this route only validates and stores the normalized points.

const VALID_SOURCE_FORMATS = new Set(['tcx', 'gpx', 'kml', 'json'])
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_NAME_LENGTH = 200
const MAX_POINTS = 200_000
// Fastify's default is 1 MB; a ~30k-point Google Fit ride is ~3 MB of JSON.
const POST_BODY_LIMIT = 25 * 1024 * 1024

interface TrackBody {
  name?: unknown
  sourceFormat?: unknown
  recordedDate?: unknown
  segments?: unknown
}

// Stored format of one point in tracks.segments (docs/SPEC.md §4 "Track
// geometry storage"): [lat, lng, elevationM, recordedAtEpochMs], trailing
// nulls trimmed.
type StoredPoint = [number, number] | [number, number, number | null] | [number, number, number | null, number]
type StoredSegments = StoredPoint[][]

interface ValidTrack {
  name: string
  sourceFormat: string
  recordedDate: Date | null
  segments: StoredSegments
}

type TrackWithOwner = Track & { owner: { id: string; displayName: string } | null }

const INVALID = (message: string) => ({ ok: false as const, message })

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

// One Finnish message rather than per-field errors: there's no form on the
// client to attach them to, and a well-behaved client never trips these.
function parseTrackBody(body: TrackBody): { ok: true; track: ValidTrack } | { ok: false; message: string } {
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name || name.length > MAX_NAME_LENGTH) return INVALID('Reitin nimi puuttuu tai on liian pitkä.')

  const sourceFormat = typeof body.sourceFormat === 'string' ? body.sourceFormat : ''
  if (!VALID_SOURCE_FORMATS.has(sourceFormat)) return INVALID('Tuntematon tiedostomuoto.')

  let recordedDate: Date | null = null
  if (body.recordedDate !== undefined && body.recordedDate !== null) {
    if (typeof body.recordedDate !== 'string' || !DATE_RE.test(body.recordedDate)) {
      return INVALID('Reitin päivämäärä on virheellinen.')
    }
    recordedDate = new Date(`${body.recordedDate}T00:00:00Z`)
    if (Number.isNaN(recordedDate.getTime())) return INVALID('Reitin päivämäärä on virheellinen.')
  }

  if (!Array.isArray(body.segments) || body.segments.length === 0) return INVALID('Reitissä ei ole pisteitä.')

  const segments: StoredSegments = []
  let pointCount = 0
  for (const segment of body.segments) {
    if (!Array.isArray(segment) || segment.length === 0) return INVALID('Reitin tiedot ovat virheelliset.')
    const stored: StoredPoint[] = []
    for (const raw of segment) {
      if (++pointCount > MAX_POINTS) {
        return INVALID(`Reitissä on liikaa pisteitä (enintään ${MAX_POINTS.toLocaleString('fi-FI')}).`)
      }
      const point = raw as { lat?: unknown; lng?: unknown; elevationM?: unknown; recordedAt?: unknown } | null
      if (
        !point ||
        !isFiniteNumber(point.lat) ||
        !isFiniteNumber(point.lng) ||
        point.lat < -90 ||
        point.lat > 90 ||
        point.lng < -180 ||
        point.lng > 180
      ) {
        return INVALID('Reitissä on virheellisiä sijainteja.')
      }
      if (point.elevationM !== undefined && !isFiniteNumber(point.elevationM)) {
        return INVALID('Reitin tiedot ovat virheelliset.')
      }
      let recordedAtMs: number | null = null
      if (point.recordedAt !== undefined) {
        recordedAtMs = typeof point.recordedAt === 'string' ? Date.parse(point.recordedAt) : Number.NaN
        if (Number.isNaN(recordedAtMs)) return INVALID('Reitin tiedot ovat virheelliset.')
      }
      const elevationM = point.elevationM ?? null
      stored.push(
        recordedAtMs !== null
          ? [point.lat, point.lng, elevationM, recordedAtMs]
          : elevationM !== null
            ? [point.lat, point.lng, elevationM]
            : [point.lat, point.lng],
      )
    }
    segments.push(stored)
  }

  return { ok: true, track: { name, sourceFormat, recordedDate, segments } }
}

// Points go out as compact [lat, lng] pairs: the map needs nothing else,
// and it keeps the payload ~4× smaller than full point objects.
function toPublicTrack(track: TrackWithOwner) {
  const segments = track.segments as StoredSegments
  return {
    id: track.id,
    name: track.name,
    sourceFormat: track.sourceFormat,
    recordedDate: track.recordedDate ? formatDate(track.recordedDate) : null,
    importedAt: track.importedAt,
    owner: track.owner,
    segments: segments.map((segment) => segment.map((point): [number, number] => [point[0], point[1]])),
  }
}

async function requireUser(request: FastifyRequest, reply: FastifyReply): Promise<User | null> {
  const user = await getSessionUser(request)
  if (!user) {
    await reply.status(401).send({ error: 'not_logged_in', message: 'Kirjaudu sisään nähdäksesi ja lisätäksesi reittejä.' })
    return null
  }
  return user
}

export default async function tracksRoutes(app: FastifyInstance) {
  // Visibility: every track to every logged-in user — deliberate testing
  // shortcut per Miko 2026-09-26, see RII-33 before real use.
  app.get('/tracks', async (request, reply) => {
    if (!(await requireUser(request, reply))) return reply

    const tracks = await prisma.track.findMany({
      include: { owner: { select: { id: true, displayName: true } } },
      orderBy: [{ recordedDate: { sort: 'desc', nulls: 'last' } }, { importedAt: 'desc' }],
    })
    return { tracks: tracks.map(toPublicTrack) }
  })

  app.post('/tracks', { bodyLimit: POST_BODY_LIMIT }, async (request, reply) => {
    const user = await requireUser(request, reply)
    if (!user) return reply

    const parsed = parseTrackBody((request.body ?? {}) as TrackBody)
    if (!parsed.ok) return reply.status(400).send({ error: 'invalid_input', message: parsed.message })
    const { name, sourceFormat, recordedDate, segments } = parsed.track

    const track = await prisma.track.create({
      data: { name, sourceFormat, recordedDate, segments, ownerUserId: user.id },
      include: { owner: { select: { id: true, displayName: true } } },
    })
    return reply.status(201).send({ track: toPublicTrack(track) })
  })

  // Owner only — unlike sightings: a track is one person's recorded movement.
  app.delete('/tracks/:id', async (request, reply) => {
    const user = await requireUser(request, reply)
    if (!user) return reply

    const { id } = request.params as { id: string }
    const track = await prisma.track.findUnique({ where: { id }, select: { ownerUserId: true } }).catch((err) => {
      // A malformed id can't match any UUID row.
      if (err instanceof Prisma.PrismaClientKnownRequestError) return null
      throw err
    })
    if (!track) return reply.status(404).send({ error: 'not_found', message: 'Reittiä ei enää ole.' })
    if (track.ownerUserId !== user.id) {
      return reply.status(403).send({ error: 'forbidden', message: 'Voit poistaa vain omia reittejäsi.' })
    }

    await prisma.track.delete({ where: { id } })
    return reply.status(204).send()
  })
}
