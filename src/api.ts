const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001'

export interface PublicUser {
  id: string
  email: string
  displayName: string
  role: string
  createdAt: string
}

export type SignUpFieldErrors = Partial<Record<'email' | 'displayName' | 'password', string>>

export type SignUpResult =
  | { ok: true; user: PublicUser }
  | { ok: false; message: string; fieldErrors?: SignUpFieldErrors }

export async function signUp(input: {
  email: string
  displayName: string
  password: string
}): Promise<SignUpResult> {
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Required so the browser stores the session cookie the API sets —
      // without this the sign-up "succeeds" but you're not actually signed in.
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
    return { ok: false, message: body?.message ?? 'Sign up failed. Please try again.' }
  }

  return { ok: true, user: body.user }
}
