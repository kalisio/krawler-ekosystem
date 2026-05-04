import _ from 'lodash'
import winston from 'winston'
import fs from 'fs'
import path from 'path'

function getEnvArray (key) {
  if (_.isUndefined(process.env[key]) || _.isEmpty(process.env[key])) return []
  return process.env[key].split(',').map(value => value.trim())
}

const outputDir = process.env.OUTPUT_DIR || './output'
const workersLimit = process.env.WORKERS_LIMIT ? Number(process.env.WORKERS_LIMIT) : 1
const template = process.env.TEMPLATE || 'arpege-isobaric'
const s3DatasetsRoot = process.env.S3_DATASETS_ROOT || 'meteofrance/isobaric/'
const packages = getEnvArray('PACKAGES')
const forecastTimes = getEnvArray('FORECAST_TIMES')

export default {
  id: 'grib2-to-zarr',
  store: 'fs',
  options: {
    workersLimit,
    faultTolerant: true
  },
  tasks: [{
    id: '<%= taskId %>',
    type: 'noop',
    store: 'fs'
  }],
  hooks: {
    tasks: {
      before: {
        log: (logger, item) => logger.verbose(`Creating task for ${item.id}`)
      },
      after: {
        grib2ToZarr: {
          hook: 'runCommand',
          command: [
            './conversion_tool new-dataset',
            '--templates-path ./templates.json',
            `-t ${template}`,
            '--data-mapping cells',
            "-c '{\"version\": 2}'",
            `-o <%= targetFolder %>`,
            'dummy-id <%= id %>'
          ].join(' '),
          stdout: true,
          stderr: true
        },
        apply: {
          function: (item) => {
            const { id, logger, done } = item
            if (!logger || !id) return
            if (done) {
              const doneFilePath = path.join(id, 'DONE.txt')
              fs.writeFileSync(doneFilePath, 'COMPLETED\n')
              logger.info(`Task ${id} marked as completed`)
            }
            logger.info(`Task ${id} finished`)
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
        generateTasks: {
          hook: 'apply',
          function: (item) => {
            const directoryEntries = fs.readdirSync(outputDir, { withFileTypes: true })
            const expectedFiles = []
            for (const pkg of packages) {
              for (const forecastTime of forecastTimes) {
                expectedFiles.push(`${pkg}-${forecastTime}.grib2`)
              }
            }
            const tasks = []
            const cleanS3Path = s3DatasetsRoot.replace(/\/+$/, '')
            const folderNameCaptureRegex = /^([^-]+)[^_]+_([^_]+)_(\d{4})-(\d{2})-(\d{2})T([^/]+)$/
            for (const entry of directoryEntries) {
              const folderName = entry.name
              const folderFullPath = path.join(outputDir, folderName)
              const newPath = folderName.replace(folderNameCaptureRegex, '$1/$2/$3/$4/$5/$6')
              const targetFolder = `s3://${cleanS3Path}/${newPath}.zarr`
              const filesInFolder = fs.readdirSync(folderFullPath)
              const gribFiles = filesInFolder.filter(file => file.endsWith('.grib2'))
              const hasGrib2 = gribFiles.length > 0
              const hasDoneFile = filesInFolder.includes('DONE.txt')
              if (!hasGrib2 || hasDoneFile) continue
              const task = { id: folderFullPath, targetFolder, done: false }
              const hasAllExpected = expectedFiles.every(file => gribFiles.includes(file))
              const hasNoExtraFiles = gribFiles.every(file => expectedFiles.includes(file))
              if (gribFiles.length === expectedFiles.length && hasAllExpected && hasNoExtraFiles) task.done = true
              tasks.push(task)
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
