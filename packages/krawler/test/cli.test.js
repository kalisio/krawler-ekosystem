import path, { dirname } from 'path'
import _ from 'lodash'
import moment from 'moment'
import request from 'request'
import utils from 'util'
import fs from 'fs-extra'
import mongodb from 'mongodb'
import { exec } from 'child_process'
import { cli, getApp } from '../src/index.js'
import { fileURLToPath, pathToFileURL } from 'url'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const { MongoClient } = mongodb
// Can't use promisify here otherwise on error cases we cannot access stdout/stderr

async function runCommand (command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      resolve({ error, stdout, stderr })
    })
  })
}

describe('krawler:cli', () => {
  const jobfilePath = pathToFileURL(path.join(__dirname, 'data', 'jobfile.cjs'))
  let jobfile, outputPath, client, collection, appServer

  beforeAll(async () => {
    jobfile = (await import(jobfilePath)).default
    outputPath = _.get(jobfile, 'hooks.jobs.before.createStores[0].options.path')
    client = await MongoClient.connect('mongodb://127.0.0.1:27017/krawler-test')
    client.db = client.db('krawler-test')
  })

  it('runs successfully once using CLI', async () => {
    try {
      const tasks = await cli(jobfile, { port: 3030, messageTemplate: process.env.MESSAGE_TEMPLATE, debug: true, slackWebhook: process.env.SLACK_WEBHOOK_URL })
      // All other features should have been tested independently
      // so we just test here the CLI run correctly
      expect(tasks.length).toBe(1)
      // Check intermediate products have been erased and final product are here
      expect(fs.existsSync(path.join(outputPath, 'RJTT-30-18000-2-1.tif'))).toBe(false)
      expect(fs.existsSync(path.join(outputPath, 'RJTT-30-18000-2-1.tif.csv'))).toBe(true)
    } catch (error) {
      console.log(error)
      expect.fail('Healthcheck should not fail')
    }
  }, 10000)

  it('runs unsuccessfully once using CLI', async () => {
    try {
      await cli(jobfile, { port: 3030, maxDuration: 0, messageTemplate: process.env.MESSAGE_TEMPLATE, debug: true, slackWebhook: process.env.SLACK_WEBHOOK_URL })
      expect.fail('Healthcheck should fail')
    } catch (error) {
      // Check intermediate products have been erased and final product are here
      expect(fs.existsSync(path.join(outputPath, 'RJTT-30-18000-2-1.tif'))).toBe(false)
      expect(fs.existsSync(path.join(outputPath, 'RJTT-30-18000-2-1.tif.csv'))).toBe(true)
    }
  }, 10000)

  it('runs as API using CLI', async () => {
    try {
      // Clean previous test output
      fs.removeSync(path.join(outputPath, 'RJTT-30-18000-2-1.tif.csv'))
      appServer = await cli(jobfile, { mode: 'setup', api: true, apiPrefix: '/api', port: 3030, messageTemplate: process.env.MESSAGE_TEMPLATE, debug: true, slackWebhook: process.env.SLACK_WEBHOOK_URL })
      // Submit a job to be run
      const response = await utils.promisify(request.post)({
        url: 'http://localhost:3030/api/jobs',
        body: {
          id: 'job',
          store: 'job-store',
          tasks: [{
            id: 'RJTT-30-18000-2-1.tif',
            type: 'store',
            options: {
              store: 'task-store'
            }
          }]
        },
        json: true
      })
      const tasks = response.body
      await appServer.close()
      expect(tasks.length).toBe(1)
      // Check intermediate products have been erased and final product are here
      expect(fs.existsSync(path.join(outputPath, 'RJTT-30-18000-2-1.tif'))).toBe(false)
      expect(fs.existsSync(path.join(outputPath, 'RJTT-30-18000-2-1.tif.csv'))).toBe(true)
    } catch (error) {
      console.log(error)
      expect.fail('Healthcheck should not fail')
    }
  }, 15000)

  it('runs as CRON using CLI with continuous healthcheck', async () => {
    // As it runs every 10 seconds wait until some time before it starts
    let seconds = Math.floor(moment().seconds())
    let remainingSecondsForNextRun = 10 - seconds % 10
    await utils.promisify(setTimeout)((1 + remainingSecondsForNextRun) * 1000)
    // Clean previous test output
    fs.removeSync(path.join(outputPath, 'RJTT-30-18000-2-1.tif.csv'))
    // Setup the app
    appServer = await cli(jobfile, {
      mode: 'setup',
      sync: 'mongodb://127.0.0.1:27017/krawler-test',
      port: 3030,
      cron: '*/10 * * * * *',
      messageTemplate: process.env.MESSAGE_TEMPLATE,
      debug: false,
      slackWebhook: process.env.SLACK_WEBHOOK_URL
    })
    // Clean any previous healthcheck log
    fs.removeSync(path.join(__dirname, '..', 'healthcheck.log'))
    const app = getApp()
    // Add hook to know how many times the job will run
    const jobService = app.service('jobs')
    let runCount = 0
    jobService.hooks({
      after: {
        create: (hook) => {
          runCount++
          // First run is fine, second one raises an error
          if (runCount === 1) return hook
          else throw new Error('Test Error')
        }
      }
    })
    // Check for event emission
    let eventCount = 0
    app.on('krawler', event => {
      if ((event.name === 'task-done') || (event.name === 'job-done')) eventCount++
    })
    // Only run as we already setup the app
    await cli(jobfile, { mode: 'runJob', port: 3030, cron: '*/10 * * * * *', run: true, messageTemplate: process.env.MESSAGE_TEMPLATE, debug: false, slackWebhook: process.env.SLACK_WEBHOOK_URL })
    expect(runCount).toBe(1) // First run
    const response = await utils.promisify(request.get)('http://localhost:3030/healthcheck')
    // console.log(response.body)
    expect(response.statusCode).toBe(200)
    const healthcheck = JSON.parse(response.body)
    // console.log(healthcheck)
    const { error } = await runCommand('node ' + path.join(__dirname, '..', 'healthcheck.js'))
    expect(error).toBeNull()
    const healthcheckLog = fs.readJsonSync(path.join(__dirname, '..', 'healthcheck.log'))
    expect(healthcheck).toEqual(healthcheckLog)
    expect(healthcheck.isRunning).toBe(false)
    expect(healthcheck.nbSkippedJobs).toBe(0)
    expect(healthcheck.error).toBeUndefined()
    expect(healthcheck.nbFailedTasks).toBe(0)
    expect(healthcheck.nbSuccessfulTasks).toBe(1)
    expect(healthcheck.successRate).toBe(1)
    expect(healthcheck.state).toBeTruthy()
    expect(eventCount).toBe(2) // 2 events
    collection = client.db.collection('krawler-events')
    const taskEvents = await collection.find({ event: 'task-done' }).toArray()
    expect(taskEvents.length).toBe(1)
    const jobEvents = await collection.find({ event: 'job-done' }).toArray()
    expect(jobEvents.length).toBe(1)
    // As it runs every 10 seconds wait until it should have ran at least once again
    seconds = Math.floor(moment().seconds())
    remainingSecondsForNextRun = 10 - seconds % 10
    await utils.promisify(setTimeout)((1 + remainingSecondsForNextRun) * 1000)
    try {
      expect(runCount).toBeGreaterThanOrEqual(2) // 2 runs
      const response = await utils.promisify(request.get)('http://localhost:3030/healthcheck')
      // console.log(response.body)
      expect(response.statusCode).toBe(500)
      const healthcheck = JSON.parse(response.body)
      // console.log(healthcheck)
      const { error } = await runCommand('node ' + path.join(__dirname, '..', 'healthcheck.js'))
      expect(error).toBeTruthy()
      const healthcheckLog = fs.readJsonSync(path.join(__dirname, '..', 'healthcheck.log'))
      expect(healthcheck).toEqual(healthcheckLog)
      expect(healthcheck.isRunning).toBe(false)
      expect(healthcheck.duration).toBeUndefined()
      expect(healthcheck.nbSkippedJobs).toBe(0)
      expect(healthcheck.nbFailedTasks).toBeUndefined()
      expect(healthcheck.nbSuccessfulTasks).toBeUndefined()
      expect(healthcheck.successRate).toBeUndefined()
      expect(healthcheck.error).toBeTruthy()
      expect(healthcheck.error.message).toBeTruthy()
      expect(healthcheck.error.message).toBe('Test Error')
      expect(eventCount).toBeGreaterThanOrEqual(4) // 4 events
      collection = client.db.collection('krawler-events')
      const taskEvents = await collection.find({ event: 'task-done' }).toArray()
      expect(taskEvents.length).toBeGreaterThanOrEqual(2)
      const jobEvents = await collection.find({ event: 'job-done' }).toArray()
      expect(jobEvents.length).toBeGreaterThanOrEqual(2)
    } catch (error) {
      console.log(error)
      throw error
    }
  }, 30000)

  // Cleanup
  afterAll(async () => {
    fs.removeSync(path.join(__dirname, '..', 'healthcheck.log'))
    if (collection) await collection.drop()
    if (client) await client.close()
    if (appServer) await appServer.close()
  })
})
