import path, { dirname } from 'path'
import fsStore from 'fs-blob-store'
import yaml from 'js-yaml'
import fs from 'fs'
import _ from 'lodash'
import utils from 'util'
import { hooks as pluginHooks } from '../src/index.js'
import { fileURLToPath } from 'url'
import { describe, it, expect, beforeAll } from 'vitest'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
describe('krawler:hooks:utils', () => {
  const inputStore = fsStore({ path: path.join(__dirname, 'data') })
  const outputStore = fsStore({ path: path.join(__dirname, 'output') })

  beforeAll(async () => {
  })

  const applyHook = {
    type: 'before',
    data: {
      value: 6
    }
  }

  it('apply function', async () => {
    const hook = await pluginHooks.apply({
      function: (item) => { if (item.value === 6) item.value = 3 }
    })(applyHook)

    expect(hook.data.value).toBe(3)
  })

  it('apply async function', async () => {
    const hook = await pluginHooks.apply({
      function: async (item) => {
        await utils.promisify(setTimeout)(1000)
        if (item.value === 3) item.value = 6
      }
    })(applyHook)

    expect(hook.data.value).toBe(6)
  }, 5000)

  it('apply function raising error', (done) => {
    pluginHooks.apply({
      function: (item) => { throw new Error('apply error') }
    })(applyHook)
      .catch(error => {
        expect(error).toBeTruthy()
        expect(error.message).toBe('apply error')
        done()
      })
  })

  it('apply async function raising error', (done) => {
    pluginHooks.apply({
      function: async (item) => {
        await utils.promisify(setTimeout)(1000)
        throw new Error('apply error')
      }
    })(applyHook)
      .catch(error => {
        expect(error).toBeTruthy()
        expect(error.message).toBe('apply error')
        done()
      })
  }, 5000)

  it('apply function with match filter', async () => {
    applyHook.type = 'after'
    applyHook.method = 'create' // Required to use hook pipeline
    applyHook.result = { value: 6 }
    let hook = await pluginHooks.addHook('apply', { match: { value: 6 }, function: (item) => { item.value = 3 } })(applyHook)
    expect(hook.result.value).toBe(3)
    hook = await pluginHooks.addHook('apply', { match: { value: 6 }, function: (item) => { item.value = 6 } })(applyHook)
    expect(hook.result.value).toBe(3)
  })

  it('apply function with match filter predicate', async () => {
    applyHook.type = 'after'
    applyHook.method = 'create' // Required to use hook pipeline
    applyHook.result = { value: 6 }
    let hook = await pluginHooks.addHook('apply', { match: { predicate: (item) => item.value === 3 }, function: (item) => { item.value = 6 } })(applyHook)
    expect(hook.result.value).toBe(6)
    hook = await pluginHooks.addHook('apply', { match: { predicate: (item) => item.value === 3 }, function: (item) => { item.value = 3 } })(applyHook)
    expect(hook.result.value).toBe(6)
  })

  it('apply function with async match filter predicate', async () => {
    applyHook.type = 'after'
    applyHook.method = 'create' // Required to use hook pipeline
    applyHook.result = { value: 6 }
    let hook = await pluginHooks.addHook('apply', {
      match: {
        predicate: async (item) => {
          await utils.promisify(setTimeout)(1000)
          return item.value === 3
        }
      },
      function: (item) => { item.value = 6 }
    })(applyHook)
    expect(hook.result.value).toBe(6)
    hook = await pluginHooks.addHook('apply', {
      match: {
        predicate: async (item) => {
          await utils.promisify(setTimeout)(1000)
          return item.value === 3
        }
      },
      function: (item) => { item.value = 3 }
    })(applyHook)
    expect(hook.result.value).toBe(6)
  }, 5000)

  const templateHook = {
    type: 'after',
    data: {
      id: 'mapproxy-templated'
    },
    result: {
      id: 'mapproxy-templated',
      data: {
        times: [new Date(Date.UTC(2017, 11, 5, 0, 0, 0)), new Date(Date.UTC(2017, 11, 5, 6, 0, 0)), new Date(Date.UTC(2017, 11, 5, 12, 0, 0))],
        elevations: [0, 10, 100]
      }
    },
    params: { store: outputStore, templateStore: inputStore }
  }

  it('write template from JSON', async () => {
    const hook = await pluginHooks.writeTemplate({ templateFile: 'mapproxy-template.yaml' })(templateHook)
    let templated = fs.readFileSync(path.join(outputStore.path, 'mapproxy-templated.yaml'), 'utf8')
    templated = yaml.safeLoad(templated)
    const times = _.get(templated, 'layers[0].dimensions.time.values')
    expect(times).toBeTruthy()
    expect(times.map(time => new Date(time))).toEqual(hook.result.data.times)
    const elevations = _.get(templated, 'layers[0].dimensions.elevation.values')
    expect(elevations).toBeTruthy()
    expect(elevations).toEqual(hook.result.data.elevations)
  }, 5000)

  const hookDefinitions = {
    readJson: {},
    convertToGeoJson: {}
  }

  it('insert hook before', () => {
    const newHookDefinitions = pluginHooks.insertHookBefore('convertToGeoJson', hookDefinitions, 'transformJson', {})
    let index = 0
    _.forOwn(newHookDefinitions, (hookOptions, hookName) => {
      if (index === 0) expect(hookName).toBe('readJson')
      else if (index === 1) expect(hookName).toBe('transformJson')
      else if (index === 2) expect(hookName).toBe('convertToGeoJson')
      index++
    })
  })

  it('insert hook after', () => {
    const newHookDefinitions = pluginHooks.insertHookAfter('readJson', hookDefinitions, 'transformJson', {})
    let index = 0
    _.forOwn(newHookDefinitions, (hookOptions, hookName) => {
      if (index === 0) expect(hookName).toBe('readJson')
      else if (index === 1) expect(hookName).toBe('transformJson')
      else if (index === 2) expect(hookName).toBe('convertToGeoJson')
      index++
    })
  })
})
