import _ from 'lodash'
import winston from 'winston'
import moment from 'moment'
import { hooks } from '@kalisio/krawler'

const API_KEY = process.env.API_KEY
const LOOKBACK_PERIOD = process.env.LOOKBACK_PERIOD || 'PT3H'
const DELAY = +process.env.DELAY || 1200
const TTL = +process.env.TTL || (7 * 24 * 60 * 60)  // duration in seconds
const TIMEOUT = parseInt(process.env.TIMEOUT, 10) || (60 * 60 * 1000) // duration in milliseconds
const DB_URL = process.env.DB_URL || 'mongodb://127.0.0.1:27017/openaq'
const PARAMETERS = ['pm10', 'pm25', 'so2', 'no2', 'o3', 'co']
const MEASUREMENTS_COLLECTION = 'openaq-measurements'
const LOCATIONS_COLLECTION = 'openaq-locations'
const BASE_URL = 'https://api.openaq.org/v3/locations'

// Create a custom hook to generate tasks
let generateTasks = (options) => {
  return (hook) => {
    let tasks = []
    _.forEach(hook.data.locations, location => {
      tasks.push({
        taskId: location.properties.locationId,
        location,
        options: {
          url: `${BASE_URL}/${location.properties.locationId}/latest`,
          headers: {
            'X-API-Key': API_KEY
          }
        }
      })
    })
    hook.data.tasks = tasks
  }
}

hooks.registerHook('generateTasks', generateTasks)

export default {
  id: 'openaq-measurements',
  store: 'memory',
  options: {
    workersLimit: 1,
    faultTolerant: true,
    timeout: TIMEOUT
  },
  taskTemplate: {
    id: 'openaq-measurements/<%= taskId %>',
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
            // filter and map the results according the time 
            const datetimeMin = moment.utc().subtract(LOOKBACK_PERIOD)
            let results = {}
            _.forEach(_.get(item, 'openaqResponse.results'), result =>{
              const time = result.datetime.utc
              if (moment.utc(time).isAfter(datetimeMin)) {
                const value = result.value
                const sensor = _.find(_.get(item.location, 'properties.sensors'), { id: result.sensorsId })
                const parameter = sensor.parameter.name
                if (PARAMETERS.includes(parameter)) {
                  if (results[time]) results[time].push({ name: parameter, value })
                  else results[time] = [{ name: parameter, value }]
                } else console.log('[!] skipping parameter', parameter)
              }
            })
            // create the measurements by aggregating the parameter values
            let measurements = []
            _.forOwn(results, (parameters, time) => {
              let measurement = {
                type: 'Feature',
                geometry: item.location.geometry,
                properties: {
                  measurementId: `${item.location.properties.locationId}-${time}`,
                  name: item.location.properties.name,
                  locationId: item.location.properties.locationId
                },
                time
              }
              _.forEach(parameters, parameter => {
                _.set(measurement, `properties.${parameter.name}`, parameter.value)
              })
              measurements.push(measurement)
            })
            item.data = measurements
          }
        },
        log: (logger, item) => logger.info(`Location ${item.taskId}: ${_.size(item.data)} measurements found.`),
        updateMongoCollection: {
          collection: MEASUREMENTS_COLLECTION,
          filter: { 'properties.measurementId': '<%= properties.measurementId %>' },
          upsert : true,
          chunkSize: 256,
          transform: { 
            unitMapping: { 
              time: { asDate: 'utc' },
            }
          }
        },
        clearData: {},
        wait: { delay: DELAY }
      }
    },
    jobs: {
      before: {
        printEnv: {
          LOOKBACK_PERIOD,
          TTL,
          TIMEOUT
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
          collection: MEASUREMENTS_COLLECTION,
          indices: [
            [{ time: 1, 'properties.measurementId': 1 }, { unique: true }],
            [ { 'properties.locationId': 1, pm10 : 1, time: -1 }, { background: true } ],
            [ { 'properties.locationId': 1, pm25 : 1, time: -1 }, { background: true } ],            
            [ { 'properties.locationId': 1, so2 : 1, time: -1 }, { background: true } ],
            [ { 'properties.locationId': 1, no2 : 1, time: -1 }, { background: true } ],
            [ { 'properties.locationId': 1, o3 : 1, time: -1 }, { background: true } ],
            [ { 'properties.locationId': 1, co : 1, time: -1 }, { background: true } ],
            [{ time: 1 }, { expireAfterSeconds: TTL }], // days in s  
            { geometry: '2dsphere' }
          ]
        },
        readMongoCollection: {
          clientPath: 'taskTemplate.client',
          collection: LOCATIONS_COLLECTION,
          dataPath: 'data.locations'
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
