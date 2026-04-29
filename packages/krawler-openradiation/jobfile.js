import _ from 'lodash'
import moment from 'moment'
import winston from 'winston'
import { hooks } from '@kalisio/krawler'

const DB_URL = process.env.DB_URL || 'mongodb://127.0.0.1:27017/openradiation'
const TTL = +process.env.TTL || (7 * 24 * 60 * 60)  // duration in seconds
const KEY = process.env.KEY
const COLLECTION = process.env.COLLECTION || 'openradiation'
// For testing purpose we can set a fixed date, take care that empty string might be interpreted wrongly
const DATE_OF_CREATION = (process.env.DATE_OF_CREATION ? process.env.DATE_OF_CREATION : undefined)

const baseUrl = 'https://request.openradiation.net/measurements'

// Create a custom hook to generate tasks
let generateTask = (options) => {
  return (hook) => {
    // For testing purpose we can set a fixed date
    const now = moment.utc(DATE_OF_CREATION)
    const formattedDateOfCreation = now.format('YYYY-M-D')
    console.log('Querying the api with the following dateOfCreation: ' + formattedDateOfCreation)
    let task = {
      options: {
        url: baseUrl + '?apiKey=' + KEY + '&dateOfCreation=' + formattedDateOfCreation + '&response=complete'
      }
    }
    hook.data.tasks = [task]
    return hook
  }
}
hooks.registerHook('generateTask', generateTask)

export default {
  id: 'openradiation',
  store: 'memory',
  options: {
    workersLimit: 1
  },
  taskTemplate: {
    id: 'openradiation',
    type: 'http'
  },
  hooks: {
    tasks: {
      after: {
        readJson: {},
        convertToGeoJson: {
          dataPath: 'result.data.data',
          latitude: 'latitude',
          longitude: 'longitude'
        },
        log: (logger, item) => {
          const measurements = _.get(item.data, 'data.features', [])
          logger.info(`${measurements.length} observations found`)
        },
        updateMongoCollection: {
          dataPath: 'result.data.data.features',
          COLLECTION,
          filter: { 'properties.reportUuid': '<%= properties.reportUuid %>' },
          upsert: true,
          transform: {
            mapping: {
              'properties.startTime': { path: 'time', delete: false },
              'properties.userId': { path: 'properties.name', delete: false }
            },
            unitMapping: {
              time: { asDate: 'utc' }
            }
          },
          chunkSize: 256
        },
        clearData: {}
      }
    },
    jobs: {
      before: {
        printEnv: {
          COLLECTION,
          TTL
        },
        createStores: { id: 'memory' },
        connectMongo: {
          url: DB_URL,
          clientPath: 'taskTemplate.client'
        },
        createLogger: {
          loggerPath: 'taskTemplate.logger',
          Console: {
            format: winston.format.printf(log =>
              winston.format.colorize().colorize(
                log.level,
                `${log.level}: ${log.message}`
              )
            ),
            level: 'verbose'
          }
        },
        createMongoCollection: {
          clientPath: 'taskTemplate.client',
          COLLECTION,
          indices: [
            [{ time: 1, 'properties.reportUuid': 1 }, { unique: true }],
            { 'properties.reportUuid': 1 },
            [{ 'properties.reportUuid': 1, 'properties.value': 1, time: -1 }, { background: true }],
            [{ time: 1 }, { expireAfterSeconds: TTL }], // days in s
            { geometry: '2dsphere' }
          ]
        },
        generateTask: {}
      },
      after: {
        disconnectMongo: {
          clientPath: 'taskTemplate.client'
        },
        removeLogger: {
          loggerPath: 'taskTemplate.logger'
        },
        removeStores: ['memory']
      },
      error: {
        disconnectMongo: {
          clientPath: 'taskTemplate.client'
        },
        removeLogger: {
          loggerPath: 'taskTemplate.logger'
        },
        removeStores: ['memory']
      }
    }
  }
}
