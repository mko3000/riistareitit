import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSighting, createTrack, deleteTrack, login, signUp } from './api'

// RII-7: the UI shows Finnish text chosen by error code — never the
// server's own (English) `message`.
function respondWith(status: number, body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

const SIGHTING = {
  lat: 60,
  lng: 25,
  kind: 'sighting' as const,
  speciesKey: 'capercaillie',
  personDisplay: 'Miko',
  observedDate: '2026-09-26',
}

describe('API error localization', () => {
  it('maps sign-up field errors to Finnish per field', async () => {
    respondWith(400, {
      error: 'invalid_input',
      fieldErrors: { email: 'Enter a valid email address.', password: 'Password must be at least 8 characters.' },
    })
    expect(await signUp({ email: 'x', displayName: 'M', password: '1' })).toEqual({
      ok: false,
      message: 'Korjaa alla olevat virheet.',
      fieldErrors: {
        email: 'Anna kelvollinen sähköpostiosoite.',
        password: 'Salasanassa on oltava vähintään 8 merkkiä.',
      },
    })
  })

  it('maps login and sign-up error codes', async () => {
    respondWith(401, { error: 'invalid_credentials', message: 'Incorrect email or password.' })
    expect(await login({ email: 'a@b.fi', password: 'x' })).toEqual({ ok: false, message: 'Väärä sähköposti tai salasana.' })

    respondWith(409, { error: 'email_taken', message: 'An account with this email already exists.' })
    expect(await signUp({ email: 'a@b.fi', displayName: 'M', password: '12345678' })).toEqual({
      ok: false,
      message: 'Tällä sähköpostiosoitteella on jo tili.',
    })
  })

  it('falls back to a generic Finnish message for unknown errors, never the server text', async () => {
    respondWith(500, { error: 'internal_error', message: 'Something went wrong. Please try again.' })
    expect(await login({ email: 'a@b.fi', password: 'x' })).toEqual({
      ok: false,
      message: 'Jokin meni vikaan. Yritä uudelleen.',
    })
  })

  it('maps sighting field errors and ignores unknown fields', async () => {
    respondWith(400, { error: 'invalid_input', fieldErrors: { species: 'Unknown species.', bogus: 'x' } })
    expect(await createSighting(SIGHTING)).toEqual({
      ok: false,
      message: 'Korjaa alla olevat virheet.',
      fieldErrors: { species: 'Valitse laji tai kirjoita se.' },
    })
  })

  it('maps track errors, including an oversized track', async () => {
    const track = { name: 'x', sourceFormat: 'gpx' as const, segments: [[{ lat: 60, lng: 25 }]] }
    respondWith(400, { error: 'too_many_points', message: 'Track has more than 200000 points.' })
    expect(await createTrack(track)).toEqual({ ok: false, message: 'Reitti on liian suuri tallennettavaksi.' })

    respondWith(413, { error: 'Payload Too Large' })
    expect(await createTrack(track)).toEqual({ ok: false, message: 'Reitti on liian suuri tallennettavaksi.' })

    respondWith(403, { error: 'forbidden', message: 'Only the track owner can delete it.' })
    expect(await deleteTrack('id')).toEqual({ ok: false, message: 'Voit poistaa vain omia reittejäsi.' })
  })

  it('reports an unreachable server in Finnish', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))
    expect(await deleteTrack('id')).toEqual({ ok: false, message: 'Palvelimeen ei saatu yhteyttä.' })
  })
})
