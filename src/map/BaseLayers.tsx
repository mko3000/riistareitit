import { useState, type ReactNode } from 'react'
import { LayersControl, TileLayer, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { mmlTileUrlTemplate } from '../api'
import { t } from '../i18n'
import { BASE_LAYER_IDS, initialBaseLayer, storeBaseLayer, type BaseLayerId } from './baseLayerStorage'

// RII-6: switchable base maps — MML topographic map and aerial photos
// (proxied through our server, which holds the API key) plus OpenStreetMap
// for outside Finland. The MML layers need login (RII-41): logged out, only
// OpenStreetMap is offered. See docs/SPEC.md §6 "Base layers".

// Same box the server proxies tiles for; Leaflet won't request tiles
// outside it (they'd be blank anyway).
const FINLAND_BOUNDS = L.latLngBounds([58.8, 19.0], [70.3, 32.0])
const MML_ATTRIBUTION = '&copy; <a href="https://www.maanmittauslaitos.fi/">Maanmittauslaitos</a> (CC BY 4.0)'
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
// MML's open service goes to zoom 16; Leaflet upscales beyond that.
const MML_MAX_NATIVE_ZOOM = 16
const MAX_ZOOM = 18

const LAYER_NAMES: Record<BaseLayerId, string> = {
  maastokartta: t.map.topographic,
  ortokuva: t.map.aerial,
  osm: t.map.openStreetMap,
}

interface BaseLayersProps {
  // App remounts this (via `key`) when it changes, so the initial pick below
  // is made again.
  loggedIn: boolean
  // Overlay entries (<LayersControl.Overlay>) for the same control — RII-49.
  children?: ReactNode
}

export function BaseLayers({ loggedIn, children }: BaseLayersProps) {
  // Only the initial pick matters to React; after that Leaflet's control
  // owns which layer is shown.
  const [initialLayer] = useState(() => initialBaseLayer(loggedIn))

  useMapEvents({
    baselayerchange(event) {
      // Logged out there's nothing to choose — keep the stored choice.
      if (!loggedIn) return
      const id = BASE_LAYER_IDS.find((candidate) => LAYER_NAMES[candidate] === event.name)
      if (id) storeBaseLayer(id)
    },
  })

  return (
    <LayersControl position="topright">
      {loggedIn && (
        <>
          <LayersControl.BaseLayer name={LAYER_NAMES.maastokartta} checked={initialLayer === 'maastokartta'}>
            <TileLayer
              url={mmlTileUrlTemplate('maastokartta')}
              attribution={MML_ATTRIBUTION}
              bounds={FINLAND_BOUNDS}
              maxNativeZoom={MML_MAX_NATIVE_ZOOM}
              maxZoom={MAX_ZOOM}
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name={LAYER_NAMES.ortokuva} checked={initialLayer === 'ortokuva'}>
            <TileLayer
              url={mmlTileUrlTemplate('ortokuva')}
              attribution={MML_ATTRIBUTION}
              bounds={FINLAND_BOUNDS}
              maxNativeZoom={MML_MAX_NATIVE_ZOOM}
              maxZoom={MAX_ZOOM}
            />
          </LayersControl.BaseLayer>
        </>
      )}
      <LayersControl.BaseLayer name={LAYER_NAMES.osm} checked={initialLayer === 'osm'}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution={OSM_ATTRIBUTION} maxZoom={MAX_ZOOM} />
      </LayersControl.BaseLayer>
      {children}
    </LayersControl>
  )
}
