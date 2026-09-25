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

export async function createSighting(input: {
  lat: number
  lng: number
  speciesKey?: string
  customSpecies?: string
  kind: 'sighting' | 'kill'
  personDisplay: string
  observedDate: string
  observedTime?: string
}): Promise<CreateSightingResult> {
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}/sightings`, {
      method: 'POST',
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
