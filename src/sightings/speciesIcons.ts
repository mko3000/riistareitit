import { divIcon, type DivIcon } from 'leaflet'
import type { PublicSighting } from '../api'

// RII-5: marker appearance. Species -> silhouette, kind -> badge color.
// See docs/SPEC.md §6 for the design rationale.

type Kind = PublicSighting['kind']

export const MARKER_COLOR: Record<Kind, string> = {
  sighting: '#2563eb', // same blue as .link-button, for visual consistency
  kill: '#b00020', // same red as .field-error/.form-error
}

const MARKER_SIZE = 28

// SVG markup inside a 24x24 viewBox, bird facing left. Shapes are drawn in
// white; `{bg}` is replaced with the badge color for the few details that
// need to read as "cut out" of the silhouette (e.g. the hazel grouse's tail
// band). Keyed by species.icon, not species.key — see SPEC.md §6.
const SILHOUETTES: Record<string, string> = {
  // Displaying male: big body, upright neck, raised fanned tail.
  capercaillie: `
    <path d="M12.5 15 L13.5 3.5 A10 10 0 0 1 23 12.5 Z"/>
    <path d="M13.5 3.5 L15.8 15 M17.8 5 L15.8 15 M21.3 8.3 L15.8 15" stroke="{bg}" stroke-width="0.8"/>
    <ellipse cx="10" cy="15.5" rx="6.8" ry="4.6"/>
    <path d="M3.4 8 L6.6 7.6 L9.5 12.5 L4 14 Z"/>
    <circle cx="5" cy="6.2" r="2.3"/>
    <path d="M3 5.6 L0.8 6.8 L3.1 7.4 Z"/>
    <path d="M4 8 L3.4 10.4 L5.6 8.6 Z"/>
    <path d="M8.5 19.5 V22.5 M11.5 19.5 V22.5" stroke="white" stroke-width="1.3" stroke-linecap="round"/>
  `,
  // Lyre-shaped tail: outer feathers curling out up and down.
  'black-grouse': `
    <ellipse cx="10.5" cy="14" rx="6.5" ry="4.3"/>
    <path d="M4 9.5 L7 9 L9.5 12.5 L5 13.5 Z"/>
    <circle cx="5" cy="8" r="2.2"/>
    <path d="M3 7.4 L1 8.3 L3.1 8.9 Z"/>
    <path d="M15.5 13 C18.5 12.5 19.5 10 20.5 8.5 C21.2 7.5 22.8 7.6 23 9 M15.5 15 C18.5 15.5 19.5 18 20.5 19.5 C21.2 20.5 22.8 20.4 23 19" fill="none" stroke="white" stroke-width="1.9" stroke-linecap="round"/>
    <path d="M15 12.5 L20 13.3 L20 14.7 L15 15.5 Z"/>
    <path d="M9 18 V21.5 M12 18 V21.5" stroke="white" stroke-width="1.3" stroke-linecap="round"/>
  `,
  // Small with a pointed crest and a banded tail.
  'hazel-grouse': `
    <ellipse cx="12" cy="14" rx="6.2" ry="4.8"/>
    <circle cx="6.5" cy="9.5" r="2.7"/>
    <path d="M6 7 L10.5 5 L9 8.5 Z"/>
    <path d="M4 8.9 L1.8 9.9 L4.1 10.5 Z"/>
    <path d="M17 12 L22.5 11.5 L22.5 16 L17 16.5 Z"/>
    <path d="M20.3 11.6 V16.2" stroke="{bg}" stroke-width="1.1"/>
    <path d="M10.5 18.5 V21.5 M13.5 18.5 V21.5" stroke="white" stroke-width="1.3" stroke-linecap="round"/>
  `,
  // Plump, round body; short tail; fluffy feathered feet.
  'willow-ptarmigan': `
    <circle cx="12.5" cy="13.5" r="6.5"/>
    <circle cx="6.8" cy="9" r="2.8"/>
    <path d="M4.3 8.4 L2.2 9.4 L4.4 10 Z"/>
    <path d="M18.5 12 L21.5 11.5 L21.5 14.5 L18.5 15 Z"/>
    <ellipse cx="10.3" cy="20.5" rx="1.8" ry="1.3"/>
    <ellipse cx="14.3" cy="20.5" rx="1.8" ry="1.3"/>
  `,
}

// Generic perching bird: used for custom species and unknown icon ids.
const FALLBACK_SILHOUETTE = `
  <path d="M5 11 C5 7 10 6.5 12 10 L21 13 L17 14 C15 18 8 18.5 6.5 15 Z"/>
  <circle cx="7" cy="9" r="2.6"/>
  <path d="M4.6 8.4 L2 9.3 L4.7 10 Z"/>
  <path d="M10 17 V20.5 M12.5 17 V20.5" stroke="white" stroke-width="1.3" stroke-linecap="round"/>
`

function markerSvg(silhouette: string, kind: Kind): string {
  const color = MARKER_COLOR[kind]
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${MARKER_SIZE}" height="${MARKER_SIZE}">
    <circle cx="12" cy="12" r="11.2" fill="${color}" stroke="white" stroke-width="1.6"/>
    <g transform="translate(3.6 3.6) scale(0.7)" fill="white">${silhouette.replaceAll('{bg}', color)}</g>
  </svg>`
}

// One DivIcon per (silhouette, kind) — react-leaflet calls setIcon() whenever
// the icon prop's identity changes, which rebuilds the marker's DOM, so
// handing it a fresh object every render would be wasted work.
const iconCache = new Map<string, DivIcon>()

export function markerIconFor(sighting: PublicSighting): DivIcon {
  // Custom species have no `species` at all; an icon id the registry
  // doesn't know (e.g. a species row added before its icon ships) falls back
  // the same way rather than rendering a broken marker.
  const iconId = sighting.species?.icon
  const silhouette = (iconId && SILHOUETTES[iconId]) || FALLBACK_SILHOUETTE
  const cacheKey = `${silhouette === FALLBACK_SILHOUETTE ? 'fallback' : iconId}:${sighting.kind}`
  let icon = iconCache.get(cacheKey)
  if (!icon) {
    icon = divIcon({
      html: markerSvg(silhouette, sighting.kind),
      className: 'sighting-marker',
      iconSize: [MARKER_SIZE, MARKER_SIZE],
      iconAnchor: [MARKER_SIZE / 2, MARKER_SIZE / 2],
      popupAnchor: [0, -MARKER_SIZE / 2],
    })
    iconCache.set(cacheKey, icon)
  }
  return icon
}
