import { afterEach, describe, expect, it, vi } from 'vitest'
import { BASE_LAYER_STORAGE_KEY, readStoredBaseLayer, storeBaseLayer } from './baseLayerStorage'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('base layer storage', () => {
  it('defaults to the topographic map', () => {
    expect(readStoredBaseLayer()).toBe('maastokartta')
  })

  it('remembers the chosen layer', () => {
    storeBaseLayer('ortokuva')
    expect(readStoredBaseLayer()).toBe('ortokuva')
  })

  it('ignores an unknown stored value', () => {
    localStorage.setItem(BASE_LAYER_STORAGE_KEY, 'google-satellite')
    expect(readStoredBaseLayer()).toBe('maastokartta')
  })

  it('works without localStorage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    expect(() => storeBaseLayer('osm')).not.toThrow()
    expect(readStoredBaseLayer()).toBe('maastokartta')
  })
})
