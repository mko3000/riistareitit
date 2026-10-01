import { useMemo } from 'react'
import { LayersControl, useMapEvents } from 'react-leaflet'
import { createElementObject, createLayerComponent, type LayerProps } from '@react-leaflet/core'
import L from 'leaflet'
import type { PublicSighting, PublicTrack } from '../api'
import { t } from '../i18n'
import { joinShortGaps } from '../tracks/gapJoining'
import { computeFogCells, FOG_BINS, FOG_CELL_SIZE_MERC, fogBinIndex, prepareFogTrack, type FogCell, type PreparedFogTrack } from './fogGrid'
import { readFogEnabled, storeFogEnabled } from './fogStorage'

// RII-49: the fog-of-war overlay — explored cells coloured by birds per
// visit. See docs/SPEC.md §6 "Fog of war".

const MERC_HALF_WORLD = Math.PI * 6378137
const TILE_SIZE = 256
// Cells are indexed in blocks this many cells wide, so a tile only looks at
// the blocks under it.
const BLOCK_CELLS = 64
const LEGEND_LABELS = [
  t.map.fogLegendNone,
  t.map.fogLegendUnderHalf,
  t.map.fogLegendHalfToOne,
  t.map.fogLegendOneToTwo,
  t.map.fogLegendOverTwo,
]

function blockKey(bx: number, by: number): string {
  return `${bx},${by}`
}

function createLegend(): L.Control {
  const Legend = L.Control.extend({
    onAdd() {
      const box = L.DomUtil.create('div', 'fog-legend')
      L.DomUtil.create('div', 'fog-legend-title', box).textContent = t.map.fogLegendTitle
      FOG_BINS.forEach((bin, index) => {
        const row = L.DomUtil.create('div', 'fog-legend-row', box)
        const swatch = L.DomUtil.create('span', 'fog-legend-swatch', row)
        swatch.style.background = bin.color
        swatch.style.opacity = String(bin.opacity + 0.3)
        L.DomUtil.create('span', '', row).textContent = LEGEND_LABELS[index]
      })
      return box
    },
  })
  return new Legend({ position: 'bottomleft' })
}

class FogGridLayer extends L.GridLayer {
  private blocks = new Map<string, FogCell[]>()
  private legend = createLegend()

  setCells(cells: Map<string, FogCell>) {
    this.blocks = new Map()
    for (const cell of cells.values()) {
      const key = blockKey(Math.floor(cell.ix / BLOCK_CELLS), Math.floor(cell.iy / BLOCK_CELLS))
      const block = this.blocks.get(key)
      if (block) block.push(cell)
      else this.blocks.set(key, [cell])
    }
    this.redraw()
  }

  onAdd(map: L.Map) {
    super.onAdd(map)
    this.legend.addTo(map)
    return this
  }

  onRemove(map: L.Map) {
    this.legend.remove()
    super.onRemove(map)
    return this
  }

  createTile(coords: L.Coords): HTMLElement {
    const canvas = document.createElement('canvas')
    canvas.width = TILE_SIZE
    canvas.height = TILE_SIZE
    const context = canvas.getContext('2d')
    if (!context) return canvas

    // Pixels per Mercator metre at this zoom, and the tile's Mercator bounds.
    const scale = (TILE_SIZE * 2 ** coords.z) / (2 * MERC_HALF_WORLD)
    const originX = coords.x * TILE_SIZE
    const originY = coords.y * TILE_SIZE
    const minX = originX / scale - MERC_HALF_WORLD
    const maxX = (originX + TILE_SIZE) / scale - MERC_HALF_WORLD
    const maxY = MERC_HALF_WORLD - originY / scale
    const minY = MERC_HALF_WORLD - (originY + TILE_SIZE) / scale
    const blockSize = FOG_CELL_SIZE_MERC * BLOCK_CELLS

    // Cell edges are floored to whole pixels, so neighbouring cells share an
    // edge exactly — no seams, and no overlap doubling the opacity.
    const toPxX = (x: number) => Math.floor((x + MERC_HALF_WORLD) * scale - originX)
    const toPxY = (y: number) => Math.floor((MERC_HALF_WORLD - y) * scale - originY)

    for (let bx = Math.floor(minX / blockSize); bx <= Math.floor(maxX / blockSize); bx++) {
      for (let by = Math.floor(minY / blockSize); by <= Math.floor(maxY / blockSize); by++) {
        for (const cell of this.blocks.get(blockKey(bx, by)) ?? []) {
          const left = toPxX(cell.ix * FOG_CELL_SIZE_MERC)
          const right = toPxX((cell.ix + 1) * FOG_CELL_SIZE_MERC)
          const top = toPxY((cell.iy + 1) * FOG_CELL_SIZE_MERC)
          const bottom = toPxY(cell.iy * FOG_CELL_SIZE_MERC)
          if (right < 0 || left >= TILE_SIZE || bottom < 0 || top >= TILE_SIZE) continue
          const bin = FOG_BINS[fogBinIndex(cell)]
          context.globalAlpha = bin.opacity
          context.fillStyle = bin.color
          // At least 1×1 px, so explored areas don't vanish when zoomed out.
          context.fillRect(left, top, Math.max(1, right - left), Math.max(1, bottom - top))
        }
      }
    }
    return canvas
  }
}

interface FogGridProps extends LayerProps {
  cells: Map<string, FogCell>
}

const FogGrid = createLayerComponent<FogGridLayer, FogGridProps>(
  (props, context) => {
    // Above the base maps (z-index 1) but still in the tile pane, so below
    // the tracks and pins.
    const layer = new FogGridLayer({ zIndex: 10, tileSize: TILE_SIZE })
    layer.setCells(props.cells)
    return createElementObject(layer, context)
  },
  (layer, props, prevProps) => {
    if (props.cells !== prevProps.cells) layer.setCells(props.cells)
  },
)

// Keyed by the track object: the tracks layer keeps unchanged tracks'
// objects when one is imported, edited or deleted, so only new ones are
// computed.
const preparedTracksCache = new WeakMap<PublicTrack, PreparedFogTrack>()

function preparedTrack(track: PublicTrack): PreparedFogTrack {
  let prepared = preparedTracksCache.get(track)
  if (!prepared) {
    prepared = prepareFogTrack({ recordedDate: track.recordedDate, lines: joinShortGaps(track.segments) })
    preparedTracksCache.set(track, prepared)
  }
  return prepared
}

interface FogOfWarOverlayProps {
  tracks: PublicTrack[]
  sightings: PublicSighting[]
}

// An overlay entry in the layers control; must be rendered inside
// <LayersControl> (see BaseLayers). On/off is remembered per browser.
export function FogOfWarOverlay({ tracks, sightings }: FogOfWarOverlayProps) {
  // Coverage is computed once per track (tracks are immutable apart from
  // their party); adding or editing a sighting just re-credits the cells.
  const preparedTracks = useMemo(() => tracks.map(preparedTrack), [tracks])
  const cells = useMemo(() => computeFogCells(preparedTracks, sightings), [preparedTracks, sightings])
  // Only the initial state matters to React; after that the control owns it.
  const initiallyOn = useMemo(() => readFogEnabled(), [])

  useMapEvents({
    overlayadd(event) {
      if (event.name === t.map.fogOfWar) storeFogEnabled(true)
    },
    overlayremove(event) {
      if (event.name === t.map.fogOfWar) storeFogEnabled(false)
    },
  })

  return (
    <LayersControl.Overlay name={t.map.fogOfWar} checked={initiallyOn}>
      <FogGrid cells={cells} />
    </LayersControl.Overlay>
  )
}
