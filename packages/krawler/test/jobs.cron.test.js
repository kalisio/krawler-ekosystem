import path, { dirname } from 'path'
import request from 'request'
import utils from 'util'
import moment from 'moment'
import { cli } from '../src/index.js'
import { fileURLToPath } from 'url'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
describe('krawler:jobs:cron', () => {
  let appServer

  beforeAll(async () => {
  })

  it('skipped job as CRON raises error', async () => {
    let count = 0
    appServer = await cli({
      id: 'job',
      tasks: [{ id: 'task', type: 'http', store: 'job-store', options: { url: 'https://www.google.com' } }],
      hooks: {
        tasks: {
          before: {
            apply: {
              function: async () => {
                if (count === 0) {
                  await utils.promisify(setTimeout)(10000)
                  count++
                }
              }
            }
          }
        },
        jobs: {
          before: {
            createStores: {
              id: 'job-store',
              type: 'fs',
              options: { path: path.join(__dirname, 'output') }
            }
          }
        }
      }
    }, {
      port: 3030,
      cron: '*/5 * * * * *',
      nbSkippedJobs: 1,
      messageTemplate: process.env.MESSAGE_TEMPLATE,
      debug: false,
      slackWebhook: process.env.SLACK_WEBHOOK_URL
    })
    // As it runs every 5 seconds wait until it should have ran at least twice
    const seconds = Math.floor(moment().seconds())
    const remainingSecondsForNextRun = 5 - seconds % 5
    await utils.promisify(setTimeout)((6 + remainingSecondsForNextRun) * 1000)
    // Check for error with healthcheck
    {
      const response = await utils.promisify(request.get)('http://localhost:3030/healthcheck')
      const healthcheck = JSON.parse(response.body)
      // console.log(healthcheck)
      expect(response.statusCode).toBe(500)
      expect(healthcheck.isRunning).toBe(true)
      expect(healthcheck.duration).toBeUndefined()
      expect(healthcheck.nbSkippedJobs).toBeGreaterThanOrEqual(1)
      expect(healthcheck.nbFailedTasks).toBeUndefined()
      expect(healthcheck.nbSuccessfulTasks).toBeUndefined()
      expect(healthcheck.successRate).toBeUndefined()
      expect(healthcheck.error).toBeTruthy()
      expect(healthcheck.error.message).toBeTruthy()
      expect(healthcheck.error.message.includes('Too much skipped jobs')).toBe(true)
    }
    await utils.promisify(setTimeout)(5000)
    // Now it should have finished
    {
      const response = await utils.promisify(request.get)('http://localhost:3030/healthcheck')
      const healthcheck = JSON.parse(response.body)
      // console.log(healthcheck)
      expect(response.statusCode).toBe(200)
      expect(healthcheck.isRunning).toBe(false)
      expect(healthcheck.duration).toBeTruthy()
      expect(healthcheck.nbSkippedJobs).toBe(0)
      expect(healthcheck.nbFailedTasks).toBe(0)
      expect(healthcheck.nbSuccessfulTasks).toBe(1)
      expect(healthcheck.successRate).toBe(1)
      expect(healthcheck.error).toBeUndefined()
    }
  }, 30000)

  // Cleanup
  afterAll(async () => {
    if (appServer) await appServer.close()
  })
})
