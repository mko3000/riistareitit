import type { ImportedTrack, TrackSourceFormat } from './tracks/types'

const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001'

export interface PublicUser {
  id: string
  email: string
  displayName: string
  role: string
  createdAt: string
}

export type SignUpFieldErrors = Partial<Record<'email' | 'displayName' | 'password', string>>

export type AuthResult =
  | { ok: true; user: PublicUser }
  | { ok: false; message: string; fieldErrors?: SignUpFieldErrors }

async function postJson(path: string, body: unknown): Promise<AuthResult> {
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Required so the browser sends/stores the session cookie — without
      // this, sign-up/login "succeed" but you're not actually signed in.
      credentials: 'include',
      body: JSON.stringify(body),
    })
  } catch {
    return { ok: false, message: "Couldn't reach the server. Is it running?" }
  }

  const responseBody = await response.json().catch(() => null)

  if (!response.ok) {
    if (responseBody?.error === 'invalid_input') {
      return {
        ok: false,
        message: 'Please fix the errors below.',
        fieldErrors: responseBody.fieldErrors,
      }
    }
    return { ok: false, message: responseBody?.message ?? 'Something went wrong. Please try again.' }
  }

  return { ok: true, user: responseBody.user }
}

export function signUp(input: {
  email: string
  displayName: string
  password: string
}): Promise<AuthResult> {
  return postJson('/signup', input)
}

export function login(input: { email: string; password: string }): Promise<AuthResult> {
  return postJson('/login', input)
}

export async function logout(): Promise<void> {
  await fetch(`${API_BASE_URL}/logout`, { method: 'POST', credentials: 'include' })
}

// For checking logged-in state on load — resolves to null both when
// genuinely anonymous and when the server can't be reached, since either
// way there's no user to show.
export async function getMe(): Promise<PublicUser | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/me`, { credentials: 'include' })
    if (!response.ok) return null
    const body = await response.json()
    return body.user ?? null
  } catch {
    return null
  }
}

// RII-22

export interface Species {
  key: string
  nameFi: string
  nameEn: string | null
  icon: string
}

export interface PublicSighting {
  id: string
  lat: number
  lng: number
  species: { key: string; nameFi: string; icon: string } | null
  customSpecies: string | null
  kind: 'sighting' | 'kill'
  notes: string | null
  personDisplay: string
  observedDate: string // "YYYY-MM-DD"
  observedTime: string | null // "HH:MM"
  createdAt: string
  updatedAt: string
}

// Resolves to [] on failure rather than throwing — species/sightings not
// loading shouldn't crash the map, just leave it looking empty.
export async function getSpecies(): Promise<Species[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/species`, { credentials: 'include' })
    if (!response.ok) return []
    const body = await response.json()
    return body.species ?? []
  } catch {
    return []
  }
}

export async function getSightings(): Promise<PublicSighting[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/sightings`, { credentials: 'include' })
    if (!response.ok) return []
    const body = await response.json()
    return body.sightings ?? []
  } catch {
    return []
  }
}

export type SightingFieldErrors = Partial<
  Record<'lat' | 'lng' | 'species' | 'kind' | 'observedDate' | 'observedTime', string>
>

export type CreateSightingResult =
  | { ok: true; sighting: PublicSighting }
  | { ok: false; message: string; fieldErrors?: SightingFieldErrors }

async function sendSightingRequest(
  method: 'POST' | 'PATCH',
  path: string,
  input: unknown,
): Promise<CreateSightingResult> {
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(input),
    })
  } catch {
    return { ok: false, message: "Couldn't reach the server. Is it running?" }
  }

  const body = await response.json().catch(() => null)

  if (!response.ok) {
    if (body?.error === 'invalid_input') {
      return { ok: false, message: 'Please fix the errors below.', fieldErrors: body.fieldErrors }
    }
    return { ok: false, message: body?.message ?? 'Could not save. Please try again.' }
  }

  return { ok: true, sighting: body.sighting }
}

export function createSighting(input: {
  lat: number
  lng: number
  speciesKey?: string
  customSpecies?: string
  kind: 'sighting' | 'kill'
  notes?: string
  personDisplay: string
  observedDate: string
  observedTime?: string
}): Promise<CreateSightingResult> {
  return sendSightingRequest('POST', '/sightings', input)
}

export function updateSighting(
  id: string,
  input: {
    lat: number
    lng: number
    speciesKey?: string
    customSpecies?: string
    kind: 'sighting' | 'kill'
    notes?: string
    personDisplay: string
    observedDate: string
    observedTime?: string
  },
): Promise<CreateSightingResult> {
  return sendSightingRequest('PATCH', `/sightings/${id}`, input)
}

export async function deleteSighting(id: string): Promise<{ ok: true } | { ok: false; message: string }> {
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}/sightings/${id}`, { method: 'DELETE', credentials: 'include' })
  } catch {
    return { ok: false, message: "Couldn't reach the server. Is it running?" }
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    return { ok: false, message: body?.message ?? 'Could not delete. Please try again.' }
  }

  return { ok: true }
}

// RII-3. See docs/SPEC.md §5 "Tracks API". All routes require login.

export interface PublicTrack {
  id: string
  name: string
  sourceFormat: TrackSourceFormat
  recordedDate: string | null // "YYYY-MM-DD"
  importedAt: string
  owner: { id: string; displayName: string } | null
  segments: Array<Array<[number, number]>> // [lat, lng] pairs
}

// Resolves to [] on failure (including logged out), like getSightings.
export async function getTracks(): Promise<PublicTrack[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/tracks`, { credentials: 'include' })
    if (!response.ok) return []
    const body = await response.json()
    return body.tracks ?? []
  } catch {
    return []
  }
}

export type CreateTrackResult = { ok: true; track: PublicTrack } | { ok: false; message: string }

export async function createTrack(track: ImportedTrack & { name: string }): Promise<CreateTrackResult> {
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}/tracks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(track),
    })
  } catch {
    return { ok: false, message: 'Palvelimeen ei saatu yhteyttä.' }
  }

  const body = await response.json().catch(() => null)
  if (!response.ok) {
    if (response.status === 413) return { ok: false, message: 'Reitti on liian suuri tallennettavaksi.' }
    return { ok: false, message: body?.message ?? 'Tallennus epäonnistui. Yritä uudelleen.' }
  }
  return { ok: true, track: body.track }
}

export async function deleteTrack(id: string): Promise<{ ok: true } | { ok: false; message: string }> {
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}/tracks/${id}`, { method: 'DELETE', credentials: 'include' })
  } catch {
    return { ok: false, message: 'Palvelimeen ei saatu yhteyttä.' }
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    return { ok: false, message: body?.message ?? 'Poisto epäonnistui. Yritä uudelleen.' }
  }
  return { ok: true }
}
