import fsStore from 'fs-blob-store'
import path, { dirname } from 'path'
import { hooks as pluginHooks } from '../src/index.js'
import { fileURLToPath } from 'url'
import { describe, it, expect, beforeAll } from 'vitest'
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

describe('krawler:hooks:kml', () => {
  const inputStore = fsStore({ path: path.join(__dirname, 'data') })

  const kmlHook = {
    type: 'after',
    result: { id: 'kml.kml' },
    params: { store: inputStore }
  }

  beforeAll(() => {
  })

  it('convert KML to GeoJSON', async () => {
    await pluginHooks.readKML({})(kmlHook)
    expect(kmlHook.result.data.type).toBe('FeatureCollection')
    expect(kmlHook.result.data.features.length).toBe(1)
    kmlHook.result.data.features.forEach(feature => {
      expect(feature.type).toBe('Feature')
      expect(feature.geometry).toBeTruthy()
      expect(feature.properties).toBeTruthy()
    })
  })

  it('convert KML to GeoJSON features', async () => {
    await pluginHooks.readKML({ features: true })(kmlHook)
    expect(kmlHook.result.data.length).toBe(1)
    kmlHook.result.data.forEach(feature => {
      expect(feature.type).toBe('Feature')
      expect(feature.geometry).toBeTruthy()
      expect(feature.properties).toBeTruthy()
    })
  }, 5000)
})
