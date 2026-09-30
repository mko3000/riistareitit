import type { FastifyReply, FastifyRequest } from 'fastify'
import type { Prisma, User } from '@prisma/client'
import { prisma } from './prisma.js'
import { getSessionUser } from './session.js'

// RII-43: the visibility rules from docs/SPEC.md §9 ("Visibility and hunting
// parties"), shared by the sightings and tracks routes. Enforced in the
// database queries — never only in the UI.

// Rule 1: login required. Sends 401 and returns null when logged out.
export async function requireUser(request: FastifyRequest, reply: FastifyReply): Promise<User | null> {
  const user = await getSessionUser(request)
  if (!user) {
    await reply.status(401).send({ error: 'not_logged_in', message: 'Log in to see and add sightings and tracks.' })
    return null
  }
  return user
}

// Rule 3: you see what you created plus everything in the parties you're a
// member of.
export function sightingsVisibleTo(userId: string): Prisma.SightingWhereInput {
  return { OR: [{ createdByUserId: userId }, { party: { members: { some: { userId } } } }] }
}

export function tracksVisibleTo(userId: string): Prisma.TrackWhereInput {
  return { OR: [{ ownerUserId: userId }, { party: { members: { some: { userId } } } }] }
}

// Rule 2: an item's partyId must be one of the creator's parties, or null
// (private). `undefined` means "not given" — callers decide what that means
// (private on create, unchanged on edit).
export type PartyIdResult = { ok: true; partyId: string | null | undefined } | { ok: false }

export async function resolvePartyId(value: unknown, userId: string): Promise<PartyIdResult> {
  if (value === undefined) return { ok: true, partyId: undefined }
  if (value === null) return { ok: true, partyId: null }
  if (typeof value !== 'string') return { ok: false }
  const membership = await prisma.huntingPartyMember
    .findUnique({ where: { partyId_userId: { partyId: value, userId } } })
    // A malformed id can't be a party of theirs.
    .catch(() => null)
  return membership ? { ok: true, partyId: value } : { ok: false }
}
