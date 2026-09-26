import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { Prisma, type User } from '@prisma/client'
import { prisma } from '../prisma.js'
import { getSessionUser } from '../session.js'
import { formatDate } from './sightings.js'

// RII-3. See docs/SPEC.md §5 "Tracks API". Tracks are parsed client-side;
// this route only validates and stores the normalized points.

const VALID_SOURCE_FORMATS = new Set(['tcx', 'gpx', 'kml', 'json'])
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_NAME_LENGTH = 200
const MAX_POINTS = 200_000
// Postgres caps bind parameters at 65,535 per statement; 5,000 rows × 8
// columns stays well under it.
const INSERT_CHUNK_SIZE = 5_000
// Fastify's default is 1 MB; a ~30k-point Google Fit ride is ~3 MB of JSON.
const POST_BODY_LIMIT = 25 * 1024 * 1024

interface TrackBody {
  name?: unknown
  sourceFormat?: unknown
  recordedDate?: unknown
  segments?: unknown
}

interface ValidPoint {
  segment: number
  lat: number
  lng: number
  elevationM: number | null
  recordedAt: Date | null
}

interface ValidTrack {
  name: string
  sourceFormat: string
  recordedDate: Date | null
  points: ValidPoint[]
}

type TrackWithOwnerAndPoints = Prisma.TrackGetPayload<{
  include: { owner: { select: { id: true; displayName: true } }; points: { select: { segment: true; lat: true; lng: true } } }
}>

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

  const points: ValidPoint[] = []
  for (const [segmentIndex, segment] of body.segments.entries()) {
    if (!Array.isArray(segment) || segment.length === 0) return INVALID('Reitin tiedot ovat virheelliset.')
    for (const raw of segment) {
      if (points.length >= MAX_POINTS) {
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
      let recordedAt: Date | null = null
      if (point.recordedAt !== undefined) {
        recordedAt = typeof point.recordedAt === 'string' ? new Date(point.recordedAt) : null
        if (!recordedAt || Number.isNaN(recordedAt.getTime())) return INVALID('Reitin tiedot ovat virheelliset.')
      }
      points.push({
        segment: segmentIndex,
        lat: point.lat,
        lng: point.lng,
        elevationM: point.elevationM ?? null,
        recordedAt,
      })
    }
  }

  return { ok: true, track: { name, sourceFormat, recordedDate, points } }
}

function groupIntoSegments(points: Array<{ segment: number; lat: number; lng: number }>): Array<Array<[number, number]>> {
  const segments: Array<Array<[number, number]>> = []
  let current: Array<[number, number]> | null = null
  let currentSegment = -1
  for (const point of points) {
    if (point.segment !== currentSegment || !current) {
      current = []
      segments.push(current)
      currentSegment = point.segment
    }
    current.push([point.lat, point.lng])
  }
  return segments
}

// Points go out as compact [lat, lng] pairs: the map needs nothing else,
// and it keeps the payload ~4× smaller than full point objects.
function toPublicTrack(
  track: { id: string; name: string; sourceFormat: string; recordedDate: Date | null; importedAt: Date },
  owner: { id: string; displayName: string } | null,
  points: Array<{ segment: number; lat: number; lng: number }>,
) {
  return {
    id: track.id,
    name: track.name,
    sourceFormat: track.sourceFormat,
    recordedDate: track.recordedDate ? formatDate(track.recordedDate) : null,
    importedAt: track.importedAt,
    owner,
    segments: groupIntoSegments(points),
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

    const tracks: TrackWithOwnerAndPoints[] = await prisma.track.findMany({
      include: {
        owner: { select: { id: true, displayName: true } },
        points: { select: { segment: true, lat: true, lng: true }, orderBy: { sequence: 'asc' } },
      },
      orderBy: [{ recordedDate: { sort: 'desc', nulls: 'last' } }, { importedAt: 'desc' }],
    })
    return { tracks: tracks.map((track) => toPublicTrack(track, track.owner, track.points)) }
  })

  app.post('/tracks', { bodyLimit: POST_BODY_LIMIT }, async (request, reply) => {
    const user = await requireUser(request, reply)
    if (!user) return reply

    const parsed = parseTrackBody((request.body ?? {}) as TrackBody)
    if (!parsed.ok) return reply.status(400).send({ error: 'invalid_input', message: parsed.message })
    const { name, sourceFormat, recordedDate, points } = parsed.track

    const track = await prisma.$transaction(
      async (tx) => {
        const created = await tx.track.create({
          data: { name, sourceFormat, recordedDate, ownerUserId: user.id },
        })
        for (let start = 0; start < points.length; start += INSERT_CHUNK_SIZE) {
          await tx.trackPoint.createMany({
            data: points.slice(start, start + INSERT_CHUNK_SIZE).map((point, i) => ({
              trackId: created.id,
              sequence: start + i,
              ...point,
            })),
          })
        }
        return created
      },
      // The default 5 s is too tight for the largest allowed tracks.
      { timeout: 60_000 },
    )

    // Built from the validated input rather than re-reading every point back.
    return reply
      .status(201)
      .send({ track: toPublicTrack(track, { id: user.id, displayName: user.displayName }, points) })
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

    // Points go with it via ON DELETE CASCADE.
    await prisma.track.delete({ where: { id } })
    return reply.status(204).send()
  })
}
