import fs from 'fs-extra'
import path, { dirname } from 'path'
import fsStore from 'fs-blob-store'
import { hooks as pluginHooks } from '../src/index.js'
import { fileURLToPath } from 'url'
import { describe, it, expect, beforeAll } from 'vitest'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
describe('krawler:hooks:geojson', () => {
  let json, osm
  const inputStore = fsStore({ path: path.join(__dirname, 'data') })

  const geoJsonHook = {
    type: 'after',
    result: {},
    params: { store: inputStore }
  }

  beforeAll(() => {
    json = fs.readJsonSync(path.join(__dirname, 'data', 'json.json'))
    osm = fs.readJsonSync(path.join(__dirname, 'data', 'osm.json'))
  })

  it('read sequential GeoJSON', async () => {
    geoJsonHook.result.id = 'geojsonseq.json'
    await pluginHooks.readSequentialGeoJson({})(geoJsonHook)
    expect(geoJsonHook.result.data).toBeTruthy()
    expect(geoJsonHook.result.data.length).toBe(3)
    geoJsonHook.result.data.forEach(feature => {
      expect(feature.type).toBe('Feature')
      expect(feature.geometry).toBeTruthy()
      expect(feature.geometry.type).toBeTruthy()
      expect(feature.geometry.coordinates).toBeTruthy()
      expect(feature.properties).toBeTruthy()
      expect(feature.properties.prop0).toBeTruthy()
    })
  })

  it('read sequential GeoJSON as feature collection', async () => {
    await pluginHooks.readSequentialGeoJson({ asFeatureCollection: true })(geoJsonHook)
    expect(geoJsonHook.result.data).toBeTruthy()
    expect(geoJsonHook.result.data.features).toBeTruthy()
    expect(geoJsonHook.result.data.features.length).toBe(3)
    geoJsonHook.result.data.features.forEach(feature => {
      expect(feature.type).toBe('Feature')
      expect(feature.geometry).toBeTruthy()
      expect(feature.geometry.type).toBeTruthy()
      expect(feature.geometry.coordinates).toBeTruthy()
      expect(feature.properties).toBeTruthy()
      expect(feature.properties.prop0).toBeTruthy()
    })
  })

  it('convert Json to GeoJSON', async () => {
    geoJsonHook.result.data = json
    await pluginHooks.convertToGeoJson({})(geoJsonHook)
    expect(geoJsonHook.result.data.type).toBe('FeatureCollection')
    expect(geoJsonHook.result.data.features.length).toBe(2)
    geoJsonHook.result.data.features.forEach(feature => {
      expect(feature.type).toBe('Feature')
      expect(feature.geometry).toBeTruthy()
      expect(feature.geometry.type).toBe('Point')
      expect(feature.geometry.coordinates).toBeTruthy()
      expect(feature.geometry.coordinates.length).toBe(3)
      expect(feature.properties).toBeTruthy()
      expect(feature.properties.callsign).toBeTruthy()
      expect(feature.properties.latitude).toBeUndefined()
      expect(feature.properties.longitude).toBeUndefined()
      expect(feature.properties.altitude).toBeUndefined()
    })
  })

  it('convert OSM to GeoJSON', async () => {
    geoJsonHook.result.data = osm
    await pluginHooks.convertOSMToGeoJson({})(geoJsonHook)
    expect(geoJsonHook.result.data.type).toBe('FeatureCollection')
    expect(geoJsonHook.result.data.features.length > 0).toBe(true)
  }, 5000)
})
