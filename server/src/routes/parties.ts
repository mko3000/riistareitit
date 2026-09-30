import { randomBytes } from 'node:crypto'
import type { FastifyInstance, FastifyReply } from 'fastify'
import { Prisma, type User } from '@prisma/client'
import { prisma } from '../prisma.js'
import { requireUser } from '../visibility.js'

// RII-44: hunting party management. Rules: docs/SPEC.md §9 "Parties" and
// "Party API". A party you're not a member of answers 404 everywhere, so its
// existence isn't revealed.

const MAX_NAME_LENGTH = 100
const ROLES = new Set(['admin', 'member'])

type Tx = Prisma.TransactionClient

// 16 random bytes, base64url: 22 URL-safe characters, ~128 bits — not guessable.
function newInviteCode(): string {
  return randomBytes(16).toString('base64url')
}

function parseName(value: unknown): string | null {
  const name = typeof value === 'string' ? value.trim() : ''
  return name && name.length <= MAX_NAME_LENGTH ? name : null
}

// Membership changes (leave/remove, role change) run in a transaction that
// first locks the party's row (SELECT … FOR UPDATE). A second simultaneous
// change to the same party waits for the first to commit, then re-reads the
// committed members — so two admins leaving at once can't both pass the
// last-admin check, and the loser gets a clean 409. (Replaces serializable
// transactions + retry, which still leaked occasional 500s in CI on
// serialization errors Prisma didn't report as P2034.) Returns 'not_found'
// if the party doesn't exist (or the id is malformed).
async function withPartyLocked<T>(partyId: string, work: (tx: Tx) => Promise<T>): Promise<T | 'not_found'> {
  return prisma.$transaction(async (tx) => {
    const locked = await tx
      .$queryRaw<Array<{ id: string }>>`SELECT id FROM hunting_parties WHERE id = ${partyId}::uuid FOR UPDATE`
      // A malformed id can't be a party.
      .catch(() => [])
    if (locked.length === 0) return 'not_found' as const
    return work(tx)
  })
}

function notFound(reply: FastifyReply) {
  return reply.status(404).send({ error: 'not_found', message: 'Party not found.' })
}

function forbidden(reply: FastifyReply) {
  return reply.status(403).send({ error: 'forbidden', message: 'Only a party admin can do that.' })
}

function lastAdmin(reply: FastifyReply) {
  return reply
    .status(409)
    .send({ error: 'last_admin', message: 'The last admin must make someone else admin first.' })
}

async function membershipOf(partyId: string, userId: string, db: Tx | typeof prisma = prisma) {
  // A malformed id can't be a party of theirs.
  return db.huntingPartyMember.findUnique({ where: { partyId_userId: { partyId, userId } } }).catch(() => null)
}

async function partySummary(partyId: string, userId: string) {
  const party = await prisma.huntingParty.findUniqueOrThrow({
    where: { id: partyId },
    include: { _count: { select: { members: true } }, members: { where: { userId }, select: { role: true } } },
  })
  return { id: party.id, name: party.name, myRole: party.members[0]?.role ?? null, memberCount: party._count.members }
}

async function partyDetail(partyId: string, user: User) {
  const party = await prisma.huntingParty.findUniqueOrThrow({
    where: { id: partyId },
    include: { members: { include: { user: { select: { displayName: true } } } } },
  })
  const myRole = party.members.find((member) => member.userId === user.id)?.role ?? null
  const members = party.members
    .map((member) => ({
      userId: member.userId,
      displayName: member.user.displayName,
      role: member.role,
      joinedAt: member.joinedAt,
    }))
    .sort((a, b) => (a.role === b.role ? a.displayName.localeCompare(b.displayName, 'fi') : a.role === 'admin' ? -1 : 1))
  return {
    id: party.id,
    name: party.name,
    myRole,
    // Only admins see the code — it's what lets people in.
    inviteCode: myRole === 'admin' ? party.inviteCode : null,
    members,
  }
}

export default async function partiesRoutes(app: FastifyInstance) {
  app.get('/parties', async (request, reply) => {
    const user = await requireUser(request, reply)
    if (!user) return reply

    const memberships = await prisma.huntingPartyMember.findMany({
      where: { userId: user.id },
      include: { party: { include: { _count: { select: { members: true } } } } },
    })
    const parties = memberships
      .map((m) => ({ id: m.party.id, name: m.party.name, myRole: m.role, memberCount: m.party._count.members }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fi'))
    return { parties }
  })

  app.post('/parties', async (request, reply) => {
    const user = await requireUser(request, reply)
    if (!user) return reply

    const name = parseName((request.body as { name?: unknown } | undefined)?.name)
    if (!name) return reply.status(400).send({ error: 'invalid_input', message: 'Name must be 1-100 characters.' })

    const party = await prisma.huntingParty.create({
      data: {
        name,
        createdById: user.id,
        inviteCode: newInviteCode(),
        members: { create: { userId: user.id, role: 'admin' } },
      },
    })
    return reply.status(201).send({ party: await partyDetail(party.id, user) })
  })

  app.get('/parties/:id', async (request, reply) => {
    const user = await requireUser(request, reply)
    if (!user) return reply
    const { id } = request.params as { id: string }
    if (!(await membershipOf(id, user.id))) return notFound(reply)

    return { party: await partyDetail(id, user) }
  })

  app.patch('/parties/:id', async (request, reply) => {
    const user = await requireUser(request, reply)
    if (!user) return reply
    const { id } = request.params as { id: string }
    const membership = await membershipOf(id, user.id)
    if (!membership) return notFound(reply)
    if (membership.role !== 'admin') return forbidden(reply)

    const name = parseName((request.body as { name?: unknown } | undefined)?.name)
    if (!name) return reply.status(400).send({ error: 'invalid_input', message: 'Name must be 1-100 characters.' })

    await prisma.huntingParty.update({ where: { id }, data: { name } })
    return { party: await partyDetail(id, user) }
  })

  // Rule 6: the party's sightings and tracks aren't deleted — their partyId
  // becomes null (ON DELETE SET NULL), making them private to their creators.
  app.delete('/parties/:id', async (request, reply) => {
    const user = await requireUser(request, reply)
    if (!user) return reply
    const { id } = request.params as { id: string }
    const membership = await membershipOf(id, user.id)
    if (!membership) return notFound(reply)
    if (membership.role !== 'admin') return forbidden(reply)

    await prisma.huntingParty.delete({ where: { id } })
    return reply.status(204).send()
  })

  app.post('/parties/:id/invite-code', async (request, reply) => {
    const user = await requireUser(request, reply)
    if (!user) return reply
    const { id } = request.params as { id: string }
    const membership = await membershipOf(id, user.id)
    if (!membership) return notFound(reply)
    if (membership.role !== 'admin') return forbidden(reply)

    const party = await prisma.huntingParty.update({ where: { id }, data: { inviteCode: newInviteCode() } })
    return { inviteCode: party.inviteCode }
  })

  app.delete('/parties/:id/invite-code', async (request, reply) => {
    const user = await requireUser(request, reply)
    if (!user) return reply
    const { id } = request.params as { id: string }
    const membership = await membershipOf(id, user.id)
    if (!membership) return notFound(reply)
    if (membership.role !== 'admin') return forbidden(reply)

    await prisma.huntingParty.update({ where: { id }, data: { inviteCode: null } })
    return reply.status(204).send()
  })

  app.get('/invites/:code', async (request, reply) => {
    const user = await requireUser(request, reply)
    if (!user) return reply
    const { code } = request.params as { code: string }

    const party = await prisma.huntingParty.findUnique({
      where: { inviteCode: code },
      include: { _count: { select: { members: true } }, members: { where: { userId: user.id }, select: { userId: true } } },
    })
    if (!party) return reply.status(404).send({ error: 'not_found', message: 'Invite link is invalid or disabled.' })

    return {
      invite: {
        partyId: party.id,
        partyName: party.name,
        memberCount: party._count.members,
        alreadyMember: party.members.length > 0,
      },
    }
  })

  // Idempotent: already a member → same answer, role unchanged.
  app.post('/invites/:code/join', async (request, reply) => {
    const user = await requireUser(request, reply)
    if (!user) return reply
    const { code } = request.params as { code: string }

    const party = await prisma.huntingParty.findUnique({ where: { inviteCode: code }, select: { id: true } })
    if (!party) return reply.status(404).send({ error: 'not_found', message: 'Invite link is invalid or disabled.' })

    await prisma.huntingPartyMember.upsert({
      where: { partyId_userId: { partyId: party.id, userId: user.id } },
      create: { partyId: party.id, userId: user.id, role: 'member' },
      update: {},
    })
    return { party: await partySummary(party.id, user.id) }
  })

  // An admin removes anyone; anyone removes themselves (= leave).
  app.delete('/parties/:id/members/:userId', async (request, reply) => {
    const user = await requireUser(request, reply)
    if (!user) return reply
    const { id, userId } = request.params as { id: string; userId: string }

    const outcome = await withPartyLocked(id, async (tx) => {
      const mine = await membershipOf(id, user.id, tx)
      if (!mine) return 'not_found' as const
      const isSelf = userId === user.id
      if (!isSelf && mine.role !== 'admin') return 'forbidden' as const

      const target = isSelf ? mine : await membershipOf(id, userId, tx)
      if (!target) return 'not_found' as const

      const members = await tx.huntingPartyMember.findMany({ where: { partyId: id }, select: { role: true } })
      if (members.length === 1) {
        // The last member leaving deletes the party (rule 6: its items go private).
        await tx.huntingParty.delete({ where: { id } })
        return 'ok' as const
      }
      const admins = members.filter((m) => m.role === 'admin').length
      if (target.role === 'admin' && admins === 1) return 'last_admin' as const

      await tx.huntingPartyMember.delete({ where: { partyId_userId: { partyId: id, userId } } })
      return 'ok' as const
    })

    if (outcome === 'not_found') return notFound(reply)
    if (outcome === 'forbidden') return forbidden(reply)
    if (outcome === 'last_admin') return lastAdmin(reply)
    return reply.status(204).send()
  })

  app.patch('/parties/:id/members/:userId', async (request, reply) => {
    const user = await requireUser(request, reply)
    if (!user) return reply
    const { id, userId } = request.params as { id: string; userId: string }
    const role = (request.body as { role?: unknown } | undefined)?.role
    if (typeof role !== 'string' || !ROLES.has(role)) {
      return reply.status(400).send({ error: 'invalid_input', message: "Role must be 'admin' or 'member'." })
    }

    const outcome = await withPartyLocked(id, async (tx) => {
      const mine = await membershipOf(id, user.id, tx)
      if (!mine) return 'not_found' as const
      if (mine.role !== 'admin') return 'forbidden' as const

      const target = await membershipOf(id, userId, tx)
      if (!target) return 'not_found' as const
      if (target.role === 'admin' && role === 'member') {
        const admins = await tx.huntingPartyMember.count({ where: { partyId: id, role: 'admin' } })
        if (admins === 1) return 'last_admin' as const
      }

      await tx.huntingPartyMember.update({ where: { partyId_userId: { partyId: id, userId } }, data: { role } })
      return 'ok' as const
    })

    if (outcome === 'not_found') return notFound(reply)
    if (outcome === 'forbidden') return forbidden(reply)
    if (outcome === 'last_admin') return lastAdmin(reply)
    return { party: await partyDetail(id, user) }
  })
}
