import type { FastifyInstance, FastifyReply } from 'fastify'
import { Prisma, type Sighting, type Species, type User } from '@prisma/client'
import { prisma } from '../prisma.js'
import { requireUser, resolvePartyId, sightingsVisibleTo } from '../visibility.js'

const VALID_KINDS = new Set(['sighting', 'kill'])
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

// lat/lng now shared by both POST (create) and PATCH (RII-34 added
// move-via-map-tap for edit, extending what was create-only at the time
// RII-23 shipped).
interface SightingBodyCommon {
  lat?: unknown
  lng?: unknown
  speciesKey?: unknown
  customSpecies?: unknown
  kind?: unknown
  personDisplay?: unknown
  observedDate?: unknown
  observedTime?: unknown
  notes?: unknown
  partyId?: unknown
}

type SightingWithRelations = Sighting & {
  species: Species | null
  createdBy: { id: string; displayName: string } | null
}

// What every read/write of a sighting joins in for the response.
const SIGHTING_INCLUDE = {
  species: true,
  createdBy: { select: { id: true, displayName: true } },
} as const

function isRecordNotFound(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025'
}

// observedDate/observedTime are DATE/TIME columns — Prisma returns them as
// Date objects at UTC midnight (date) or 1970-01-01 UTC (time). Format
// explicitly with UTC getters rather than relying on default JSON
// serialization, which would round-trip through the *local* timezone and
// can shift the date/time by a day/hour depending on where the server runs.
export function formatDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

function formatTime(d: Date): string {
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

function toPublicSighting(sighting: SightingWithRelations) {
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
    // RII-43: which party sees it (null = private) and who created it, so
    // the UI can offer editing only on your own sightings.
    partyId: sighting.partyId,
    createdBy: sighting.createdBy,
    observedDate: formatDate(sighting.observedDate),
    observedTime: sighting.observedTime ? formatTime(sighting.observedTime) : null,
    createdAt: sighting.createdAt,
    updatedAt: sighting.updatedAt,
  }
}

// Shared by POST (create) and PATCH (update, RII-23/RII-34): lat/lng/
// species/kind/date/time/notes parsing and validation. personDisplay stays
// in each route — its default behavior genuinely differs (session-derived
// on create, always-explicit on update, since the edit form is always
// pre-filled with a real value).
async function parseCommonFields(body: SightingBodyCommon, fieldErrors: Record<string, string>) {
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

  const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null

  return { lat, lng, species, customSpeciesInput, kind, observedDate, observedTime, notes }
}

export default async function sightingsRoutes(app: FastifyInstance) {
  // Not an explicit RII-22 acceptance criterion, but required by one: the
  // species-picker buttons have to read their options from somewhere other
  // than a hardcoded duplicate of RII-20's seed data.
  app.get('/species', async () => {
    const species = await prisma.species.findMany({ orderBy: { nameFi: 'asc' } })
    return { species }
  })

  // RII-43: login required; you see what you created plus everything in
  // your parties (docs/SPEC.md §9 rules 1 and 3).
  app.get('/sightings', async (request, reply) => {
    const user = await requireUser(request, reply)
    if (!user) return reply

    const sightings = await prisma.sighting.findMany({
      where: sightingsVisibleTo(user.id),
      include: SIGHTING_INCLUDE,
      orderBy: { createdAt: 'desc' },
    })
    return { sightings: sightings.map(toPublicSighting) }
  })

  app.post('/sightings', async (request, reply) => {
    const user = await requireUser(request, reply)
    if (!user) return reply

    const body = request.body as SightingBodyCommon
    const fieldErrors: Record<string, string> = {}

    const { lat, lng, species, customSpeciesInput, kind, observedDate, observedTime, notes } =
      await parseCommonFields(body, fieldErrors)
    const party = await resolvePartyId(body.partyId, user.id)
    if (!party.ok) fieldErrors.partyId = 'Not one of your parties.'

    if (Object.keys(fieldErrors).length > 0) {
      return reply.status(400).send({ error: 'invalid_input', fieldErrors })
    }

    const personDisplay =
      typeof body.personDisplay === 'string' && body.personDisplay.trim() ? body.personDisplay.trim() : user.displayName

    const sighting = await prisma.sighting.create({
      data: {
        // lat/lng validated non-null above; fieldErrors check would have
        // returned already if either were null.
        lat: lat as number,
        lng: lng as number,
        speciesId: species?.id,
        customSpecies: species ? null : customSpeciesInput,
        kind,
        notes,
        personDisplay,
        createdByUserId: user.id,
        // Not given = private (rule 2).
        partyId: party.ok ? (party.partyId ?? null) : null,
        observedDate,
        observedTime,
      },
      include: SIGHTING_INCLUDE,
    })

    return reply.status(201).send({ sighting: toPublicSighting(sighting) })
  })

  // RII-23/RII-34. The edit form always sends every field together (not a
  // sparse diff), so despite the verb this behaves like a full replace of
  // the editable fields rather than true partial-update semantics —
  // simpler than reconciling "field omitted" vs "field cleared" for little
  // benefit, since there's only ever one caller (the edit form) and it
  // always has the full current state to send back. lat/lng included since
  // RII-34 — the edit form always sends the sighting's current position
  // (moved or not; see SightingDetailPopup's local lat/lng state).
  // Exception (RII-43): partyId omitted = unchanged, since the edit form
  // doesn't send it until the party picker (RII-46).
  app.patch('/sightings/:id', async (request, reply) => {
    const user = await requireUser(request, reply)
    if (!user) return reply
    const { id } = request.params as { id: string }
    if (!(await checkCanModify(id, user, reply))) return reply

    const body = request.body as SightingBodyCommon
    const fieldErrors: Record<string, string> = {}

    const { lat, lng, species, customSpeciesInput, kind, observedDate, observedTime, notes } =
      await parseCommonFields(body, fieldErrors)
    const party = await resolvePartyId(body.partyId, user.id)
    if (!party.ok) fieldErrors.partyId = 'Not one of your parties.'

    if (Object.keys(fieldErrors).length > 0) {
      return reply.status(400).send({ error: 'invalid_input', fieldErrors })
    }

    // Unlike create, no session-derived default: the edit form is always
    // pre-filled with the sighting's current personDisplay, so it always
    // has a real value to send.
    const personDisplay = typeof body.personDisplay === 'string' && body.personDisplay.trim() ? body.personDisplay.trim() : 'unknown'

    try {
      const sighting = await prisma.sighting.update({
        where: { id },
        data: {
          // lat/lng validated non-null above; fieldErrors check would have
          // returned already if either were null.
          lat: lat as number,
          lng: lng as number,
          speciesId: species?.id ?? null,
          customSpecies: species ? null : customSpeciesInput,
          kind,
          notes,
          personDisplay,
          observedDate,
          observedTime: observedTime ?? null,
          // undefined leaves it unchanged.
          partyId: party.ok ? party.partyId : undefined,
        },
        include: SIGHTING_INCLUDE,
      })
      return reply.send({ sighting: toPublicSighting(sighting) })
    } catch (err) {
      // Deleted between the permission check and the update.
      if (isRecordNotFound(err)) return notFound(reply)
      throw err
    }
  })

  // RII-43: creator only (docs/SPEC.md §9 rule 4).
  app.delete('/sightings/:id', async (request, reply) => {
    const user = await requireUser(request, reply)
    if (!user) return reply
    const { id } = request.params as { id: string }
    if (!(await checkCanModify(id, user, reply))) return reply

    try {
      await prisma.sighting.delete({ where: { id } })
    } catch (err) {
      if (isRecordNotFound(err)) return notFound(reply)
      throw err
    }
    return reply.status(204).send()
  })
}

function notFound(reply: FastifyReply) {
  return reply.status(404).send({ error: 'not_found', message: 'That marking no longer exists.' })
}

// Rule 4: only the creator edits or deletes. A sighting the user can't even
// see answers 404 like a missing one, so its existence isn't revealed; one
// they can see (via a party) but didn't create answers 403. Sends the
// response and returns false when the user may not proceed.
async function checkCanModify(id: string, user: User, reply: FastifyReply): Promise<boolean> {
  const sighting = await prisma.sighting
    .findFirst({ where: { AND: [{ id }, sightingsVisibleTo(user.id)] }, select: { createdByUserId: true } })
    // A malformed id can't match any row.
    .catch(() => null)
  if (!sighting) {
    await notFound(reply)
    return false
  }
  if (sighting.createdByUserId !== user.id) {
    await reply.status(403).send({ error: 'forbidden', message: 'Only the creator can change this marking.' })
    return false
  }
  return true
}
