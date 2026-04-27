import feathers from '@feathersjs/feathers'
import path, { dirname } from 'path'
import fs from 'fs'
import plugin, { hooks as pluginHooks } from '../src/index.js'
import { fileURLToPath } from 'url'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
// Skip S3-backed tests when no bucket credentials are available in env
const runS3 = Boolean(process.env.S3_ACCESS_KEY && process.env.S3_BUCKET)
const itS3 = runS3 ? it : it.skip

describe('krawler:stores', () => {
  let app, storesService, fsStore, memoryStore, s3Store

  beforeAll(() => {
    app = feathers()
    app.configure(plugin())
  })

  it('creates the stores service', () => {
    app.use('stores', plugin.stores())
    storesService = app.service('stores')
    expect(storesService).toBeTruthy()
  })

  it('creates the fs input storage', async () => {
    await storesService.create({
      id: 'fs-in',
      type: 'fs',
      options: {
        path: path.join(__dirname, 'data')
      }
    })
    const created = await storesService.get('fs-in')
    expect(created).toBeTruthy()
  })

  it('creates the fs output storage', async () => {
    await storesService.create({
      id: 'fs',
      type: 'fs',
      options: {
        path: path.join(__dirname, 'output')
      }
    })
    fsStore = await storesService.get('fs')
    expect(fsStore).toBeTruthy()
  })

  it('creates the memory storage', async () => {
    await storesService.create({
      id: 'memory',
      type: 'memory'
    })
    memoryStore = await storesService.get('memory')
    expect(memoryStore).toBeTruthy()
  })

  itS3('creates the s3 storage', async () => {
    await storesService.create({
      id: 's3',
      options: {
        client: {
          accessKeyId: process.env.S3_ACCESS_KEY,
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
          endpoint: process.env.S3_ENDPOINT
        },
        bucket: process.env.S3_BUCKET
      }
    })
    s3Store = await storesService.get('s3')
    expect(s3Store).toBeTruthy()
  })

  const storeHook = {
    type: 'before',
    data: {
      id: 'geojson.json'
    },
    params: {}
  }

  itS3('copy between stores (via s3)', async () => {
    storeHook.service = { storesService }
    await pluginHooks.copyToStore({ input: { store: 'fs-in', key: '<%= id %>' }, output: { store: 's3', key: '<%= id %>' } })(storeHook)
    await pluginHooks.copyToStore({ input: { store: 's3', key: '<%= id %>' }, output: { store: 'fs', key: '<%= id %>' } })(storeHook)
    expect(fs.existsSync(path.join(fsStore.path, storeHook.data.id))).toBe(true)
  }, 10000)

  it('prepares hook service and fs copy', async () => {
    // Fake hook service used by subsequent store hooks, and seed the output
    // store so gzip/gunzip/exists tests have a file to work with.
    storeHook.service = { storesService }
    await pluginHooks.copyToStore({ input: { store: 'fs-in', key: '<%= id %>' }, output: { store: 'fs', key: '<%= id %>' } })(storeHook)
    expect(fs.existsSync(path.join(fsStore.path, storeHook.data.id))).toBe(true)
  }, 10000)

  it('check if file exists in stores', async () => {
    // Fake hook service
    let hook = await pluginHooks.discardIfExistsInStore({ output: { store: 'fs', key: '<%= id %>.none' } })(storeHook)
    expect(hook.data.skip).toBeUndefined()
    hook = await pluginHooks.discardIfExistsInStore({ output: { store: 'fs', key: '<%= id %>' } })(storeHook)
    expect(hook.data.skip).toBe(true)
  }, 10000)

  it('copy inside the same store', async () => {
    await pluginHooks.copyToStore({ input: { store: 'fs', key: '<%= id %>' }, output: { store: 'fs', key: '<%= id %>.copy' } })(storeHook)
    expect(fs.existsSync(path.join(fsStore.path, storeHook.data.id + '.copy'))).toBe(true)
    const originalStat = fs.statSync(path.join(fsStore.path, storeHook.data.id))
    const deflateStat = fs.statSync(path.join(fsStore.path, storeHook.data.id + '.copy'))
    expect(originalStat.size).toBe(deflateStat.size)
  }, 10000)

  it('gzip in a store', async () => {
    await pluginHooks.gzipToStore({ input: { store: 'fs', key: '<%= id %>' }, output: { store: 'fs', key: '<%= id %>.gz' } })(storeHook)
    expect(fs.existsSync(path.join(fsStore.path, storeHook.data.id + '.gz'))).toBe(true)
  }, 10000)

  it('gunzip in a store', async () => {
    await pluginHooks.gunzipFromStore({ input: { store: 'fs', key: '<%= id %>.gz' }, output: { store: 'fs', key: '<%= id %>.guz' } })(storeHook)
    expect(fs.existsSync(path.join(fsStore.path, storeHook.data.id + '.guz'))).toBe(true)
    const originalStat = fs.statSync(path.join(fsStore.path, storeHook.data.id))
    const deflateStat = fs.statSync(path.join(fsStore.path, storeHook.data.id + '.guz'))
    expect(originalStat.size).toBe(deflateStat.size)
  }, 10000)

  it('unzip in a store', async () => {
    await pluginHooks.unzipFromStore({ input: { store: 'fs-in', key: 'stations.zip' }, output: { store: 'fs', path: 'unzip' } })(storeHook)
    expect(fs.existsSync(path.join(fsStore.path, 'unzip', 'StationHydro_FXX-geojson.dat'))).toBe(true)
  }, 10000)

  it('removes the fs storage', async () => {
    await storesService.remove('fs')
    try {
      await storesService.get('fs')
      expect.fail('Store access should fail')
    } catch (error) {
      expect(error).toBeTruthy()
    }
  })

  it('removes the memory storage', async () => {
    await storesService.remove('memory')
    try {
      await storesService.get('memory')
      expect.fail('Store access should fail')
    } catch (error) {
      expect(error).toBeTruthy()
    }
  })

  itS3('removes the s3 storage', async () => {
    await storesService.remove('s3')
    try {
      await storesService.get('s3')
      expect.fail('Store access should fail')
    } catch (error) {
      expect(error).toBeTruthy()
    }
  })

  // Cleanup
  afterAll(() => {

  })
})
