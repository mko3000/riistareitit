import type { FastifyInstance } from 'fastify'
import { Prisma } from '@prisma/client'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '../src/prisma.js'
import { createTestApp, resetDatabase, signUpUser, type TestUser } from './helpers.js'

// RII-42: database-level rules of the hunting party tables (design:
// docs/SPEC.md §9). No routes use these tables yet — RII-43/RII-44 add them.

let app: FastifyInstance
let alice: TestUser
let bob: TestUser

beforeAll(async () => {
  app = await createTestApp()
})
afterAll(async () => {
  await app.close()
})
beforeEach(async () => {
  await resetDatabase()
  alice = await signUpUser(app, 'Alice')
  bob = await signUpUser(app, 'Bob')
})

async function createParty(name = 'Porukka') {
  return prisma.huntingParty.create({
    data: {
      name,
      createdById: alice.id,
      members: {
        create: [
          { userId: alice.id, role: 'admin' },
          { userId: bob.id, role: 'member' },
        ],
      },
    },
  })
}

async function createSighting(partyId: string | null) {
  return prisma.sighting.create({
    data: { lat: 61, lng: 24, customSpecies: 'Metso', observedDate: new Date('2026-09-20'), createdByUserId: alice.id, partyId },
  })
}

async function createTrack(partyId: string | null) {
  return prisma.track.create({
    data: { name: 'Lenkki', sourceFormat: 'gpx', ownerUserId: alice.id, segments: [[[61, 24]]], partyId },
  })
}

describe('hunting party tables', () => {
  it('existing-style items default to no party (private)', async () => {
    const sighting = await prisma.sighting.create({
      data: { lat: 61, lng: 24, customSpecies: 'Metso', observedDate: new Date('2026-09-20') },
    })
    expect(sighting.partyId).toBeNull()
  })

  it('deleting a party keeps its sightings and tracks but makes them private', async () => {
    const party = await createParty()
    const sighting = await createSighting(party.id)
    const track = await createTrack(party.id)

    await prisma.huntingParty.delete({ where: { id: party.id } })

    expect((await prisma.sighting.findUniqueOrThrow({ where: { id: sighting.id } })).partyId).toBeNull()
    expect((await prisma.track.findUniqueOrThrow({ where: { id: track.id } })).partyId).toBeNull()
    expect(await prisma.huntingPartyMember.count()).toBe(0)
  })

  it('removing a member keeps the items they shared with the party', async () => {
    const party = await createParty()
    const sighting = await createSighting(party.id)

    await prisma.huntingPartyMember.delete({ where: { partyId_userId: { partyId: party.id, userId: alice.id } } })

    expect((await prisma.sighting.findUniqueOrThrow({ where: { id: sighting.id } })).partyId).toBe(party.id)
  })

  it("deleting a user removes their memberships but not the party they created", async () => {
    const party = await createParty()
    await prisma.user.delete({ where: { id: alice.id } })

    const survivor = await prisma.huntingParty.findUniqueOrThrow({ where: { id: party.id }, include: { members: true } })
    expect(survivor.createdById).toBeNull()
    expect(survivor.members.map((m) => m.userId)).toEqual([bob.id])
  })

  it("rejects a role other than 'admin' or 'member'", async () => {
    const party = await prisma.huntingParty.create({ data: { name: 'Porukka' } })
    await expect(
      prisma.huntingPartyMember.create({ data: { partyId: party.id, userId: alice.id, role: 'owner' } }),
    ).rejects.toThrow(/hunting_party_members_role_check/)
  })

  it('allows a user in several parties but only once per party', async () => {
    const first = await createParty('Eka')
    const second = await prisma.huntingParty.create({
      data: { name: 'Toka', members: { create: { userId: alice.id, role: 'member' } } },
    })
    expect(await prisma.huntingPartyMember.count({ where: { userId: alice.id } })).toBe(2)

    await expect(
      prisma.huntingPartyMember.create({ data: { partyId: first.id, userId: alice.id } }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError)
    expect(second.id).not.toBe(first.id)
  })

  it('keeps invite codes unique, while any number of parties can have none', async () => {
    await prisma.huntingParty.create({ data: { name: 'A', inviteCode: 'sama-koodi' } })
    await expect(prisma.huntingParty.create({ data: { name: 'B', inviteCode: 'sama-koodi' } })).rejects.toThrow()
    await prisma.huntingParty.createMany({ data: [{ name: 'C' }, { name: 'D' }] })
    expect(await prisma.huntingParty.count({ where: { inviteCode: null } })).toBe(2)
  })
})
