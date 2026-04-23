import _ from 'lodash'
import mongo from 'mongodb'
import feathers from '@feathersjs/feathers'
import express from '@feathersjs/express'
import path, { dirname } from 'path'
import utility from 'util'
import fs from 'fs-extra'
import nock from 'nock'
import moment from 'moment'
import plugin, { hooks as pluginHooks } from '../src/index.js'
import { fileURLToPath } from 'url'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const { MongoClient } = mongo
// WCS task hits a Météo-France endpoint that requires a secret token (injected
// in CI via SOPS); skip when the token is missing.
const itWcs = process.env.METEO_FRANCE_TOKEN ? it : it.skip

describe('krawler:tasks', () => {
  let app, server, mongoClient, storage, storageExists, fileStats, storesService, tasksService

  beforeAll(async () => {
    app = express(feathers())
    app.configure(plugin())
    mongoClient = await MongoClient.connect('mongodb://127.0.0.1:27017/krawler-test')
    mongoClient.db = mongoClient.db('krawler-test')
    server = await app.listen(3030)
  })

  it('creates the storage', async () => {
    app.use('stores', plugin.stores())
    storesService = app.service('stores')
    storage = await storesService.create({ id: 'test-store', type: 'fs', options: { path: path.join(__dirname, 'output') } })
    // Use a promisified version of this method to ease testing
    storageExists = utility.promisify(storage.exists).bind(storage)
  })

  it('creates the tasks service', () => {
    app.use('tasks', plugin.tasks())
    tasksService = app.service('tasks')
    expect(tasksService).toBeTruthy()
  })

  it('creates a mongo task', async () => {
    const json = []
    for (let i = 0; i < 10; i++) {
      json.push({ name: i.toString() })
    }
    await mongoClient.db.collection('users').insertMany(json)
    await tasksService.create({
      id: 'task.mongo',
      store: 'test-store',
      type: 'mongo',
      options: {
        client: mongoClient,
        collection: 'users',
        query: { name: { $ne: '0' } },
        limit: 8
      }
    })
    const exist = await storageExists('task.mongo')
    expect(exist).toBe(true)
    const jsonFile = fs.readJsonSync(path.join(storage.path, 'task.mongo'))
    expect(jsonFile.length).equal(8)
    jsonFile.forEach((object, index) => {
      expect(object._id).toBeTruthy()
      // Mongo adds IDs
      // Take care that we filter the first item in the collection
      expect(_.omit(object, ['_id'])).deep.equal(_.omit(json[index + 1], ['_id']))
    })
  }, 10000)

  it('creates a HTTP task', async () => {
    nock('https://www.google.com')
      .get('/')
      .reply(200, '<html></html>')
    await tasksService.create({
      id: 'task.html',
      store: 'test-store',
      type: 'http',
      options: {
        url: 'https://www.google.com'
      }
    })
    const exist = await storageExists('task.html')
    expect(exist).toBe(true)
    fileStats = fs.statSync(path.join(storage.path, 'task.html'))
  }, 10000)

  it('creates a HTTP task without overwrite', async () => {
    await tasksService.create({
      id: 'task.html',
      store: 'test-store',
      type: 'http',
      overwrite: false,
      options: {
        url: 'https://www.google.com'
      }
    })
    const exist = await storageExists('task.html')
    expect(exist).toBe(true)
    const stats = fs.statSync(path.join(storage.path, 'task.html'))
    expect(stats.birthtimeMs).toBe(fileStats.birthtimeMs)
  }, 10000)

  it('creates a HTTP task with POST method', async () => {
    nock('https://www.google.com')
      .post('/')
      .reply(200, '<html></html>')
    await tasksService.create({
      id: 'post-task.html',
      store: 'test-store',
      type: 'http',
      options: {
        url: 'https://www.google.com',
        method: 'POST'
      }
    })
    const exist = await storageExists('post-task.html')
    expect(exist).toBe(true)
  }, 10000)

  it('creates an empty HTTP task (204)', async () => {
    nock('https://www.google.com')
      .get('/')
      .reply(204)
    await tasksService.create({
      id: 'task-204.html',
      store: 'test-store',
      type: 'http',
      options: {
        url: 'https://www.google.com'
      },
      response: {
        204: '{ "content": [] }'
      }
    })
    const exist = await storageExists('task-204.html')
    expect(exist).toBe(true)
    const json = fs.readJsonSync(path.join(__dirname, 'output/task-204.html'))
    expect(json).toEqual({ content: [] })
  }, 5000)

  it('creates a failed HTTP task (403)', async () => {
    nock('https://www.google.com')
      .get('/')
      .reply(403)
    await expect(tasksService.create({
      id: 'task-403.html',
      store: 'test-store',
      type: 'http',
      options: {
        url: 'https://www.google.com'
      }
    })).rejects.toBeTruthy()
  }, 5000)

  it('creates a failed HTTP task (timeout)', async () => {
    nock('https://www.google.com')
      .get('/')
      .delay(10000)
      .reply(200, '<html></html>')
    await expect(tasksService.create({
      id: 'task-timeout.html',
      store: 'test-store',
      type: 'http',
      options: {
        url: 'https://www.google.com',
        timeout: 5000
      }
    })).rejects.toBeTruthy()
  }, 10000)

  itWcs('creates a WCS task', async () => {
    const datetime = moment.utc()
    datetime.startOf('day')
    // console.log('TEMPERATURE__SPECIFIC_HEIGHT_LEVEL_ABOVE_GROUND' + '___' + datetime.format())
    await tasksService.create({
      id: 'task.tif',
      store: 'test-store',
      type: 'wcs',
      options: {
        url: 'https://public-api.meteofrance.fr/public/arpege/1.0/wcs/MF-NWP-GLOBAL-ARPEGE-025-GLOBE-WCS/GetCoverage',
        version: '2.0.1',
        apikey: process.env.METEO_FRANCE_TOKEN,
        coverageid: 'TEMPERATURE__SPECIFIC_HEIGHT_LEVEL_ABOVE_GROUND' + '___' + datetime.format(),
        subsets: {
          height: 2,
          time: datetime.format()
        }
      }
    })
    const exist = await storageExists('task.tif')
    expect(exist).toBe(true)
  }, 30000)

  it('creates a WFS task', async () => {
    await tasksService.create({
      id: 'task.xml',
      store: 'test-store',
      type: 'wfs',
      options: {
        url: 'https://data.geopf.fr/wfs/ows',
        version: '1.1.0',
        typename: 'PROTECTEDAREAS.RIPN:ripn',
        featureID: 'ripn.2'
      }
    })
    const exist = await storageExists('task.xml')
    expect(exist).toBe(true)
  }, 30000)

  it('creates an OVERPASS task', async () => {
    await tasksService.create({
      id: 'overpass.json',
      store: 'test-store',
      type: 'overpass',
      options: {
        data: '[out:json][timeout:25][bbox:43.10,1.36,43.70,1.39];(node["aeroway"="runway"];way["aeroway"="runway"];relation["aeroway"="runway"];);out body;>;out skel qt;'
      }
    })
    const exist = await storageExists('overpass.json')
    expect(exist).toBe(true)
  }, 30000)

  it('removes a task', async () => {
    await tasksService.remove('task.tif', { store: storage })
    const exist = await storageExists('task.tif')
    expect(exist).toBe(false)
  })

  it('run a task as hook', async () => {
    nock('https://www.google.com')
      .get('/')
      .reply(200, '<html></html>')
    const taskHook = {
      type: 'before',
      service: tasksService,
      data: {}
    }
    await pluginHooks.runTask({
      id: 'task.hook.html',
      store: 'test-store',
      type: 'http',
      options: {
        url: 'https://www.google.com'
      }
    })(taskHook)

    const exist = await storageExists('task.hook.html')
    expect(exist).toBe(true)
  }, 5000)

  // Cleanup
  afterAll(async () => {
    if (mongoClient) {
      await mongoClient.db.dropDatabase()
      await mongoClient.close()
    }
    if (server) server.close()
  })
})
