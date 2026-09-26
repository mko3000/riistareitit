import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '../src/prisma.js'
import { createTestApp, resetDatabase, signUpUser, type TestUser } from './helpers.js'

let app: FastifyInstance
let owner: TestUser

beforeAll(async () => {
  app = await createTestApp()
})
afterAll(async () => {
  await app.close()
})
beforeEach(async () => {
  await resetDatabase()
  owner = await signUpUser(app, 'Miko')
})

// Synthetic points: one segment with elevation + time, one with neither.
const VALID_TRACK = {
  name: 'Aamulenkki',
  sourceFormat: 'gpx',
  recordedDate: '2026-09-20',
  segments: [
    [
      { lat: 61.5, lng: 23.75, elevationM: 120.5, recordedAt: '2026-09-20T05:00:00.123Z' },
      { lat: 61.5001, lng: 23.7502, elevationM: 121 },
    ],
    [{ lat: 61.51, lng: 23.76 }],
  ],
}

function postTrack(payload: unknown, cookie?: string) {
  return app.inject({ method: 'POST', url: '/tracks', payload: payload as object, headers: cookie ? { cookie } : {} })
}

describe('login is required', () => {
  it.each([
    ['GET', '/tracks'],
    ['POST', '/tracks'],
    ['DELETE', '/tracks/00000000-0000-0000-0000-000000000000'],
  ] as const)('%s %s returns 401 when logged out', async (method, url) => {
    const response = await app.inject({ method, url, payload: method === 'POST' ? VALID_TRACK : undefined })
    expect(response.statusCode).toBe(401)
    expect(response.json().error).toBe('not_logged_in')
  })
})

describe('POST /tracks', () => {
  it('stores the track owned by the session user and returns compact segments', async () => {
    const response = await postTrack(VALID_TRACK, owner.cookie)

    expect(response.statusCode).toBe(201)
    expect(response.json().track).toMatchObject({
      name: 'Aamulenkki',
      sourceFormat: 'gpx',
      recordedDate: '2026-09-20',
      owner: { id: owner.id, displayName: 'Miko' },
      segments: [
        [
          [61.5, 23.75],
          [61.5001, 23.7502],
        ],
        [[61.51, 23.76]],
      ],
    })
  })

  it('keeps elevation and time in storage, trailing nulls trimmed (SPEC §4)', async () => {
    const { id } = (await postTrack(VALID_TRACK, owner.cookie)).json().track
    const stored = await prisma.track.findUniqueOrThrow({ where: { id } })

    expect(stored.ownerUserId).toBe(owner.id)
    expect(stored.segments).toEqual([
      [
        [61.5, 23.75, 120.5, Date.parse('2026-09-20T05:00:00.123Z')],
        [61.5001, 23.7502, 121],
      ],
      [[61.51, 23.76]],
    ])
  })

  it.each([
    ['missing name', { ...VALID_TRACK, name: '  ' }],
    ['unknown format', { ...VALID_TRACK, sourceFormat: 'exe' }],
    ['bad date', { ...VALID_TRACK, recordedDate: '20.9.2026' }],
    ['no segments', { ...VALID_TRACK, segments: [] }],
    ['empty segment', { ...VALID_TRACK, segments: [[]] }],
    ['latitude out of range', { ...VALID_TRACK, segments: [[{ lat: 91, lng: 23 }]] }],
    ['non-numeric elevation', { ...VALID_TRACK, segments: [[{ lat: 61, lng: 23, elevationM: 'korkea' }]] }],
    ['unparseable time', { ...VALID_TRACK, segments: [[{ lat: 61, lng: 23, recordedAt: 'eilen' }]] }],
  ])('rejects %s with invalid_input', async (_case, payload) => {
    const response = await postTrack(payload, owner.cookie)
    expect(response.statusCode).toBe(400)
    expect(response.json().error).toBe('invalid_input')
    expect(await prisma.track.count()).toBe(0)
  })

  it('rejects more than 200,000 points with too_many_points', async () => {
    const points = Array.from({ length: 200_001 }, (_, i) => ({ lat: 60 + i * 1e-6, lng: 25 }))
    const response = await postTrack({ ...VALID_TRACK, segments: [points] }, owner.cookie)

    expect(response.statusCode).toBe(400)
    expect(response.json().error).toBe('too_many_points')
  })
})

describe('GET /tracks', () => {
  it("shows every user's tracks, newest recorded date first", async () => {
    const other = await signUpUser(app, 'Toinen')
    await postTrack({ ...VALID_TRACK, name: 'Vanha', recordedDate: '2026-08-01' }, owner.cookie)
    await postTrack({ ...VALID_TRACK, name: 'Uusi', recordedDate: '2026-09-25' }, other.cookie)
    await postTrack({ ...VALID_TRACK, name: 'Ei päivää', recordedDate: undefined }, owner.cookie)

    const response = await app.inject({ method: 'GET', url: '/tracks', headers: { cookie: owner.cookie } })
    expect(response.json().tracks.map((t: { name: string }) => t.name)).toEqual(['Uusi', 'Vanha', 'Ei päivää'])
  })
})

describe('DELETE /tracks/:id', () => {
  it('lets the owner delete their track', async () => {
    const { id } = (await postTrack(VALID_TRACK, owner.cookie)).json().track

    const response = await app.inject({ method: 'DELETE', url: `/tracks/${id}`, headers: { cookie: owner.cookie } })
    expect(response.statusCode).toBe(204)
    expect(await prisma.track.count()).toBe(0)
  })

  it("forbids deleting someone else's track", async () => {
    const { id } = (await postTrack(VALID_TRACK, owner.cookie)).json().track
    const other = await signUpUser(app, 'Toinen')

    const response = await app.inject({ method: 'DELETE', url: `/tracks/${id}`, headers: { cookie: other.cookie } })
    expect(response.statusCode).toBe(403)
    expect(response.json().error).toBe('forbidden')
    expect(await prisma.track.count()).toBe(1)
  })

  it('returns 404 for a missing track or a malformed id', async () => {
    for (const id of ['00000000-0000-0000-0000-000000000000', 'not-a-uuid']) {
      const response = await app.inject({ method: 'DELETE', url: `/tracks/${id}`, headers: { cookie: owner.cookie } })
      expect(response.statusCode).toBe(404)
    }
  })
})
