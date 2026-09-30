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
