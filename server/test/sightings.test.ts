import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestApp, resetDatabase, signUpUser } from './helpers.js'

let app: FastifyInstance

beforeAll(async () => {
  app = await createTestApp()
})
afterAll(async () => {
  await app.close()
})
beforeEach(resetDatabase)

const VALID_SIGHTING = {
  lat: 61.5,
  lng: 23.75,
  speciesKey: 'capercaillie',
  kind: 'sighting',
  personDisplay: 'Miko',
  observedDate: '2026-09-20',
  observedTime: '07:30',
  notes: '  Kaksi kukkoa  ',
}

function createSighting(payload: Record<string, unknown>, cookie?: string) {
  return app.inject({ method: 'POST', url: '/sightings', payload, headers: cookie ? { cookie } : {} })
}

describe('GET /species', () => {
  it('lists the seeded preset species', async () => {
    const response = await app.inject({ method: 'GET', url: '/species' })
    const keys = response.json().species.map((s: { key: string }) => s.key).sort()
    expect(keys).toEqual(['black-grouse', 'capercaillie', 'hazel-grouse', 'willow-ptarmigan'])
  })
})

describe('POST /sightings', () => {
  it('creates a sighting with a preset species and returns it in the public shape', async () => {
    const response = await createSighting(VALID_SIGHTING)

    expect(response.statusCode).toBe(201)
    expect(response.json().sighting).toMatchObject({
      lat: 61.5,
      lng: 23.75,
      species: { key: 'capercaillie', nameFi: 'Metso', icon: 'capercaillie' },
      customSpecies: null,
      kind: 'sighting',
      notes: 'Kaksi kukkoa',
      personDisplay: 'Miko',
      observedDate: '2026-09-20',
      observedTime: '07:30',
    })
  })

  it('accepts a custom species instead of a preset', async () => {
    const response = await createSighting({ ...VALID_SIGHTING, speciesKey: undefined, customSpecies: 'Fasaani' })
    expect(response.statusCode).toBe(201)
    expect(response.json().sighting).toMatchObject({ species: null, customSpecies: 'Fasaani' })
  })

  it("defaults personDisplay to the logged-in user's name, else 'unknown'", async () => {
    const user = await signUpUser(app, 'Miko')
    const loggedIn = await createSighting({ ...VALID_SIGHTING, personDisplay: undefined }, user.cookie)
    expect(loggedIn.json().sighting.personDisplay).toBe('Miko')

    const anonymous = await createSighting({ ...VALID_SIGHTING, personDisplay: undefined })
    expect(anonymous.json().sighting.personDisplay).toBe('unknown')
  })

  it('returns per-field errors for invalid input', async () => {
    const response = await createSighting({
      lat: 91,
      lng: 'itään',
      speciesKey: 'dodo',
      kind: 'rumor',
      observedDate: 'eilen',
      observedTime: '25:00',
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().error).toBe('invalid_input')
    expect(Object.keys(response.json().fieldErrors).sort()).toEqual([
      'kind',
      'lat',
      'lng',
      'observedDate',
      'observedTime',
      'species',
    ])
  })

  it('requires a species or a custom species', async () => {
    const response = await createSighting({ ...VALID_SIGHTING, speciesKey: undefined })
    expect(response.statusCode).toBe(400)
    expect(Object.keys(response.json().fieldErrors)).toEqual(['species'])
  })
})

describe('GET /sightings', () => {
  it('lists every sighting, newest first', async () => {
    await createSighting(VALID_SIGHTING)
    await createSighting({ ...VALID_SIGHTING, kind: 'kill' })

    const response = await app.inject({ method: 'GET', url: '/sightings' })
    expect(response.json().sightings.map((s: { kind: string }) => s.kind)).toEqual(['kill', 'sighting'])
  })
})

describe('PATCH /sightings/:id', () => {
  it('replaces the editable fields, including a moved location', async () => {
    const created = (await createSighting(VALID_SIGHTING)).json().sighting

    const response = await app.inject({
      method: 'PATCH',
      url: `/sightings/${created.id}`,
      payload: { ...VALID_SIGHTING, lat: 62, lng: 24, kind: 'kill', speciesKey: 'hazel-grouse', observedTime: undefined },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().sighting).toMatchObject({
      id: created.id,
      lat: 62,
      lng: 24,
      kind: 'kill',
      species: { key: 'hazel-grouse' },
      observedTime: null,
    })
  })

  it('returns 404 for a sighting that no longer exists', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/sightings/00000000-0000-0000-0000-000000000000',
      payload: VALID_SIGHTING,
    })
    expect(response.statusCode).toBe(404)
    expect(response.json().error).toBe('not_found')
  })

  it('validates like create', async () => {
    const created = (await createSighting(VALID_SIGHTING)).json().sighting
    const response = await app.inject({
      method: 'PATCH',
      url: `/sightings/${created.id}`,
      payload: { ...VALID_SIGHTING, lat: -100 },
    })
    expect(response.statusCode).toBe(400)
    expect(Object.keys(response.json().fieldErrors)).toEqual(['lat'])
  })
})

describe('DELETE /sightings/:id', () => {
  it('deletes the sighting, then 404s on a repeat', async () => {
    const created = (await createSighting(VALID_SIGHTING)).json().sighting

    const first = await app.inject({ method: 'DELETE', url: `/sightings/${created.id}` })
    expect(first.statusCode).toBe(204)

    const second = await app.inject({ method: 'DELETE', url: `/sightings/${created.id}` })
    expect(second.statusCode).toBe(404)

    const list = await app.inject({ method: 'GET', url: '/sightings' })
    expect(list.json().sightings).toEqual([])
  })
})
