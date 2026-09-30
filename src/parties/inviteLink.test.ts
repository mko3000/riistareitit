import { afterEach, describe, expect, it } from 'vitest'
import { buildInviteLink, readInviteCode, removeInviteCodeFromUrl } from './inviteLink'

afterEach(() => {
  window.history.replaceState(null, '', '/')
})

describe('invite links', () => {
  it('builds the app URL with ?liity=<code>', () => {
    expect(buildInviteLink('abc_-123', { origin: 'https://riistareitit.fi', pathname: '/' })).toBe(
      'https://riistareitit.fi/?liity=abc_-123',
    )
  })

  it('reads the code back, and ignores a missing or empty one', () => {
    expect(readInviteCode('?liity=abc_-123')).toBe('abc_-123')
    expect(readInviteCode('?foo=1')).toBeNull()
    expect(readInviteCode('?liity=')).toBeNull()
  })

  it('round-trips through a real URL', () => {
    const link = buildInviteLink('Zx9_-q', { origin: 'http://localhost:5173', pathname: '/' })
    expect(readInviteCode(new URL(link).search)).toBe('Zx9_-q')
  })

  it('removes only the invite code from the address bar', () => {
    window.history.replaceState(null, '', '/?liity=abc&x=1#kartta')
    removeInviteCodeFromUrl()
    expect(window.location.search).toBe('?x=1')
    expect(window.location.hash).toBe('#kartta')
  })
})
