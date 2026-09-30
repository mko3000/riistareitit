// [lat, lng] in degrees — the shape tracks are drawn and measured in.
export type LatLngPair = [number, number]

const EARTH_RADIUS_M = 6371008.8

// Great-circle distance in metres (haversine).
export function distanceM(a: LatLngPair, b: LatLngPair): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b[0] - a[0])
  const dLng = toRad(b[1] - a[1])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h))
}
