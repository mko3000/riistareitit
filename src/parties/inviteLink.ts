// RII-45: invite links are the app's own URL with ?liity=<code> — no router
// needed. See docs/SPEC.md §9 "UI".

const PARAM = 'liity'

export function buildInviteLink(code: string, location: Pick<Location, 'origin' | 'pathname'> = window.location): string {
  return `${location.origin}${location.pathname}?${PARAM}=${encodeURIComponent(code)}`
}

export function readInviteCode(search: string = window.location.search): string | null {
  const code = new URLSearchParams(search).get(PARAM)?.trim()
  return code ? code : null
}

// So a reload after joining (or closing the dialog) doesn't reopen it.
// Keeps any other query parameters and the hash.
export function removeInviteCodeFromUrl(): void {
  const url = new URL(window.location.href)
  if (!url.searchParams.has(PARAM)) return
  url.searchParams.delete(PARAM)
  window.history.replaceState(window.history.state, '', url.toString())
}

// What people paste into "Liity porukkaan": the bare code, or the whole link
// (possibly with extra whitespace or a trailing slash/period from a chat
// message). Returns the code, or null if it doesn't look like one. Codes are
// base64url (letters, digits, - and _).
const CODE_RE = /^[A-Za-z0-9_-]{8,64}$/
const LINK_CODE_RE = new RegExp(`[?&]${PARAM}=([A-Za-z0-9_-]+)`)

export function parseInviteInput(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  // Only the code's own characters are taken, so a trailing "&x=1", "#…",
  // or punctuation from a chat message falls away by itself.
  const fromLink = trimmed.match(LINK_CODE_RE)?.[1]
  const candidate = fromLink ?? trimmed.replace(/[.,;!?]+$/, '')
  return CODE_RE.test(candidate) ? candidate : null
}
