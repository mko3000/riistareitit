import { afterEach, describe, expect, it, vi } from 'vitest'
import { readDefaultVisibility, storeDefaultVisibility, visibilityName } from './visibility'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('default visibility', () => {
  it('is private when nothing is remembered', () => {
    expect(readDefaultVisibility(['p1'])).toBeNull()
  })

  it('remembers the last party chosen', () => {
    storeDefaultVisibility('p1')
    expect(readDefaultVisibility(['p1', 'p2'])).toBe('p1')
  })

  it('remembers private as private', () => {
    storeDefaultVisibility('p1')
    storeDefaultVisibility(null)
    expect(readDefaultVisibility(['p1'])).toBeNull()
  })

  it("falls back to private for a party I'm no longer in — never to another party", () => {
    storeDefaultVisibility('left-party')
    expect(readDefaultVisibility(['p1', 'p2'])).toBeNull()
  })

  it('works without localStorage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    expect(() => storeDefaultVisibility('p1')).not.toThrow()
    expect(readDefaultVisibility(['p1'])).toBeNull()
  })
})

describe('visibilityName', () => {
  const parties = [{ id: 'p1', name: 'Kukkarot' }]

  it('names the party, private, or a party I have left', () => {
    expect(visibilityName('p1', parties)).toBe('Kukkarot')
    expect(visibilityName(null, parties)).toBe('Vain minä')
    expect(visibilityName('gone', parties)).toBe('Porukka, josta olet poistunut')
  })
})
