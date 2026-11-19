import net from 'node:net'
import { MongoClient, FindCursor } from 'mongodb'
import { createApp, destroyApp, getApp, getServer } from '../src/app.js'
import { Healthcheck } from '../src/healthcheck.js'
import logger from '../src/logger.js'

const dbUrl = 'mongodb://127.0.0.1:27017/krawler-test'
const unreachableDbUrl = 'mongodb://127.0.0.1:27999/krawler-test?serverSelectionTimeoutMS=500'
const channelName = 'krawler-events'
const port = 3030
const job = { id: 'sync-job', hooks: {} }

// A destroyed Mubsub connection may still be closing its MongoDB client.
async function waitForSyncClosure (connection) {
  await vi.waitFor(() => {
    expect(connection.state).toBe('destroyed')
    if (connection.client) expect(connection.client.topology).toBeUndefined()
  }, { timeout: 8000 })
}

async function waitForChannelReady (channel) {
  await vi.waitFor(() => expect(channel.listening).toBeTruthy(), { timeout: 5000 })
}

// Keep MongoDB's initial handshake blocked until the test releases it.
async function createPausedProxy () {
  const sockets = new Set()
  const pending = new Set()
  let released = false

  function forward (socket) {
    pending.delete(socket)
    if (socket.destroyed) return
    const upstream = net.connect(27017, '127.0.0.1')
    sockets.add(upstream)
    socket.on('error', () => upstream.destroy())
    upstream.on('error', () => socket.destroy())
    socket.pipe(upstream).pipe(socket)
    socket.resume()
  }

  const proxy = net.createServer(socket => {
    sockets.add(socket)
    socket.pause()
    if (released) forward(socket)
    else pending.add(socket)
  })

  await new Promise((resolve, reject) => {
    proxy.once('error', reject)
    proxy.listen(0, '127.0.0.1', resolve)
  })

  return {
    url: `mongodb://127.0.0.1:${proxy.address().port}/krawler-test?directConnection=true`,
    release () {
      released = true
      for (const socket of pending) forward(socket)
    },
    async close () {
      for (const socket of sockets) socket.destroy()
      await new Promise(resolve => proxy.close(resolve))
    }
  }
}

describe('krawler:app', () => {
  let client, collection, server, app, errorSpy, warnSpy

  beforeAll(async () => {
    client = await MongoClient.connect(dbUrl)
    collection = client.db().collection(channelName)
  })
  beforeEach(async () => {
    vi.stubEnv('SYNC_DB_URL', '')
    Healthcheck.error = null
    await collection.drop().catch(error => {
      if (error.codeName !== 'NamespaceNotFound') throw error
    })
    errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {})
    warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {})
  })
  afterEach(async () => {
    try {
      if (server) await destroyApp(server)
      if (app?.sync) await waitForSyncClosure(app.sync)
    } finally {
      vi.restoreAllMocks()
      vi.unstubAllEnvs()
      server = undefined
      app = undefined
    }
  })
  afterAll(async () => {
    if (client) {
      await client.db().collection(channelName).drop().catch(() => {})
      await client.close()
    }
  })

  it('creates the services and destroys an application without synchronization', async () => {
    server = await createApp(job, { port })
    app = getApp()
    expect(getServer()).toBe(server)
    expect(app.sync).toBeUndefined()
    expect(app.service('stores')).toBeDefined()
    expect(app.service('tasks')).toBeDefined()
    expect(app.service('jobs')).toBeDefined()
    await destroyApp(server)
    expect(server.listening).toBe(false)
  })
  it('restricts the API outside API mode and exposes the healthcheck', async () => {
    server = await createApp(job, { port })
    app = getApp()
    expect((await fetch(`http://127.0.0.1:${port}/jobs`)).status).toBe(405)
    expect((await fetch(`http://127.0.0.1:${port}/healthcheck`)).status).toBe(200)
  })
  it('exposes services when API mode is enabled', async () => {
    server = await createApp(job, { port, api: true, apiPrefix: '/api' })
    app = getApp()
    expect((await fetch(`http://127.0.0.1:${port}/api/stores`)).status).not.toBe(401)
  })
  it('publishes krawler events to the MongoDB channel', async () => {
    server = await createApp(job, { port, sync: dbUrl })
    app = getApp()
    expect(app.sync).toBeDefined()
    app.emit('krawler', { name: 'sync-test', data: { value: 1 } })
    await vi.waitFor(async () => {
      const event = await collection.findOne({ event: 'sync-test' })
      expect(event?.message).toEqual({ value: 1 })
    }, { timeout: 5000 })
  })
  it('handles errors emitted by the Mubsub connection', async () => {
    server = await createApp(job, { port, sync: dbUrl })
    app = getApp()
    expect(() => app.sync.emit('error', new Error('client failure'))).not.toThrow()
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('client failure'))
  })
  it('handles errors emitted by the Mubsub channel', async () => {
    server = await createApp(job, { port, sync: dbUrl })
    app = getApp()
    const channel = app.sync.channel(channelName)
    expect(() => channel.emit('error', new Error('channel failure'))).not.toThrow()
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('channel failure'))
  })
  it('logs errors passed to the publish callback', async () => {
    server = await createApp(job, { port, sync: dbUrl })
    app = getApp()
    const channel = app.sync.channel(channelName)
    vi.spyOn(channel, 'publish').mockImplementationOnce((event, data, callback) => {
      callback(new Error('publish failure'))
      return channel
    })
    app.emit('krawler', { name: 'failing-event', data: {} })
    expect(errorSpy).toHaveBeenCalledWith(expect.stringMatching(/failing-event.*publish failure/))
  })
  it('handles synchronous exceptions thrown by publish', async () => {
    server = await createApp(job, { port, sync: dbUrl })
    app = getApp()
    const channel = app.sync.channel(channelName)
    vi.spyOn(channel, 'publish').mockImplementationOnce(() => { throw new Error('synchronous failure') })
    expect(() => app.emit('krawler', { name: 'throwing-event', data: {} })).not.toThrow()
    expect(errorSpy).toHaveBeenCalledWith(expect.stringMatching(/throwing-event.*synchronous failure/))
    await destroyApp(server)
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('not published'))
  })
  it('waits for pending publications before destroying the application', async () => {
    server = await createApp(job, { port, sync: dbUrl })
    app = getApp()
    const channel = app.sync.channel(channelName)
    await waitForChannelReady(channel)
    const publish = channel.publish.bind(channel)
    vi.spyOn(channel, 'publish').mockImplementationOnce((event, data, callback) => {
      setTimeout(() => publish(event, data, callback), 200)
      return channel
    })
    app.emit('krawler', { name: 'delayed-event', data: {} })
    await destroyApp(server)
    expect(await collection.countDocuments({ event: 'delayed-event' })).toBe(1)
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('not published'))
  })
  it('ignores new events during shutdown and times out pending publications', async () => {
    server = await createApp(job, { port, sync: dbUrl })
    app = getApp()
    const channel = app.sync.channel(channelName)
    await waitForChannelReady(channel)
    const publish = vi.spyOn(channel, 'publish').mockImplementation(() => channel)
    app.emit('krawler', { name: 'pending-event', data: {} })
    const closeEvent = new Promise(resolve => server.once('close', resolve))
    const start = Date.now()
    const closing = destroyApp(server)
    await closeEvent
    app.emit('krawler', { name: 'late-event', data: {} })
    expect(publish).toHaveBeenCalledTimes(1)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('late-event event not published'))
    await closing
    expect(Date.now() - start).toBeGreaterThanOrEqual(4900)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('1 event(s) not published'))
    expect(channel.closed).toBe(true)
  }, 15000)
  it('closes the connected MongoDB client during application shutdown', async () => {
    server = await createApp(job, { port, sync: dbUrl })
    app = getApp()
    const channel = app.sync.channel(channelName)
    await waitForChannelReady(channel)
    const closeSpy = vi.spyOn(app.sync.client, 'close')
    await destroyApp(server)
    expect(closeSpy).toHaveBeenCalledTimes(1)
    expect(channel.closed).toBe(true)
    expect(app.sync.state).toBe('destroyed')
    expect(app.sync.client.topology).toBeUndefined()
  })
  it('closes a pending initial connection once it eventually connects', async () => {
    const proxy = await createPausedProxy()
    try {
      server = await createApp(job, { port, sync: proxy.url })
      app = getApp()
      await destroyApp(server)
      expect(app.sync.state).toBe('destroyed')
      expect(app.sync.client).toBeUndefined()
      proxy.release()
      await vi.waitFor(() => expect(app.sync.client).toBeDefined(), { timeout: 5000 })
      await waitForSyncClosure(app.sync)
    } finally {
      await proxy.close()
    }
  }, 12000)
  it('handles an unreachable MongoDB without crashing', async () => {
    server = await createApp(job, { port, sync: unreachableDbUrl })
    app = getApp()
    expect(() => app.emit('krawler', { name: 'lost-event', data: {} })).not.toThrow()
    await vi.waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('ECONNREFUSED'))
    }, { timeout: 5000 })
    await destroyApp(server)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('1 event(s) not published'))
  }, 12000)
  it('recreates the tailable cursor after a failure', async () => {
    server = await createApp(job, { port, sync: dbUrl })
    app = getApp()
    const channel = app.sync.channel(channelName)
    await waitForChannelReady(channel)
    expect(channel.transport).toBe('capped')
    // Simulate a failure on the next tailable cursor read
    const next = FindCursor.prototype.next
    let injected = false
    vi.spyOn(FindCursor.prototype, 'next').mockImplementation(function (...args) {
      if (!injected &&
          this.findOptions?.tailable &&
          this.namespace?.collection === channelName) {
        injected = true
        return Promise.reject(new Error('simulated cursor failure'))
      }
      return next.apply(this, args)
    })
    // Detect cursor recreation
    let recreated = 0
    channel.on('ready', () => { recreated++ })
    // Trigger another read on the cursor
    app.emit('krawler', { name: 'before-loss', data: {} })
    await vi.waitFor(() => {
      expect(injected).toBe(true)
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('simulated cursor failure')
      )
    }, { timeout: 5000 })
    // Mubsub should recreate the cursor
    await vi.waitFor(() => {
      expect(recreated).toBeGreaterThanOrEqual(1)
    }, { timeout: 10000 })
    // Publishing must still work after recovery
    app.emit('krawler', { name: 'after-loss', data: { recovered: true } })
    await vi.waitFor(async () => {
      const event = await collection.findOne({ event: 'after-loss' })
      expect(event?.message).toEqual({ recovered: true })
    }, { timeout: 5000 })
  }, 15000)
})
