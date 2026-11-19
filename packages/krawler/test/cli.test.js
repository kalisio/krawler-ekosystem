import { execFile } from 'node:child_process'
import { EventEmitter } from 'node:events'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { CronJob } from 'cron'
import { createApp, destroyApp, getApp, getServer } from '../src/app.js'
import { Healthcheck, healthcheck } from '../src/healthcheck.js'
import { cli, run, runJob } from '../src/cli.js'
import logger from '../src/logger.js'

// This suite exercises CLI orchestration, not Feathers/Mubsub internals.
// Those are covered by app.test.js with a real MongoDB instance.
vi.mock('../src/app.js', () => ({
  createApp: vi.fn(),
  destroyApp: vi.fn(),
  getApp: vi.fn(),
  getServer: vi.fn()
}))
vi.mock('../src/healthcheck.js', () => ({
  Healthcheck: {},
  healthcheck: vi.fn()
}))
vi.mock('cron', () => ({
  CronJob: class CronJob {
    static instances = []
    constructor (expression, tick) {
      this.expression = expression
      this.tick = tick
      this.start = vi.fn()
      this.stop = vi.fn()
      CronJob.instances.push(this)
    }
  }
}))

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const packageDir = path.join(__dirname, '..')
const job = { id: 'cli-job', hooks: {} }

function runFile (file, args = []) {
  return new Promise(resolve => {
    execFile(process.execPath, [file, ...args], {
      cwd: packageDir,
      timeout: 15000
    }, (error, stdout, stderr) => resolve({ error, stdout, stderr }))
  })
}

describe('krawler:cli', () => {
  let server, tasksService

  beforeEach(() => {
    vi.resetAllMocks()
    CronJob.instances.length = 0
    for (const name of Object.keys(Healthcheck)) delete Healthcheck[name]
    Healthcheck.isRunning = false
    tasksService = { create: vi.fn().mockResolvedValue([{ id: 'task-1' }]) }
    server = new EventEmitter()
    createApp.mockResolvedValue(server)
    destroyApp.mockResolvedValue(undefined)
    getApp.mockReturnValue({ service: vi.fn().mockReturnValue(tasksService) })
    getServer.mockReturnValue(server)
    healthcheck.mockResolvedValue(undefined)
    vi.spyOn(logger, 'info').mockImplementation(() => {})
    vi.spyOn(logger, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('dispatches setup mode to createApp without running a job', async () => {
    const options = { mode: 'setup', port: 3030 }
    expect(await cli(job, options)).toBe(server)
    expect(createApp).toHaveBeenCalledTimes(1)
    expect(createApp).toHaveBeenCalledWith(job, options)
    expect(tasksService.create).not.toHaveBeenCalled()
    expect(destroyApp).not.toHaveBeenCalled()
  })
  it('dispatches runJob mode without creating or destroying the application', async () => {
    const tasks = await cli(job, { mode: 'runJob' })
    expect(tasks).toEqual([{ id: 'task-1' }])
    expect(tasksService.create).toHaveBeenCalledTimes(1)
    expect(tasksService.create).toHaveBeenCalledWith(job)
    expect(createApp).not.toHaveBeenCalled()
    expect(destroyApp).not.toHaveBeenCalled()
  })
  it('runs a job and computes its success ratio', async () => {
    tasksService.create.mockResolvedValue([
      { id: 'successful-task' },
      { id: 'failed-task', error: new Error('task failure') }
    ])
    const tasks = await runJob(job)
    expect(tasks).toHaveLength(2)
    expect(Healthcheck.isRunning).toBe(false)
    expect(Healthcheck.error).toBeNull()
    expect(Healthcheck.nbSuccessfulTasks).toBe(1)
    expect(Healthcheck.nbFailedTasks).toBe(1)
    expect(Healthcheck.successRate).toBe(0.5)
    expect(Healthcheck.duration).toEqual(expect.any(Number))
  })
  it('logs job failures and stores the error in Healthcheck', async () => {
    const failure = new Error('job failure')
    tasksService.create.mockRejectedValue(failure)
    expect(await runJob(job)).toBeUndefined()
    expect(Healthcheck.isRunning).toBe(false)
    expect(Healthcheck.error).toBe(failure)
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('job failure'))
  })
  it('stops the application after a one-shot run', async () => {
    const tasks = await run(job, { port: 3030 })
    expect(tasks).toEqual([{ id: 'task-1' }])
    expect(createApp).toHaveBeenCalledTimes(1)
    expect(createApp).toHaveBeenCalledWith(job, { port: 3030 })
    expect(tasksService.create).toHaveBeenCalledTimes(1)
    expect(tasksService.create).toHaveBeenCalledWith(job)
    expect(destroyApp).toHaveBeenCalledTimes(1)
    expect(destroyApp).toHaveBeenCalledWith(server)
    expect(tasksService.create.mock.invocationCallOrder[0]).toBeLessThan(destroyApp.mock.invocationCallOrder[0])
  })
  it('runs in default CLI mode and destroys the application', async () => {
    expect(await cli(job, { port: 3030 })).toEqual([{ id: 'task-1' }])
    expect(createApp).toHaveBeenCalledTimes(1)
    expect(destroyApp).toHaveBeenCalledTimes(1)
    expect(destroyApp).toHaveBeenCalledWith(server)
  })
  it('starts a scheduled job without destroying the application', async () => {
    const result = await run(job, { cron: '*/5 * * * * *' })
    expect(result).toBe(server)
    expect(CronJob.instances).toHaveLength(1)
    expect(CronJob.instances[0].start).toHaveBeenCalledTimes(1)
    expect(tasksService.create).not.toHaveBeenCalled()
    expect(destroyApp).not.toHaveBeenCalled()
    server.emit('close')
    expect(CronJob.instances[0].stop).toHaveBeenCalledTimes(1)
  })
  it('runs a scheduled job immediately when run is enabled', async () => {
    const result = await run(job, { cron: '*/5 * * * * *', run: true })
    expect(result).toEqual([{ id: 'task-1' }])
    expect(CronJob.instances[0].start).toHaveBeenCalledTimes(1)
    expect(tasksService.create).toHaveBeenCalledTimes(1)
    expect(tasksService.create).toHaveBeenCalledWith(job)
    expect(destroyApp).not.toHaveBeenCalled()
    server.emit('close')
  })
  it('runs scheduled ticks and performs a healthcheck', async () => {
    const options = { cron: '*/5 * * * * *' }
    await runJob(job, options)
    await CronJob.instances[0].tick()
    expect(tasksService.create).toHaveBeenCalledTimes(1)
    expect(tasksService.create).toHaveBeenCalledWith(job)
    expect(healthcheck).toHaveBeenCalledTimes(1)
    expect(healthcheck).toHaveBeenCalledWith(options)
    expect(Healthcheck.nbSkippedJobs).toBe(0)
    server.emit('close')
  })
  it('skips overlapping scheduled runs', async () => {
    const options = { cron: '*/5 * * * * *' }
    await runJob(job, options)
    Healthcheck.isRunning = true
    await CronJob.instances[0].tick()
    expect(tasksService.create).not.toHaveBeenCalled()
    expect(Healthcheck.nbSkippedJobs).toBe(1)
    expect(healthcheck).toHaveBeenCalledTimes(1)
    expect(healthcheck).toHaveBeenCalledWith(options)
    server.emit('close')
  })
  it('loads Commander with native Node ESM and parses the options', async () => {
    // Vitest may transform ESM imports. Run an unmocked child process like the CI healthcheck does.
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'krawler-cli-'))
    try {
      const jobfile = path.join(tmp, 'jobfile.cjs')
      const runner = path.join(tmp, 'runner.mjs')
      const cliUrl = pathToFileURL(path.join(packageDir, 'src', 'cli.js')).href
      await fs.writeFile(jobfile, "module.exports = { id: 'parsed-job', hooks: {} }\n")
      await fs.writeFile(runner, `
        import { processOptions } from ${JSON.stringify(cliUrl)}
        const options = await processOptions()
        console.log(JSON.stringify({
          jobId: options.job.id,
          mode: options.mode,
          apiPrefix: options.apiPrefix,
          sync: options.sync
        }))
      `)
      // Without a jobfile, Commander should display help and exit successfully
      const noArgs = await runFile(runner)
      expect(noArgs.error, noArgs.stderr).toBeNull()
      expect(noArgs.stdout).toContain('Usage:')
      expect(noArgs.stdout).toContain('jobfile')
      // With a jobfile
      const { error, stdout, stderr } = await runFile(runner, [
        jobfile, '--api', '--api-prefix', '/api', '--sync', 'mongodb://127.0.0.1:27017/test'
      ])
      expect(error, stderr).toBeNull()
      expect(JSON.parse(stdout.trim().split('\n').at(-1))).toEqual({
        jobId: 'parsed-job',
        mode: 'setup',
        apiPrefix: '/api',
        sync: 'mongodb://127.0.0.1:27017/test'
      })
    } finally {
      await fs.rm(tmp, { recursive: true, force: true })
    }
  }, 20000)
})
