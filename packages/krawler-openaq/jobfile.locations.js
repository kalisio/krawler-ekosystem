import _ from 'lodash'
import winston from 'winston'
import moment from 'moment'
import { hooks } from '@kalisio/krawler'

const API_KEY = process.env.API_KEY
const COUNTRIES = process.env.COUNTRIES && process.env.COUNTRIES.split(',') || ['22', '129'] // see https://api.openaq.org/v3/countries
const LOOKBACK_PERIOD = process.env.LOOKBACK_PERIOD || 'P3M'
const DB_URL = process.env.DB_URL || 'mongodb://127.0.0.1:27017/openaq'
const LOCATIONS_COLLECTION = 'openaq-locations'
const BASE_URL = 'https://api.openaq.org/v3/locations?limit=1000'

// Create a custom hook to generate tasks
let generateTasks = (options) => {
  return (hook) => {
    let tasks = []
    _.forEach(COUNTRIES, country => {
      tasks.push({
        taskId: country,
        options: {
          url: `${BASE_URL}&countries_id=${country}`,
          headers: {
            'X-API-Key': API_KEY
          }
        }
      })
    })
    hook.data.tasks = tasks
    return hook
  }
}
hooks.registerHook('generateTasks', generateTasks)

export default {
  id: 'openaq-locations',
  store: 'memory',
  options: {
    workersLimit: 1,
    faultTolerant: false
  },
  taskTemplate: {
    id: 'openaq-locations/<%= taskId %>',
    type: 'http'
  },
  hooks: {
    tasks: {
      after: {
        readJson: {
          dataPath: 'data.openaqResponse'
        },
        apply: {
          function: (item) => {
            const datetimeMin = moment.utc().subtract(LOOKBACK_PERIOD).toISOString()
            let locations = []
            _.forEach(_.get(item, 'openaqResponse.results'), result => {
              let datetimeLast = _.get(result, 'datetimeLast.utc')
              if (datetimeLast && moment(datetimeLast).isAfter(datetimeMin)) {
                result.locationId = result.id
                delete result.id
                locations.push(result)
              }
              else console.log(`[!] skipping location ${result.id} (${result.name})`)
            })
            item.data = locations
          }
        },
        log: (logger, item) => logger.info(`Country ${item.taskId}: ${_.size(item.data)} locations found.`),
        convertToGeoJson: {
          longitude: 'coordinates.longitude',
          latitude: 'coordinates.latitude'
        },
        updateMongoCollection: {
          collection: LOCATIONS_COLLECTION,
          filter: { 'properties.locationId': '<%= properties.locationId %>' },
          upsert : true,
          chunkSize: 256
        },
        clearData: {}
      }
    },
    jobs: {
      before: {
        printEnv: {
          COUNTRIES,
          LOOKBACK_PERIOD
        },
        createStores: { 
          id: 'memory'
        },
        createLogger: {
          loggerPath: 'taskTemplate.logger',
          Console: {
            format: winston.format.printf(log => winston.format.colorize().colorize(log.level, `${log.level}: ${log.message}`)),
            level: 'verbose'
          }
        },
        connectMongo: {
          url: DB_URL,
          // Required so that client is forwarded from job to tasks
          clientPath: 'taskTemplate.client'
        },
        createMongoCollection: {
          clientPath: 'taskTemplate.client',
          collection: LOCATIONS_COLLECTION,
          indices: [
            [{ 'properties.locationId': 1 }, { unique: true }],
            { geometry: '2dsphere' }
          ]
        },
        generateTasks: {}
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
