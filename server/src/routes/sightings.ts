import type { FastifyInstance } from 'fastify'
import type { Sighting, Species } from '@prisma/client'
import { prisma } from '../prisma.js'
import { getSessionUser } from '../session.js'

const VALID_KINDS = new Set(['sighting', 'kill'])
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

interface CreateSightingBody {
  lat?: unknown
  lng?: unknown
  speciesKey?: unknown
  customSpecies?: unknown
  kind?: unknown
  personDisplay?: unknown
  observedDate?: unknown
  observedTime?: unknown
}

type SightingWithSpecies = Sighting & { species: Species | null }

// observedDate/observedTime are DATE/TIME columns — Prisma returns them as
// Date objects at UTC midnight (date) or 1970-01-01 UTC (time). Format
// explicitly with UTC getters rather than relying on default JSON
// serialization, which would round-trip through the *local* timezone and
// can shift the date/time by a day/hour depending on where the server runs.
function formatDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

function formatTime(d: Date): string {
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

function toPublicSighting(sighting: SightingWithSpecies) {
  return {
    id: sighting.id,
    lat: sighting.lat,
    lng: sighting.lng,
    species: sighting.species
      ? { key: sighting.species.key, nameFi: sighting.species.nameFi, icon: sighting.species.icon }
      : null,
    customSpecies: sighting.customSpecies,
    kind: sighting.kind,
    notes: sighting.notes,
    personDisplay: sighting.personDisplay,
    observedDate: formatDate(sighting.observedDate),
    observedTime: sighting.observedTime ? formatTime(sighting.observedTime) : null,
    createdAt: sighting.createdAt,
    updatedAt: sighting.updatedAt,
  }
}

export default async function sightingsRoutes(app: FastifyInstance) {
  // Not an explicit RII-22 acceptance criterion, but required by one: the
  // species-picker buttons have to read their options from somewhere other
  // than a hardcoded duplicate of RII-20's seed data.
  app.get('/species', async () => {
    const species = await prisma.species.findMany({ orderBy: { nameFi: 'asc' } })
    return { species }
  })

  // Visibility: global, no filtering — deliberate testing shortcut, see
  // RII-33 (not yet resolved) before this goes beyond testing.
  app.get('/sightings', async () => {
    const sightings = await prisma.sighting.findMany({
      include: { species: true },
      orderBy: { createdAt: 'desc' },
    })
    return { sightings: sightings.map(toPublicSighting) }
  })

  app.post('/sightings', async (request, reply) => {
    const body = request.body as CreateSightingBody
    const fieldErrors: Record<string, string> = {}

    const lat = typeof body.lat === 'number' && Number.isFinite(body.lat) ? body.lat : null
    const lng = typeof body.lng === 'number' && Number.isFinite(body.lng) ? body.lng : null
    if (lat === null || lat < -90 || lat > 90) fieldErrors.lat = 'Invalid latitude.'
    if (lng === null || lng < -180 || lng > 180) fieldErrors.lng = 'Invalid longitude.'

    const speciesKey = typeof body.speciesKey === 'string' ? body.speciesKey.trim() : ''
    const customSpeciesInput = typeof body.customSpecies === 'string' ? body.customSpecies.trim() : ''
    let species: Species | null = null
    if (speciesKey) {
      species = await prisma.species.findUnique({ where: { key: speciesKey } })
      if (!species) fieldErrors.species = 'Unknown species.'
    } else if (!customSpeciesInput) {
      fieldErrors.species = 'Choose a species or enter one.'
    }

    const kind = typeof body.kind === 'string' && body.kind ? body.kind : 'sighting'
    if (!VALID_KINDS.has(kind)) fieldErrors.kind = 'Invalid type.'

    let observedDate: Date
    if (typeof body.observedDate === 'string' && body.observedDate) {
      const parsed = new Date(body.observedDate)
      if (Number.isNaN(parsed.getTime())) {
        fieldErrors.observedDate = 'Invalid date.'
        observedDate = new Date()
      } else {
        observedDate = parsed
      }
    } else {
      observedDate = new Date()
    }

    let observedTime: Date | undefined
    if (typeof body.observedTime === 'string' && body.observedTime) {
      if (!TIME_RE.test(body.observedTime)) {
        fieldErrors.observedTime = 'Invalid time.'
      } else {
        observedTime = new Date(`1970-01-01T${body.observedTime}:00Z`)
      }
    }

    if (Object.keys(fieldErrors).length > 0) {
      return reply.status(400).send({ error: 'invalid_input', fieldErrors })
    }

    const sessionUser = await getSessionUser(request)
    const personDisplay =
      typeof body.personDisplay === 'string' && body.personDisplay.trim()
        ? body.personDisplay.trim()
        : (sessionUser?.displayName ?? 'unknown')

    const sighting = await prisma.sighting.create({
      data: {
        // lat/lng validated non-null above; fieldErrors check would have
        // returned already if either were null.
        lat: lat as number,
        lng: lng as number,
        speciesId: species?.id,
        customSpecies: species ? null : customSpeciesInput,
        kind,
        personDisplay,
        createdByUserId: sessionUser?.id,
        observedDate,
        observedTime,
      },
      include: { species: true },
    })

    return reply.status(201).send({ sighting: toPublicSighting(sighting) })
  })
}
