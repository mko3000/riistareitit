// RII-49: remembers per browser whether the fog-of-war overlay is on. Like
// the base layer choice (map/baseLayerStorage.ts), a convenience only —
// localStorage may be unavailable. On unless turned off.

export const FOG_STORAGE_KEY = 'riistareitit.fogOfWar'

export function readFogEnabled(): boolean {
  try {
    return localStorage.getItem(FOG_STORAGE_KEY) !== 'off'
  } catch {
    return true
  }
}

export function storeFogEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(FOG_STORAGE_KEY, enabled ? 'on' : 'off')
  } catch {
    // Not remembered this time; the map still works.
  }
}
