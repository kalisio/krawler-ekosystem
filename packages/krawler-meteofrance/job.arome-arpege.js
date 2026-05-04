import _ from 'lodash'
import winston from 'winston'
import moment from 'moment'
import fs from 'fs'
import path from 'path'

// Job configuration
const outputDir = process.env.OUTPUT_DIR || './output'
const workersLimit = process.env.WORKERS_LIMIT ? Number(process.env.WORKERS_LIMIT) : 2
const dataSource = process.env.METEOFRANCE_DATA_SOURCE || 'meteofrance'
const meteofranceAromeUrl = 'https://public-api.meteofrance.fr/previnum/DPPaquetAROME/v1/productARO'
const meteofranceArpegeUrl = 'https://public-api.meteofrance.fr/previnum/DPPaquetARPEGE/v1/productARP'
const dataGouvUrl = 'https://object.files.data.gouv.fr/meteofrance-pnt/pnt'
const meteofranceAromeToken = process.env.METEOFRANCE_AROME_TOKEN
const meteofranceArpegeToken = process.env.METEOFRANCE_ARPEGE_TOKEN
// Don't go back in time older than 1 day
const oldestRunIntervalMs = (process.env.OLDEST_RUN_INTERVAL_MS ? Number(process.env.OLDEST_RUN_INTERVAL_MS) : 24 * 3600 * 1000)

function getReferenceTimes (runTimes) {
  const now = moment().utc()
  const referenceTimes = []
  const daysBack = Math.ceil(oldestRunIntervalMs / 86400000) + 1
  for (let dayOffset = 0; dayOffset <= daysBack; dayOffset++) {
    const day = moment(now).utc().startOf('day').subtract(dayOffset, 'days')
    for (const runTime of runTimes) {
      const time = moment(day).add(moment.duration(runTime))
      const age = now.diff(time)
      if (age >= 0 && age <= oldestRunIntervalMs) referenceTimes.push(time.format('YYYY-MM-DDTHH:mm:ss[Z]'))
    }
  }
  return referenceTimes
}

function getEnvArray (key, defaults) {
  if (_.isUndefined(process.env[key]) || _.isEmpty(process.env[key])) return defaults
  const values = process.env[key].split(',').map(value => value.trim())
  if (!_.every(values, value => _.includes(defaults, value))) return defaults
  return values
}

export default (options) => {
  const { model, id, format, resolution } = options

  const meteofranceUrl = model === 'arome' ? meteofranceAromeUrl : meteofranceArpegeUrl
  const meteofranceToken = model === 'arome' ? meteofranceAromeToken : meteofranceArpegeToken

  return {
    id,
    store: 'fs',
    options: {
      workersLimit,
      faultTolerant: true
    },
    taskTemplate: {
      id: '<%= taskId %>',
      type: 'http',
      options: dataSource === 'data-gouv'
        ? {
            url: '<%= url %>'
          }
        : {
            url: meteofranceUrl,
            grid: resolution,
            format,
            referencetime: '<%= referencetime %>',
            package: '<%= package %>',
            time: '<%= time %>',
            headers: {
              accept: '*/*',
              apikey: meteofranceToken
            }
          }
    },
    hooks: {
      tasks: {
        before: {
          log: (logger, item) => logger.verbose(`Creating task for ${item.id}`)
        },
        after: {
          apply: {
            function: (item) => {
              const { id, logger, format } = item
              const oldPath = path.join(outputDir, id)
              if (fs.existsSync(oldPath)) fs.renameSync(oldPath, `${oldPath}.${format}`)
              logger.info(`Task ${id} finished`)
            }
          }
        },
        error: {
          log: async (logger, item) => {
            let errors = []
            if (_.has(item, 'error')) errors = _.get(item, 'error.errors', [_.get(item, 'error')])
            logger.error(`Failed processing ${item.id}: ${errors}`)
            const statusCode = _.get(item, 'error.statusCode')
            const filePath = `${outputDir}/${item.id}`
            if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath)
            if (statusCode === 404) {
              logger.warn(`[WARN] 404 on task ${item.id} → waiting 15s before continuing...`)
              await new Promise(resolve => setTimeout(resolve, 15000))
            }
            if (statusCode === 429) {
              logger.error('[ERROR] 429 (rate limit) → rate limit reached, stopping job to avoid ban')
              process.exit(1)
            }
          }
        }
      },
      jobs: {
        before: {
          createStores: {
            id: 'fs',
            type: 'fs',
            options: { path: outputDir }
          },
          createLogger: {
            loggerPath: 'taskTemplate.logger',
            Console: {
              format: winston.format.printf(log => winston.format.colorize().colorize(log.level, `${log.level}: ${log.message}`)),
              level: 'verbose'
            }
          },
          // Clean old output folders and generate the task list in one pass
          generateAndClean: {
            hook: 'apply',
            function: (item) => {
              const { defaultRunTimes, defaultPackages, defaultForecastTimes } = options
              const runTimes = getEnvArray('RUN_TIMES', defaultRunTimes)
              const packages = getEnvArray('METEOFRANCE_PACKAGES', defaultPackages)
              const forecastTimes = getEnvArray('FORECAST_TIMES', defaultForecastTimes)
              const referencetimes = getReferenceTimes(runTimes)

              // --- Clean old folders and collect already-processed files ---
              const alreadyProcessed = []
              const now = moment.utc()
              const oldestAllowedTime = now.clone().subtract(oldestRunIntervalMs, 'milliseconds')
              const directoryEntries = fs.readdirSync(outputDir, { withFileTypes: true })

              for (const entry of directoryEntries) {
                const folderName = entry.name
                const folderFullPath = path.join(outputDir, folderName)
                const lastUnderscoreIndex = folderName.lastIndexOf('_')
                const referenceTimeStr = folderName.slice(lastUnderscoreIndex + 1)
                const referenceTime = moment.utc(referenceTimeStr, 'YYYY-MM-DDTHH:mm:ss[Z]')
                if (!referenceTime.isValid() || referenceTime.isBefore(oldestAllowedTime)) {
                  fs.rmSync(folderFullPath, { recursive: true, force: true })
                  item.taskTemplate.logger.info(`Deleted old folder: ${folderName}`)
                  continue
                }
                const filesInFolder = fs.readdirSync(folderFullPath)
                for (const fileName of filesInFolder) {
                  if (!fileName.endsWith(`.${format}`)) continue
                  const baseName = fileName.slice(0, -`.${format}`.length)
                  alreadyProcessed.push(`${folderName}/${baseName}`)
                }
              }

              // --- Generate task list ---
              const tasks = []
              for (const referencetime of referencetimes) {
                const folder = `${id}_${resolution}_${referencetime}`
                for (const pkg of packages) {
                  for (const time of forecastTimes) {
                    const taskId = `${folder}/${pkg}-${time}`
                    if (_.includes(alreadyProcessed, taskId)) continue
                    const task = { referencetime, package: pkg, time, id: taskId, format }
                    if (dataSource === 'data-gouv') {
                      task.url = [
                        dataGouvUrl,
                        referencetime,
                        model,
                        resolution,
                        pkg,
                        `${model}__${resolution}__${pkg}__${time}__${referencetime}.${format}`
                      ].join('/')
                    }
                    tasks.push(task)
                  }
                }
              }
              item.tasks = tasks
            }
          }
        },
        after: {
          removeStores: ['fs'],
          removeLogger: {
            loggerPath: 'taskTemplate.logger'
          }
        },
        error: {
          removeStores: ['fs'],
          removeLogger: {
            loggerPath: 'taskTemplate.logger'
          }
        }
      }
    }
  }
}
