import path, { dirname } from 'path'
import nock from 'nock'
import fsStore from 'fs-blob-store'
import fs from 'fs'
import { hooks as pluginHooks } from '../src/index.js'
import { fileURLToPath } from 'url'
import { describe, it, expect, beforeAll } from 'vitest'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
describe('krawler:hooks:main', () => {
  const inputStore = fsStore({ path: path.join(__dirname, 'data') })
  const outputStore = fsStore({ path: path.join(__dirname, 'output') })

  beforeAll(async () => {
  })

  it('registers custom hook', async () => {
    const testHook = { type: 'before', method: 'create', data: {}, result: {} }
    pluginHooks.registerHook('custom', (options) => (hook) => {
      const item = (hook.type === 'before' ? hook.data : hook.result)
      item.n = options.parameter
      return hook
    })
    let hooks = {
      before: {
        custom: { parameter: 1 }
      },
      after: {
        custom: { parameter: 2 }
      }
    }
    hooks = pluginHooks.activateHooks(hooks)
    // Check the right hooks have been added
    expect(hooks.before.create.length).toBe(1)
    expect(typeof hooks.before.create[0]).toBe('function')
    await hooks.before.create[0](testHook)
    expect(testHook.data.n).toBe(1)
    expect(hooks.after.create.length).toBe(1)
    expect(typeof hooks.after.create[0]).toBe('function')
    testHook.type = 'after'
    await hooks.after.create[0](testHook)
    expect(testHook.result.n).toBe(2)
  })

  it('manages basic auth on request header', async () => {
    const authHook = {
      type: 'before',
      data: {
        options: {
          auth: {
            user: 'toto',
            password: 'titi'
          }
        }
      }
    }

    await pluginHooks.basicAuth({ type: 'Proxy-Authorization' })(authHook)
    expect(authHook.data.options.headers['Proxy-Authorization']).toBeTruthy()
    expect(authHook.data.options.headers['Proxy-Authorization'].startsWith('Basic ')).toBe(true)
  })

  it('manages basic auth with form data and cookie', async () => {
    const authHook = {
      type: 'before',
      data: {
        options: {
          auth: {
            url: 'https://www.portal.com/login',
            form: {
              user: 'toto',
              password: 'titi'
            }
          }
        }
      }
    }

    nock('https://www.portal.com')
      .post('/login', 'user=toto&password=titi')
      .reply(200, 'OK')
    await pluginHooks.basicAuth({ jar: true })(authHook)
    expect(authHook.data.options.jar).toBe(true)
  })

  it('manages OAuth token on request header', async () => {
    const response = {
      access_token: 'gvocpYeEjygirZWvjcxJUAQLvMxtp8wKoloRDZ4t3ftJMJZPgZHAOE',
      token_type: 'Bearer',
      expires_in: 7200
    }
    const oauth = {
      url: 'https://www.api.com/oauth/token',
      client_id: 'toto',
      client_secret: 'titi'
    }
    // Use post method first
    nock('https://www.api.com')
      .post('/oauth/token')
      .reply(200, response)
    let oauthHook = {
      type: 'before',
      data: {
        options: {
          oauth: Object.assign({
            method: 'client_secret_post'
          }, oauth)
        }
      }
    }
    await pluginHooks.OAuth({ type: 'Authorization' })(oauthHook)
    expect(oauthHook.data.options.headers.Authorization).toBeTruthy()
    expect(oauthHook.data.options.headers.Authorization.startsWith('Bearer ')).toBe(true)
    expect(oauthHook.data.options.headers.Authorization.endsWith(response.access_token)).toBe(true)
    // Switch method to basic
    nock('https://www.api.com')
      .post('/oauth/token')
      .basicAuth({ user: 'toto', pass: 'titi' })
      .reply(200, response)
    oauthHook = {
      type: 'before',
      data: {
        options: {
          oauth: Object.assign({
            method: 'client_secret_basic'
          }, oauth)
        }
      }
    }
    await pluginHooks.OAuth({ type: 'Authorization' })(oauthHook)
    expect(oauthHook.data.options.headers.Authorization).toBeTruthy()
    expect(oauthHook.data.options.headers.Authorization.startsWith('Bearer ')).toBe(true)
    expect(oauthHook.data.options.headers.Authorization.endsWith(response.access_token)).toBe(true)
  }, 5000)

  function checkJson (hook) {
    // We know we have a max value at 73.44 in this file
    expect(hook.result.data).toBeTruthy()
    let maxPixel, maxIndex
    let index = 0
    hook.result.data.forEach(pixel => {
      if (pixel.value > 73) {
        maxPixel = pixel
        maxIndex = index
      }
      index++
    })
    expect(maxPixel).toBeTruthy()
    // This point [139.736316,35.630105] should be in pixel
    expect(maxPixel.bbox[0] < 139.736316).to.toBe(true)
    expect(maxPixel.bbox[2] > 139.736316).to.toBe(true)
    expect(maxPixel.bbox[1] < 35.630105).to.toBe(true)
    expect(maxPixel.bbox[3] > 35.630105).to.toBe(true)
    // It is located at [96, 16]
    expect(Math.floor(maxIndex / 300)).toBe(16)
    expect(maxIndex % 300).toBe(96)
  }

  const geotiffHook = {
    type: 'after',
    data: {
      id: 'RJTT-30-18000-2-1.tif'
    },
    result: {
      id: 'RJTT-30-18000-2-1.tif'
    },
    params: { store: inputStore }
  }

  it('converts GeoTiff to JSON', () => {
    return pluginHooks.readGeoTiff({
      fields: ['bbox', 'value']
    })(geotiffHook)
      .then(hook => {
        checkJson(hook)
      })
  }, 5000)

  it('computes statistics on JSON', () => {
    return pluginHooks.computeStatistics({
      min: true, max: true, dataPath: 'result.data'
    })(geotiffHook)
      .then(hook => {
      // We know we have a max value at 73.44 in this file
        expect(hook.result.min).toBeTruthy()
        expect(hook.result.max).toBeTruthy()
        expect(hook.result.min.toFixed(2)).toBe('-32.00')
        expect(hook.result.max.toFixed(2)).toBe('73.44')
        // Cleanup for next test
        delete hook.result.min
        delete hook.result.max
      })
  }, 5000)

  it('computes statistics on GeoTiff', () => {
    return pluginHooks.computeStatistics({
      min: true, max: true
    })(geotiffHook)
      .then(hook => {
      // We know we have a max value at 73.44 in this file
        expect(hook.result.min).toBeTruthy()
        expect(hook.result.max).toBeTruthy()
        expect(hook.result.min.toFixed(2)).toBe('-32.00')
        expect(hook.result.max.toFixed(2)).toBe('73.44')
      })
  }, 5000)

  it('write JSON', () => {
    // Switch to output store
    geotiffHook.params.store = outputStore
    return pluginHooks.writeJson()(geotiffHook)
      .then(hook => {
        expect(fs.existsSync(path.join(outputStore.path, geotiffHook.result.id + '.json'))).toBe(true)
      })
  }, 5000)

  it('clear JSON data', () => {
    pluginHooks.clearData()(geotiffHook)
    expect(geotiffHook.result.data).toBeUndefined()
  })

  it('read JSON', () => {
    // Update input file name to converted json
    geotiffHook.result.id += '.json'
    return pluginHooks.readJson()(geotiffHook)
      .then(hook => {
        checkJson(hook)
      })
  }, 5000)

  it('clear JSON output', () => {
    pluginHooks.clearOutputs()(geotiffHook)
    expect(fs.existsSync(path.join(outputStore.path, geotiffHook.result.id + '.json'))).toBe(false)
  })

  const jsonHook = {
    type: 'after',
    result: {
      id: 'json',
      data: {
        first: {
          speed: 10,
          time: '2018-05-31 13:25:13.431',
          nested: {
            value: 20
          },
          notPicked: 'first',
          omitted: 'first'
        },
        second: {
          speed: 30,
          time: '2018-05-31 13:26:13.431',
          nested: {
            value: 40
          },
          notPicked: 'second',
          omitted: 'second'
        }
      }
    }
  }

  it('transform JSON', () => {
    pluginHooks.transformJson({
      toArray: true,
      mapping: {
        'nested.value': 'value'
      },
      unitMapping: {
        speed: { from: 'kts', to: 'm/s' },
        time: { asDate: 'utc', from: 'YYYY-MM-DD HH:mm:ss.SSS' }
      },
      pick: ['speed', 'time', 'value', 'omit'],
      omit: ['omit'],
      merge: { new: 'new' }
    })(jsonHook)
    expect(Array.isArray(jsonHook.result.data)).toBe(true)
    expect(jsonHook.result.data.length === 2).toBe(true)
    const data = jsonHook.result.data[0]
    expect(data.notPicked).toBeUndefined()
    expect(data.omitted).toBeUndefined()
    expect(data.new).toBeTruthy()
    expect(data.new).toBe('new')
    expect(data.value).toBeTruthy()
    expect(data.value).toBe(20)
    expect(data.speed).toBe(10 * 0.514444)
    expect(data.time.getTime()).toBe(new Date('2018-05-31T13:25:13.431Z').getTime())
  })

  const geoJsonHook = {
    type: 'after',
    result: {
      id: 'gejson',
      data: {
        type: 'Point',
        coordinates: [319180, 6399862]
      }
    }
  }

  it('reproject GeoJSON', () => {
    pluginHooks.reprojectGeoJson({
      from: 'EPSG:3006', to: 'EPSG:2400'
    })(geoJsonHook)
    const data = geoJsonHook.result.data
    expect(Math.abs(data.coordinates[0] - 1271138)).toBeLessThan(1)
    expect(Math.abs(data.coordinates[1] - 6404230)).toBeLessThan(1)
  })

  const capabilitiesHook = {
    type: 'after'
  }

  it('get WMS capabilities', () => {
    return pluginHooks.getCapabilities({
      url: 'https://geoservices.brgm.fr/risques',
      service: 'WMS'
    })(capabilitiesHook)
      .then(hook => {
        expect(hook.result.data).toBeTruthy()
      })
  }, 5000)
})
