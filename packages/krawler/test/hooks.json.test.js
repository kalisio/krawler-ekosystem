import path from 'node:path'
import os from 'node:os'
import fs from 'fs-extra'
import fsStore from 'fs-blob-store'
import createMemoryStore from '../src/stores/stores.memory.js'
import { writeJson, readJson, transformJson, mergeJson, writeTemplate } from '../src/hooks/hooks.json.js'

function makeHook (data = {}, store, id = 'task') {
  return {
    type: 'after',
    data: { id },
    result: { id, data },
    params: { store }
  }
}

function makeMergeHook (...datasets) {
  return {
    type: 'after',
    data: { id: 'merged' },
    result: datasets.map(data => ({ data }))
  }
}

describe('krawler:hooks:json', () => {
  let directory, outputStore, templateStore

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'krawler-json-'))
    outputStore = fsStore({ path: path.join(directory, 'output') })
    templateStore = fsStore({ path: path.join(directory, 'templates') })
  })
  afterEach(async () => {
    await fs.remove(directory)
  })

  describe('writeJson', () => {
    it('writes JSON to an fs store and registers the output', async () => {
      const hook = makeHook({ name: 'example', count: 2 }, outputStore)
      const returned = await writeJson()(hook)
      expect(returned).toBe(hook)
      expect(await fs.readJson(path.join(outputStore.path, 'task.json'))).toEqual({ name: 'example', count: 2 })
      expect(hook.result.intermediate).toEqual(['task.json'])
    })
    it('uses the templated key, output type and transform options', async () => {
      const data = { value: 42, ignored: 'not exported' }
      const hook = makeHook(data, outputStore, 'sensor-1')
      await writeJson({
        key: '<%= id %>-data.json',
        outputType: 'final',
        transform: { pick: ['value'], inPlace: false }
      })(hook)
      expect(await fs.readJson(path.join(outputStore.path, 'sensor-1-data.json'))).toEqual({ value: 42 })
      expect(hook.result.final).toEqual(['sensor-1-data.json'])
      expect(hook.result.data).toEqual(data)
    })
    it('writes to a memory store', async () => {
      const store = createMemoryStore({}, 'test')
      const hook = makeHook({ value: 7 }, store)
      await writeJson()(hook)
      expect(JSON.parse(store.buffers['task.json'].toString())).toEqual({ value: 7 })
    })
    it('rejects a before hook', async () => {
      await expect(writeJson()({ type: 'before' })).rejects.toThrow(/after/)
    })
  })

  describe('readJson', () => {
    it('reads JSON from an fs store', async () => {
      const hook = makeHook({}, outputStore)
      await fs.outputJson(path.join(outputStore.path, 'task.json'), { count: 3 })
      const returned = await readJson({ key: '<%= id %>.json' })(hook)
      expect(returned).toBe(hook)
      expect(hook.result.data).toEqual({ count: 3 })
    })
    it('reads JSON from a memory store', async () => {
      const store = createMemoryStore({}, 'test')
      store.buffers['task.json'] = Buffer.from(JSON.stringify({ value: 12 }))
      const hook = makeHook({}, store)
      await readJson({ key: '<%= id %>.json' })(hook)
      expect(hook.result.data).toEqual({ value: 12 })
    })
    it('decodes a JSON string nested in a JSON value from memory', async () => {
      const store = createMemoryStore({}, 'test')
      store.buffers['task.json'] = Buffer.from(JSON.stringify(JSON.stringify({ value: 12 })))
      const hook = makeHook({}, store)
      await readJson({ key: '<%= id %>.json' })(hook)
      expect(hook.result.data).toEqual({ value: 12 })
    })
    it('extracts features from a GeoJSON FeatureCollection', async () => {
      const features = [{ type: 'Feature', properties: { id: 1 }, geometry: null }]
      const store = createMemoryStore({}, 'test')
      store.buffers['task.json'] = Buffer.from(JSON.stringify({ type: 'FeatureCollection', features }))
      const hook = makeHook({}, store)
      await readJson({ key: 'task.json', features: true })(hook)
      expect(hook.result.data).toEqual(features)
    })
    it('extracts an object path and transforms the resulting data', async () => {
      const store = createMemoryStore({}, 'test')
      store.buffers['task.json'] = Buffer.from(JSON.stringify({ payload: { items: [{ id: 1, unused: true }] } }))
      const hook = makeHook({}, store)
      await readJson({
        key: 'task.json',
        objectPath: 'payload.items',
        dataPath: 'result.items',
        transform: { pick: ['id'], inPlace: false }
      })(hook)
      expect(hook.result.items).toEqual([{ id: 1 }])
      expect(hook.result.data).toEqual({})
    })
    it('rejects a store that is neither fs nor memory', async () => {
      const hook = makeHook({}, {})
      await expect(readJson()(hook)).rejects.toThrow(/fs or memory blob store/)
    })
  })

  describe('transformJson', () => {
    it('transforms result data using mapping, pick and merge', () => {
      const hook = makeHook({ first: { speed: 10, nested: { value: 20 }, unused: true } })
      const returned = transformJson({
        toArray: true,
        mapping: { 'nested.value': 'value' },
        pick: ['speed', 'value'],
        merge: { source: 'converted' }
      })(hook)
      expect(returned).toBeUndefined()
      expect(hook.result.data).toEqual([{ speed: 10, value: 20, source: 'converted' }])
    })
    it('replaces a custom data path', () => {
      const hook = makeHook()
      hook.result.payload = { value: 5, unused: true }
      transformJson({ dataPath: 'result.payload', pick: ['value'] })(hook)
      expect(hook.result.payload).toEqual({ value: 5 })
    })
    it('preserves the root result reference when transforming result in place', () => {
      const hook = makeHook()
      hook.result.status = 'ok'
      hook.result.unused = true
      const result = hook.result
      transformJson({ dataPath: 'result', pick: ['id', 'status'], inPlace: false })(hook)
      expect(hook.result).toBe(result)
      expect(hook.result).toEqual({ id: 'task', status: 'ok' })
    })
    it('rejects a before hook', () => {
      expect(() => transformJson()({ type: 'before' })).toThrow(/after/)
    })
  })

  describe('mergeJson', () => {
    it('concatenates objects without deduplication by default', () => {
      const hook = makeMergeHook([{ id: 1 }], [{ id: 1 }, { id: 2 }])
      expect(mergeJson()(hook)).toBe(hook)
      expect(hook.result.data).toEqual([{ id: 1 }, { id: 1 }, { id: 2 }])
    })
    it('wraps non-array input values in arrays', () => {
      const hook = makeMergeHook({ id: 1 }, [{ id: 2 }])
      mergeJson()(hook)
      expect(hook.result.data).toEqual([{ id: 1 }, { id: 2 }])
    })
    it('deduplicates using mergeBy and sorts when requested', () => {
      const hook = makeMergeHook([{ id: 2 }, { id: 1, value: 'first' }], [{ id: 1, value: 'second' }])
      mergeJson({ mergeBy: 'id', sortBy: 'id' })(hook)
      expect(hook.result.data).toEqual([{ id: 1, value: 'first' }, { id: 2 }])
    })
    it('deep merges items with the same key', () => {
      const hook = makeMergeHook(
        [{ id: 1, details: { a: 1 } }, { id: 2, details: { c: 3 } }],
        [{ id: 1, details: { b: 2 } }]
      )
      mergeJson({ deep: true, mergeBy: 'id', transform: { inPlace: false } })(hook)
      expect(hook.result.data).toEqual([
        { id: 1, details: { a: 1, b: 2 } },
        { id: 2, details: { c: 3 } }
      ])
    })
    it('deduplicates merged items by id', () => {
      const hook = makeMergeHook(
        [{ id: 1, value: 'first' }],
        [{ id: 1, value: 'second' }, { id: 2 }]
      )
      mergeJson({ by: 'id' })(hook)
      expect(hook.result.data).toEqual([
        { id: 1, value: 'first' },
        { id: 2 }
      ])
    })
    it('rejects a before hook', () => {
      expect(() => mergeJson()({ type: 'before' })).toThrow(/after/)
    })
  })

  describe('writeTemplate', () => {
    it('renders a lodash template and registers the generated output', async () => {
      await fs.outputFile(path.join(templateStore.path, 'report.txt'), 'Station: <%= name %>\nCount: <%= count %>\n')
      const hook = makeHook({ name: 'A', count: 3 }, outputStore, 'report-1')
      hook.params.templateStore = templateStore
      expect(await writeTemplate({ templateFile: 'report.txt', templateStorePath: 'templateStore', outputType: 'final' })(hook)).toBe(hook)
      expect(await fs.readFile(path.join(outputStore.path, 'report-1.txt'), 'utf8')).toBe('Station: A\nCount: 3\n')
      expect(hook.result.final).toEqual(['report-1.txt'])
    })
    it('reads data from a custom path', async () => {
      await fs.outputFile(path.join(templateStore.path, 'report.txt'), '<%= title %>')
      const hook = makeHook({}, outputStore)
      hook.result.payload = { title: 'Custom payload' }
      hook.params.templateStore = templateStore
      await writeTemplate({ templateFile: 'report.txt', templateStorePath: 'templateStore', dataPath: 'result.payload' })(hook)
      expect(await fs.readFile(path.join(outputStore.path, 'task.txt'), 'utf8')).toBe('Custom payload')
    })
    it('rejects a non-fs output store', async () => {
      const hook = makeHook({}, createMemoryStore({}, 'output'))
      await expect(writeTemplate({ templateFile: 'report.txt' })(hook)).rejects.toThrow(/fs blob store/)
    })
    it('rejects a non-fs template store', async () => {
      const hook = makeHook({}, outputStore)
      hook.params.templateStore = createMemoryStore({}, 'templates')
      await expect(writeTemplate({ templateFile: 'report.txt', templateStorePath: 'templateStore' })(hook)).rejects.toThrow(/fs blob store/)
    })
    it('rejects a before hook', async () => {
      await expect(writeTemplate()({ type: 'before' })).rejects.toThrow(/after/)
    })
  })
})
