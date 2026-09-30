import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFogEnabled, storeFogEnabled } from './fogStorage'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('fog of war storage', () => {
  it('is on by default', () => {
    expect(readFogEnabled()).toBe(true)
  })

  it('remembers turning it off and on again', () => {
    storeFogEnabled(false)
    expect(readFogEnabled()).toBe(false)
    storeFogEnabled(true)
    expect(readFogEnabled()).toBe(true)
  })

  it('works without localStorage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    expect(() => storeFogEnabled(false)).not.toThrow()
    expect(readFogEnabled()).toBe(true)
  })
})
