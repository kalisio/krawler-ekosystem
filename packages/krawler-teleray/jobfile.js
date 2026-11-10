import _ from 'lodash'
import winston from 'winston'

// MongoDB connection settings
const DB_URL = process.env.DB_URL || 'mongodb://127.0.0.1:27017/k-teleray'
const STATIONS_COLLECION = process.env.STATIONS_COLLECTION || 'teleray-stations'
const MEASURES_COLLECION = process.env.MEASURES_COLLECTION || 'teleray-measures'
const DEFAULT_TTL = 7 * 24 * 60 * 60
const TTL = Number(process.env.TTL) || DEFAULT_TTL

// Job configuration
const CHUNK_SIZE = 256

export default {
  id: 'teleray',
  store: 'memory',
  options: {
    workersLimit: 1
  },
  tasks: [{
    id: 'teleray-task',
    type: 'http',
    options: {
      url: 'https://api.teleray.staging.ul2i.fr/wfs/collections/measures/items',
      limit: 2000,
      sortby: '-time'
    }
  }],
  hooks: {
    tasks: {
      before: {
        createMongoAggregation: {
          dataPath: 'data.mostRecentMeasurement',
          collection: MEASURES_COLLECION,
          pipeline: [
            { $sort: { 'properties.irsnId': 1, time: 1 } },
            {
              $group:
                {
                  _id: '$properties.irsnId',
                  lastMeasureDate: { $last: '$time' }
                }
            }
          ],
          allowDiskUse: true
        }
      },
      after: {
        readJson: {},
        apply: {
          function: (item) => {
            const { mostRecentMeasurement, logger } = item
            const measurements = []
            const mostRecentMeasurementIds = _.keyBy(mostRecentMeasurement, '_id')
            _.forEach(item.data.features, (feature) => {
              const irsnId = feature.properties.irsnId
              const measurementDate = Math.floor(new Date(feature.properties.measurementDate).getTime() / 1000)
              const lastMeasureDate = mostRecentMeasurementIds[irsnId] ? Math.floor(new Date(mostRecentMeasurementIds[irsnId].lastMeasureDate).getTime() / 1000) : null
              if (lastMeasureDate === null || measurementDate > lastMeasureDate) {
                delete feature.properties.validated
                delete feature.time
                delete feature.id
                measurements.push(feature)
              }
            })
            logger.verbose(`Found ${measurements.length} new measurements`)
            item.data = measurements
          }
        },
        writeMeasurements: {
          hook: 'writeMongoCollection',
          collection: MEASURES_COLLECION,
          transform: {
            mapping: { 'properties.measurementDate': { path: 'time', delete: false } },
            unitMapping: { time: { asDate: 'utc' } }
          },
          CHUNK_SIZE
        },
        updateStations: {
          hook: 'updateMongoCollection',
          collection: STATIONS_COLLECION,
          filter: { 'properties.irsnId': '<%= properties.irsnId %>' },
          upsert: true,
          transform: {
            omit: [
              'time',
              'properties.bruitdefond',
              'properties.validation',
              'properties.libelle',
              'properties.measurementDate',
              'properties.doseRateRaw',
              'properties.doseRateNet',
              'properties.measState'
            ]
          },
          CHUNK_SIZE
        },
        clearData: {}
      },
      error: {
        log: (logger, item) => {
          let errors = []
          if (_.has(item, 'error')) errors = _.get(item, 'error.errors', [_.get(item, 'error')])
          logger.error(`Failed processing ${item.id}: ${errors}`)
        },
        clearData: {}
      }
    },
    jobs: {
      before: {
        forceJsonContentType: {
          hook: 'apply',
          function: (item) => {
            const contentType = item.headers?.['content-type']
            if (contentType?.includes('geo+json')) item.contentType = 'json'
          }
        },
        createStores: { id: 'memory' },
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
        createStationsCollection: {
          hook: 'createMongoCollection',
          clientPath: 'taskTemplate.client',
          collection: STATIONS_COLLECION,
          indices: [
            [{ 'properties.irsnId': 1 }, { unique: true, name: 'properties_irsnId_index' }],
            { geometry: '2dsphere' }
          ]
        },
        createMeasurementsCollection: {
          hook: 'createMongoCollection',
          clientPath: 'taskTemplate.client',
          collection: MEASURES_COLLECION,
          indices: [
            [{ time: 1, 'properties.irsnId': 1 }, { unique: true }],
            [{ 'properties.irsnId': 1, time: 1 }],
            { 'properties.doseRateRaw': 1 },
            { 'properties.doseRateNet': 1 },
            { 'properties.irsnId': 1, 'properties.doseRateNet': 1, time: -1 },
            { 'properties.irsnId': 1, 'properties.doseRateRaw': 1, time: -1 },
            [{ time: 1 }, { expireAfterSeconds: TTL }],
            { geometry: '2dsphere' }
          ]
        }
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
