import _ from 'lodash'
import fs from 'fs-extra'
import path from 'path'
import { pathToFileURL, fileURLToPath } from 'url'
import { performance } from 'perf_hooks'
import boxen from 'boxen'
import { Command } from 'commander'
import { CronJob } from 'cron'
import { healthcheck, Healthcheck } from './healthcheck.js'
import logger from './logger.js'
import { createApp, destroyApp, getApp, getServer } from './app.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export async function runJob (job, options = {}) {
  // Function to effectively run the job
  async function runJobWithOptions () {
    logger.info('\n' + boxen(`Launching job at ${(new Date()).toISOString()}`, {
      title: _.toUpper(job.id),
      titleAlignment: 'center',
      width: 80,
      padding: { top: 1, bottom: 1 }
    }))
    const startTime = performance.now()
    // console.time('Running time')
    Healthcheck.jobId = job.id
    Healthcheck.isRunning = true
    const hrstart = process.hrtime()
    try {
      const tasks = await getApp().service('jobs').create(job)
      // It appears that if a before hook fails on a job with error hooks
      // the operation finishes without error but the return object is the job itself
      if (tasks.error) throw tasks.error
      const duration = (performance.now() - startTime) / 1000
      logger.info(boxen(`Job terminated: ${tasks.length} tasks ran in ${duration.toFixed(4)} seconds`, {
        title: _.toUpper(job.id),
        titleAlignment: 'center',
        borderColor: 'green',
        width: 80,
        padding: { top: 1, bottom: 1 }
      }))
      const hrend = process.hrtime(hrstart)
      Healthcheck.isRunning = false
      Healthcheck.duration = hrend[0] + (hrend[1] / 1e9)
      Healthcheck.error = null
      // Compute the error ratio for fault-tolerant jobs
      Healthcheck.nbFailedTasks = 0
      Healthcheck.nbSuccessfulTasks = 0
      tasks.forEach(task => {
        if (task.error) Healthcheck.nbFailedTasks++
        else Healthcheck.nbSuccessfulTasks++
      })
      const nbTotalTasks = (Healthcheck.nbSuccessfulTasks + Healthcheck.nbFailedTasks)
      // Job with 0 tasks is always succesful
      Healthcheck.successRate = (nbTotalTasks > 0 ? Healthcheck.nbSuccessfulTasks / nbTotalTasks : 1)
      return tasks
    } catch (error) {
      logger.error(boxen(error.message, {
        title: _.toUpper(job.id),
        titleAlignment: 'center',
        borderColor: 'red',
        width: 80,
        padding: { top: 1, bottom: 1 }
      }))
      Healthcheck.isRunning = false
      Healthcheck.error = error
    }
  }

  // Setup CRON job if required
  let cronJob
  if (options.cron) {
    logger.info('Scheduling job with cron pattern ' + options.cron)
    Healthcheck.nbSkippedJobs = 0
    cronJob = new CronJob(options.cron, async () => {
      // If last job has not yet finished skip this call as we are late
      if (!Healthcheck.isRunning) {
        await runJobWithOptions()
        Healthcheck.nbSkippedJobs = 0
      } else {
        logger.info('Skipping scheduled job as previous one has not yet finished')
        Healthcheck.nbSkippedJobs++
      }
      try {
        // Check if run has to be considered as successful
        await healthcheck(options)
      } catch (error) {
        // Healthcheck is already writing to stderr
        // console.error(error)
        Healthcheck.error = error
      }
    })
    // In case the server is forced to exit stop the job as well
    getServer().on('close', () => {
      cronJob.stop()
      logger.info('Stopped scheduled job with cron pattern')
    })
  }
  // Run job
  let tasks
  if (cronJob) {
    cronJob.start()
    // Force run on start ?
    if (options.run) tasks = await runJobWithOptions()
  } else {
    tasks = await runJobWithOptions()
  }
  return tasks
}

export async function run (job, options = {}) {
  const server = await createApp(job, options)
  const tasks = await runJob(job, options)
  if (!options.cron) {
    // Stop the HTTP server and wait for the sync before the CLI exits.
    await destroyApp(server)
  }
  return (tasks || server)
}

export async function processOptions () {
  const packageInfo = fs.readJsonSync(path.join(__dirname, '..', 'package.json'))

  const program = new Command('krawler')
  program
    .version(packageInfo.version)
    .usage('<jobfile> [options]')
    .argument('[jobfile]')
    .option('-d, --debug', 'Verbose output for debugging')
    .option('-a, --api', 'Setup as web app by exposing an API')
    .option('--api-prefix [prefix]', 'When exposed as an API change the prefix (defaults to /api)', '/api')
    .option('--port [port]', 'Change the port to be used (defaults to 3030)', process.env.PORT ? Number(process.env.PORT) : 3030)
    .option('-c, --cron [pattern]', 'Schedule job using a cron pattern')
    .option('-r, --run', 'Force a first run on launch when scheduling job using a cron pattern')
    .option('-P, --proxy [proxy]', 'Proxy to be used for HTTP (and HTTPS)')
    .option('--proxy-https [proxy-https]', 'Proxy to be used for HTTPS')
    .option('-u, --user [user]', 'User name to be used for authentication')
    .option('-p, --password [password]', 'Password to be used for authentication')
    .option('-s, --sync [uri]', 'Activate sync module with given connection URI')
    .option('--success-rate [rate]', 'Change the success rate for fault-tolerant jobs to be considered as successful (defaults to 1)', process.env.SUCCESS_RATE ? Number(process.env.SUCCESS_RATE) : 1)
    .option('--max-duration [duration]', 'Change the maximum run duration in seconds for fault-tolerant jobs to be considered as failed (defaults to unset)', process.env.MAX_DURATION ? Number(process.env.MAX_DURATION) : -1)
    .option('--nb-skipped-jobs [nb]', 'Change the number of skipped runs for fault-tolerant jobs to be considered as failed (defaults to 3)', process.env.NB_SKIPPED_JOBS ? Number(process.env.NB_SKIPPED_JOBS) : 3)
    .option('--slack-webhook [url]', 'Slack webhook URL to post messages on failure', process.env.SLACK_WEBHOOK_URL)
    .option('--message-template [template]', 'Message template used on failure', process.env.MESSAGE_TEMPLATE || 'Job <%= jobId %>: <%= error.message %>')
    .option('--link-template [template]', 'Link template used on failure', process.env.LINK_TEMPLATE || '')
    .allowUnknownOption()
    .allowExcessArguments()

  // Legacy multi-character short options supported by previous versions
  const legacyOptions = {
    '-ap': '--api-prefix',
    '-po': '--port',
    '-PS': '--proxy-https',
    '-sr': '--success-rate',
    '-md': '--max-duration',
    '-nsj': '--nb-skipped-jobs',
    '-sw': '--slack-webhook',
    '-mt': '--message-template',
    '-lt': '--link-template'
  }

  const argv = process.argv.map(arg => legacyOptions[arg] || arg)
  program.parse(argv)

  const programArgs = program.args
  const programOptions = program.opts()

  if (!programArgs[0]) {
    program.outputHelp()
    process.exit(0)
  }

  // Setup env vars before reading job file
  if (programOptions.proxy) process.env.HTTP_PROXY = programOptions.proxy
  if (programOptions.proxyHttps) process.env.HTTPS_PROXY = programOptions.proxyHttps
  if (programOptions.debug) process.env.DEBUG = 'krawler*'
  if (programOptions.user) process.env.USER_NAME = programOptions.user
  if (programOptions.password) process.env.USER_PASSWORD = programOptions.password

  const jobfile = path.resolve(programArgs[0])
  const { default: job } = await import(pathToFileURL(jobfile).href)

  return {
    ...programOptions,
    jobfile,
    job,
    ...(programOptions.api ? { mode: 'setup' } : {})
  }
}

export function cli (job, options = { port: 3030 }) {
  if (options.mode === 'setup') return createApp(job, options)
  else if (options.mode === 'runJob') return runJob(job, options)
  else return run(job, options)
}
