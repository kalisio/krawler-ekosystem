import _ from 'lodash'
import compress from 'compression'
import cors from 'cors'
import helmet from 'helmet'
import feathers from '@feathersjs/feathers'
import express from '@feathersjs/express'
import socketio from '@feathersjs/socketio'
import { disallow } from 'feathers-hooks-common'
import distribution from '@kalisio/feathers-distributed'
import mubsub from 'mubsub-es'
import makeDebug from 'debug'
import * as hooks from './hooks/index.js'
import { stores, tasks, jobs } from './services/index.js'
import { Healthcheck } from './healthcheck.js'
import logger from './logger.js'
import plugin from './plugin.js'

const { rest } = express
const debug = makeDebug('krawler:app')

const SYNC_CHANNEL = 'krawler-events'
// Maximum time to wait for pending publications when closing (does not apply to the MongoDB connection)
const SYNC_CLOSE_TIMEOUT = 5000

// Create default services used by CLI
export const StoresService = stores()
export const TasksService = tasks()
export const JobsService = jobs()
let app
let server
let syncClosing

// Register all default hooks
_.forOwn(hooks, (hook, name) => hooks.registerHook(name, hook))

async function closeSync (connection, channel, publications) {
  // Let pending publications complete, eg the last events of a one-shot job, but do not wait
  // forever as they never complete if the channel cannot get ready (eg MongoDB unreachable).
  // The timeout only applies to publications: closing the MongoDB connection is not bounded and
  // a pending initial connection is not cancelled, it is only closed once established.
  if (publications.size > 0) {
    let timer
    const timeout = new Promise((resolve) => { timer = setTimeout(resolve, SYNC_CLOSE_TIMEOUT) })
    await Promise.race([Promise.all(publications), timeout])
    clearTimeout(timer)
    if (publications.size > 0) logger.warn(`Sync: ${publications.size} event(s) not published before closing`)
  }
  channel.close()
  if (!connection.client) {
    // The connection is not established yet: mubsub would open the client later
    // without ever closing it, so close it as soon as it is opened
    connection.close()
    connection.once('connect', () => connection.close())
    return
  }
  await new Promise((resolve) => {
    connection.close((error) => {
      if (error) logger.warn(`Sync: unable to close MongoDB connection (${error.message})`)
      resolve()
    })
  })
}

export async function createApp (job, options = {}) {
  debug('Initializing krawler application')
  app = express(feathers())
  // Enable CORS, security, compression, and body parsing
  app.use(cors())
  app.use(helmet())
  app.use(compress())
  app.use(express.json())
  app.use(express.urlencoded({ extended: true }))

  const apiPrefix = (options.api ? options.apiPrefix : '')
  debug('API prefix ' + apiPrefix)
  app.configure(rest())
  app.configure(socketio({
    path: apiPrefix + 'ws',
    transports: ['websocket']
  }))
  // Env var can be overridden by option
  const sync = options.sync || process.env.SYNC_DB_URL
  let syncChannel
  let isSyncClosing = false
  const syncPublications = new Set()
  syncClosing = undefined
  if (sync) {
    app.sync = mubsub(sync)
    // Without a listener an 'error' event is thrown and kills the process, eg when the initial connection fails
    app.sync.on('error', (error) => {
      logger.error(`Sync: MongoDB connection error (${error.message})`)
    })
    syncChannel = app.sync.channel(SYNC_CHANNEL)
    // Mubsub recreates the tailable cursor of the channel on error (recreate option),
    // eg when its position in the capped collection has been lost, but only if the error is handled
    syncChannel.on('error', (error) => {
      if (syncChannel.closed) debug(`Sync: channel error after close (${error.message})`)
      else logger.warn(`Sync: channel error (${error.message})`)
    })
    app.on('krawler', (event) => {
      // New publications could be left pending or published on a closed channel
      if (isSyncClosing) {
        logger.warn(`Sync: closing, ${event.name} event not published`)
        return
      }
      const publication = new Promise((resolve) => {
        const onPublished = (error) => {
          if (error) logger.error(`Sync: unable to publish ${event.name} event (${error.message})`)
          resolve()
        }
        // Asynchronous errors are given to the callback but publish might also throw
        try {
          syncChannel.publish(event.name, event.data, onPublished)
        } catch (error) {
          onPublished(error)
        }
      })
      // Keep track of pending publications so that closing can wait for them
      syncPublications.add(publication)
      publication.then(() => syncPublications.delete(publication))
    })
  }
  // Configure distribution

  if (_.has(job, 'options.distribution')) {
    app.configure(distribution({
      // Distribute no services simply use remote ones by default
      services: (service) => false,
      key: 'krawler',
      healthcheckPath: apiPrefix + '/distribution/',
      ..._.get(job, 'options.distribution')
    }))
  }
  // In API mode everything is open, otherwise only health check is
  app.use('/', (req, res, next) => {
    if (options.api) next()
    else if (req.originalUrl.endsWith('/healthcheck')) next()
    else res.sendStatus(401)
  })
  // Add a healthcheck for cron jobs
  app.get(apiPrefix + '/healthcheck', (req, res, next) => {
    if (Healthcheck.error) {
      res.status(500).json(_.pick(Healthcheck, ['jobId', 'nbSkippedJobs', 'isRunning', 'error.code', 'error.message']))
    } else {
      res.status(200).json(_.omit(Healthcheck, ['error']))
    }
  })
  app.configure(plugin())
  // Setup default services used by CLI
  TasksService.storesService = apiPrefix + '/stores'
  JobsService.storesService = apiPrefix + '/stores'
  JobsService.tasksService = apiPrefix + '/tasks'
  app.use(apiPrefix + '/stores', StoresService)
  app.use(apiPrefix + '/tasks', TasksService)
  app.use(apiPrefix + '/jobs', JobsService)
  // In API mode everything is open, otherwise only health check is
  if (!options.api) {
    app.service(apiPrefix + '/stores').hooks({ before: { all: [disallow('external')] } })
    app.service(apiPrefix + '/tasks').hooks({ before: { all: [disallow('external')] } })
    app.service(apiPrefix + '/jobs').hooks({ before: { all: [disallow('external')] } })
  } else {
    // Keep track of options and task template as in this case the job is not executed
    // but only the hooks are processed when initializing the app
    JobsService.jobOptions = job.options
    JobsService.taskTemplate = job.taskTemplate
  }
  // Process hooks
  _.forOwn(job.hooks, (value, key) => {
    const service = app.service(apiPrefix + '/' + key)
    hooks.activateHooks(value, service)
  })
  // Run the app, this is required to correctly setup Feathers
  const port = options.port || 3030
  if (options.api) logger.info('Server listening to ' + port)
  server = await app.listen(port)
  if (sync) {
    const syncConnection = app.sync
    server.on('close', () => {
      isSyncClosing = true
      syncClosing = closeSync(syncConnection, syncChannel, syncPublications)
    })
  }
  return server
}

export function getApp () {
  return app
}

export function getServer () {
  return server
}

// Stop the HTTP server and wait for the associated Mubsub shutdown.
// As in closeSync(), an initial MongoDB connection still pending is not awaited.
export async function destroyApp (instance = server) {
  if (!instance) return
  if (instance.listening) {
    await new Promise((resolve, reject) => {
      instance.close(error => error ? reject(error) : resolve())
    })
  }
  await syncClosing
}
