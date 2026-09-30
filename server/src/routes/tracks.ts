import type { FastifyInstance } from 'fastify'
import { Prisma, type Track } from '@prisma/client'
import { prisma } from '../prisma.js'
import { requireUser, resolvePartyId, tracksVisibleTo } from '../visibility.js'
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
  partyId?: unknown
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

// `message` is English and developer-facing — the client shows its own
// Finnish text chosen by `error` code (docs/SPEC.md §7).
const INVALID = (message: string, error = 'invalid_input') => ({ ok: false as const, error, message })

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

// One message rather than per-field errors: there's no form on the client to
// attach them to, and a well-behaved client never trips these. The one a
// real user can hit (too many points) gets its own error code.
function parseTrackBody(
  body: TrackBody,
): { ok: true; track: ValidTrack } | { ok: false; error: string; message: string } {
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name || name.length > MAX_NAME_LENGTH) return INVALID('Track name is missing or too long.')

  const sourceFormat = typeof body.sourceFormat === 'string' ? body.sourceFormat : ''
  if (!VALID_SOURCE_FORMATS.has(sourceFormat)) return INVALID('Unknown source format.')

  let recordedDate: Date | null = null
  if (body.recordedDate !== undefined && body.recordedDate !== null) {
    if (typeof body.recordedDate !== 'string' || !DATE_RE.test(body.recordedDate)) {
      return INVALID('Invalid recorded date.')
    }
    recordedDate = new Date(`${body.recordedDate}T00:00:00Z`)
    if (Number.isNaN(recordedDate.getTime())) return INVALID('Invalid recorded date.')
  }

  if (!Array.isArray(body.segments) || body.segments.length === 0) return INVALID('Track has no points.')

  const segments: StoredSegments = []
  let pointCount = 0
  for (const segment of body.segments) {
    if (!Array.isArray(segment) || segment.length === 0) return INVALID('Invalid track data.')
    const stored: StoredPoint[] = []
    for (const raw of segment) {
      if (++pointCount > MAX_POINTS) {
        return INVALID(`Track has more than ${MAX_POINTS} points.`, 'too_many_points')
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
        return INVALID('Track has invalid coordinates.')
      }
      if (point.elevationM !== undefined && !isFiniteNumber(point.elevationM)) {
        return INVALID('Invalid track data.')
      }
      let recordedAtMs: number | null = null
      if (point.recordedAt !== undefined) {
        recordedAtMs = typeof point.recordedAt === 'string' ? Date.parse(point.recordedAt) : Number.NaN
        if (Number.isNaN(recordedAtMs)) return INVALID('Invalid track data.')
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
    partyId: track.partyId, // RII-43: null = private to the owner
    segments: segments.map((segment) => segment.map((point): [number, number] => [point[0], point[1]])),
  }
}

async function findVisibleTrack(id: string, userId: string) {
  return prisma.track
    .findFirst({ where: { AND: [{ id }, tracksVisibleTo(userId)] }, select: { ownerUserId: true } })
    .catch((err) => {
      // A malformed id can't match any UUID row.
      if (err instanceof Prisma.PrismaClientKnownRequestError) return null
      throw err
    })
}

export default async function tracksRoutes(app: FastifyInstance) {
  // RII-43: you see what you own plus everything in your parties
  // (docs/SPEC.md §9 rule 3).
  app.get('/tracks', async (request, reply) => {
    const user = await requireUser(request, reply)
    if (!user) return reply

    const tracks = await prisma.track.findMany({
      where: tracksVisibleTo(user.id),
      include: { owner: { select: { id: true, displayName: true } } },
      orderBy: [{ recordedDate: { sort: 'desc', nulls: 'last' } }, { importedAt: 'desc' }],
    })
    return { tracks: tracks.map(toPublicTrack) }
  })

  app.post('/tracks', { bodyLimit: POST_BODY_LIMIT }, async (request, reply) => {
    const user = await requireUser(request, reply)
    if (!user) return reply

    const parsed = parseTrackBody((request.body ?? {}) as TrackBody)
    if (!parsed.ok) return reply.status(400).send({ error: parsed.error, message: parsed.message })
    const { name, sourceFormat, recordedDate, segments } = parsed.track
    // RII-43: one of the owner's parties, or private (null/omitted).
    const party = await resolvePartyId((request.body as TrackBody | undefined)?.partyId, user.id)
    if (!party.ok) return reply.status(400).send({ error: 'invalid_input', message: 'Not one of your parties.' })

    const track = await prisma.track.create({
      data: { name, sourceFormat, recordedDate, segments, ownerUserId: user.id, partyId: party.partyId ?? null },
      include: { owner: { select: { id: true, displayName: true } } },
    })
    return reply.status(201).send({ track: toPublicTrack(track) })
  })

  // RII-46: the owner moves a track to another of their parties, or makes it
  // private. Only partyId can change — never the points. Same 404/403 rules
  // as delete.
  app.patch('/tracks/:id', async (request, reply) => {
    const user = await requireUser(request, reply)
    if (!user) return reply

    const { id } = request.params as { id: string }
    const track = await findVisibleTrack(id, user.id)
    if (!track) return reply.status(404).send({ error: 'not_found', message: 'Track not found.' })
    if (track.ownerUserId !== user.id) {
      return reply.status(403).send({ error: 'forbidden', message: 'Only the track owner can change it.' })
    }

    const body = (request.body ?? {}) as { partyId?: unknown }
    // Omitting partyId would be a no-op; require it explicitly.
    if (body.partyId === undefined) {
      return reply.status(400).send({ error: 'invalid_input', message: 'partyId is required (null = private).' })
    }
    const party = await resolvePartyId(body.partyId, user.id)
    if (!party.ok) return reply.status(400).send({ error: 'invalid_input', message: 'Not one of your parties.' })

    const updated = await prisma.track.update({
      where: { id },
      data: { partyId: party.partyId ?? null },
      include: { owner: { select: { id: true, displayName: true } } },
    })
    return reply.send({ track: toPublicTrack(updated) })
  })

  // Owner only (docs/SPEC.md §9 rule 4). A track the user can't see answers
  // 404 like a missing one (RII-43), so its existence isn't revealed.
  app.delete('/tracks/:id', async (request, reply) => {
    const user = await requireUser(request, reply)
    if (!user) return reply

    const { id } = request.params as { id: string }
    const track = await findVisibleTrack(id, user.id)
    if (!track) return reply.status(404).send({ error: 'not_found', message: 'Track not found.' })
    if (track.ownerUserId !== user.id) {
      return reply.status(403).send({ error: 'forbidden', message: 'Only the track owner can delete it.' })
    }

    await prisma.track.delete({ where: { id } })
    return reply.status(204).send()
  })
}
