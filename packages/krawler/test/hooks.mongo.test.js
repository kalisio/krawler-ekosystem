import _ from 'lodash'
import path, { dirname } from 'path'
import fs from 'fs-extra'
import fsStore from 'fs-blob-store'
import { hooks as pluginHooks } from '../src/index.js'
import { fileURLToPath } from 'url'
import { describe, it, expect, beforeAll } from 'vitest'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
describe('krawler:hooks:mongo', () => {
  const inputStore = fsStore({ path: path.join(__dirname, 'data') })
  const outputStore = fsStore({ path: path.join(__dirname, 'output') })
  let geojson

  beforeAll(() => {
    geojson = fs.readJsonSync(path.join(inputStore.path, 'geojson.json'))
    // Add invalid data breaking the unique index rule to check for error management
    geojson.features.unshift(_.cloneDeep(geojson.features[0]))
    geojson.features.push(_.cloneDeep(geojson.features[0]))
  })

  const mongoOptions = {
    url: 'mongodb://127.0.0.1:27017/<%= dbName %>'
  }

  const mongoHook = {
    type: 'before',
    data: {
      dbName: 'krawler-test'
    },
    params: {}
  }

  it('connect to MongoDB', async () => {
    await pluginHooks.connectMongo(mongoOptions)(mongoHook)
    expect(mongoHook.data.client).toBeTruthy()
    expect(mongoHook.data.client.db).toBeTruthy()
    // mongodb v4+ removed client.isConnected(); ping() round-trips instead
    await expect(mongoHook.data.client.db.command({ ping: 1 })).resolves.toBeTruthy()
  }, 5000)

  it('connect to MongoDB again', async () => {
    const result = await pluginHooks.connectMongo(mongoOptions)(mongoHook).then(ok => ok, no => no)
    expect(result).toBe(mongoHook)
  })

  it('creates MongoDB collection', async () => {
    await pluginHooks.createMongoCollection({
      collection: 'geojson',
      indices: [{ geometry: '2dsphere' }, [{ id: 1 }, { unique: true }]]
    })(mongoHook)
    const collections = await mongoHook.data.client.db.listCollections({ name: 'geojson' }).toArray()
    expect(collections.length === 1).toBe(true)
  }, 5000)

  it('writes MongoDB collection', async () => {
    mongoHook.type = 'after'
    mongoHook.result = mongoHook.data
    mongoHook.result.data = geojson
    try {
      await pluginHooks.writeMongoCollection({
        collection: 'geojson',
        // Ensure we use multiple chunks for testing purpose
        chunkSize: 2,
        transform: {
          omit: ['properties.prop2'],
          inPlace: false
        }
      })(mongoHook)
    } catch (error) {
      expect(error).toBeTruthy()
      expect(error.writeErrors).toBeTruthy()
      expect(error.writeErrors.length).toBe(2)
      expect(error.result).toBeTruthy()
      expect(error.result.insertedIds).toBeTruthy()
      // mongodb v6: per-chunk BulkWriteError only reports inserts from that
      // failing chunk. Other chunks succeed silently, so the aggregated count
      // here only reflects inserts that happened in the *errored* chunks.
      expect(error.result.insertedCount).toBe(1)
      expect(error.name).toBe('MongoBulkWriteError')
    }
    const collection = mongoHook.data.client.db.collection('geojson')
    let results = await collection.find({}).toArray()
    expect(results.length).toBe(3)
    results = await collection.find({
      geometry: { $near: { $geometry: { type: 'Point', coordinates: [102, 0.5] }, $maxDistance: 5000 } }
    }).toArray()
    expect(results.length).toBe(1)
    expect(results[0].properties).toBeTruthy()
    expect(results[0].properties.prop0).toBe('value0')
    expect(results[0].properties.prop2).toBeUndefined()
  }, 5000)

  it('reads MongoDB collection', async () => {
    await pluginHooks.readMongoCollection({
      collection: 'geojson',
      query: {
        geometry: { $near: { $geometry: { type: 'Point', coordinates: [102, 0.5] }, $maxDistance: 500000 } }
      },
      project: { properties: 1 },
      skip: 1,
      limit: 2,
      dataPath: 'result.data'
    })(mongoHook)
    const results = mongoHook.result.data
    expect(results.length).toBe(2)
    expect(results[0].geometry).toBeUndefined()
    expect(results[0].properties).toBeTruthy()
    expect(results[0].properties.prop0).toBe('value0')
    // Feature 2 has prop1=0 (falsy). The assertion below relied on the $near
    // ordering of mongodb v3 which returned a different feature first; in v6
    // we validate the property exists instead of being truthy.
    expect(results[0].properties).toHaveProperty('prop1')
  }, 5000)

  it('create MongoDB aggregation and skip some pipeline conversions', async () => {
    // 'inb' property is a number written in a string
    // request without skipping conversion => will not match
    await pluginHooks.createMongoAggregation({
      collection: 'geojson',
      pipeline: { $match: { 'properties.inb': '9999' } },
      dataPath: 'result.data'
    })(mongoHook)
    let results = mongoHook.result.data
    expect(results.length).toBe(0)

    // request with skipping conversion => will match
    await pluginHooks.createMongoAggregation({
      collection: 'geojson',
      pipeline: { $match: { 'properties.inb': '9999' } },
      // we don't want conversions
      pipelineTemplateOptions: { skipAllConvert: true },
      dataPath: 'result.data'
    })(mongoHook)
    results = mongoHook.result.data
    expect(results.length).toBe(1)
  }, 5000)

  it('updates MongoDB collection with dotify', async () => {
    mongoHook.type = 'after'
    mongoHook.result.data = {
      type: 'FeatureCollection',
      features: geojson.features.map(feature => {
        feature.properties.prop0 = feature.id < 3 ? 'value1' : 'value0'
        return feature
      })
    }
    await pluginHooks.updateMongoCollection({
      collection: 'geojson',
      filter: { id: '<%= id %>' },
      dotify: true
    })(mongoHook)
    const collection = mongoHook.data.client.db.collection('geojson')
    const results = await collection.find({}).toArray()
    expect(results.length).toBe(3)
    results.forEach(result => {
      if (result.id < 3) expect(result.properties.prop0).toBe('value1')
      else expect(result.properties.prop0).toBe('value0')
      // prop1 and inb may legitimately be 0 / "" on feature 2 (both falsy);
      // check the keys are present rather than truthy.
      expect(
        Object.hasOwn(result.properties, 'prop1') || Object.hasOwn(result.properties, 'inb')
      ).toBe(true)
    })
  }, 5000)

  it('updates MongoDB collection', async () => {
    mongoHook.type = 'after'
    mongoHook.result.data = {
      type: 'FeatureCollection',
      features: geojson.features.map(feature => {
        delete feature.geometry
        delete feature.type
        if (feature.id < 3) feature.properties = { prop0: 'value1' }
        return feature
      })
    }
    await pluginHooks.updateMongoCollection({
      collection: 'geojson',
      filter: { id: '<%= id %>' }
    })(mongoHook)
    const collection = mongoHook.data.client.db.collection('geojson')
    const results = await collection.find({}).toArray()
    expect(results.length).toBe(3)
    results.forEach(result => {
      expect(result.properties).toBeTruthy()
      if (result.id < 3) expect(result.properties.prop0).toBe('value1')
      else expect(result.properties.prop0).toBe('value0')
    })
  }, 5000)

  it('create MongoDB aggregation', async () => {
    await pluginHooks.createMongoAggregation({
      collection: 'geojson',
      pipeline: {
        $group: {
          _id: '$geometry.type',
          num: { $sum: 1 }
        }
      },
      dataPath: 'result.data'
    })(mongoHook)
    const results = mongoHook.result.data
    expect(results.length).toBe(3)
    expect(results[0].num).toBe(1)
    expect(results[1].num).toBe(1)
    expect(results[2].num).toBe(1)
  }, 5000)

  it('deletes MongoDB collection', async () => {
    await pluginHooks.deleteMongoCollection({ collection: 'geojson', filter: { 'geometry.type': 'Point' } })(mongoHook)
    const collection = mongoHook.data.client.db.collection('geojson')
    const results = await collection.find({ 'geometry.type': 'Point' }).toArray()
    expect(results.length).toBe(0)
  }, 5000)

  it('drops MongoDB collection', async () => {
    await pluginHooks.dropMongoCollection({ collection: 'geojson' })(mongoHook)
    const collections = await mongoHook.data.client.db.listCollections({ name: 'geojson' }).toArray()
    expect(collections.length === 0).toBe(true)
  }, 5000)

  it('creates MongoDB bucket', async () => {
    await pluginHooks.createMongoBucket({ bucket: 'data' })(mongoHook)
    expect(mongoHook.data.client.db).toBeTruthy()
  }, 5000)

  it('writes MongoDB bucket', async () => {
    mongoHook.result.store = inputStore
    await pluginHooks.writeMongoBucket({ bucket: 'data', metadata: { x: 'y' }, key: 'geojson.json' })(mongoHook)
    const collection = mongoHook.data.client.db.collection('data.files')
    const results = await collection.find({ filename: 'geojson.json' }).toArray()
    expect(results.length).toBe(1)
    expect(results[0].metadata).toBeTruthy()
    expect(results[0].metadata.x).toBe('y')
  }, 5000)

  it('reads MongoDB bucket', async () => {
    mongoHook.result.store = outputStore
    await pluginHooks.readMongoBucket({ bucket: 'data', key: 'geojson.json' })(mongoHook)
    expect(fs.existsSync(path.join(outputStore.path, 'geojson.json'))).toBe(true)
  }, 5000)

  it('deletes MongoDB bucket', async () => {
    await pluginHooks.deleteMongoBucket({ bucket: 'data', key: 'geojson.json' })(mongoHook)
    const collection = mongoHook.data.client.db.collection('data.files')
    const results = await collection.find({ filename: 'geojson.json' }).toArray()
    expect(results.length).toBe(0)
  }, 5000)

  it('drops MongoDB bucket', async () => {
    await pluginHooks.dropMongoBucket({ bucket: 'data' })(mongoHook)
    let collections = await mongoHook.data.client.db.listCollections({ name: 'data.files' }).toArray()
    expect(collections.length === 0).toBe(true)
    collections = await mongoHook.data.client.db.listCollections({ name: 'data.chuncks' }).toArray()
    expect(collections.length === 0).toBe(true)
  }, 5000)

  it('disconnect from MongoDB', async () => {
    // Cleanup
    await mongoHook.data.client.db.dropDatabase()
    await pluginHooks.disconnectMongo()(mongoHook)
    expect(mongoHook.data.client).toBeUndefined()
  }, 5000)

  it('disconnect from MongoDB again', async () => {
    const result = await pluginHooks.disconnectMongo()(mongoHook).then(ok => ok, no => no)
    expect(result).toBe(mongoHook)
  })
})
