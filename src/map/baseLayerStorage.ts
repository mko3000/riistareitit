// RII-6: remembers the chosen base map per browser. localStorage can be
// unavailable (private mode, blocked storage) — the remembered layer is a
// convenience, never required.

export type BaseLayerId = 'maastokartta' | 'ortokuva' | 'osm'

export const BASE_LAYER_IDS: BaseLayerId[] = ['maastokartta', 'ortokuva', 'osm']
export const DEFAULT_BASE_LAYER: BaseLayerId = 'maastokartta'
export const BASE_LAYER_STORAGE_KEY = 'riistareitit.baseLayer'

export function readStoredBaseLayer(): BaseLayerId {
  try {
    const stored = localStorage.getItem(BASE_LAYER_STORAGE_KEY)
    return BASE_LAYER_IDS.includes(stored as BaseLayerId) ? (stored as BaseLayerId) : DEFAULT_BASE_LAYER
  } catch {
    return DEFAULT_BASE_LAYER
  }
}

export function storeBaseLayer(id: BaseLayerId): void {
  try {
    localStorage.setItem(BASE_LAYER_STORAGE_KEY, id)
  } catch {
    // Not remembered this time; the map still works.
  }
}
