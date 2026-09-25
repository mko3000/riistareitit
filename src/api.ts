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
