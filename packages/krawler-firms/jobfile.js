import _ from 'lodash'
import moment from 'moment'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbUrl = process.env.DB_URL || 'mongodb://127.0.0.1:27017/kano'
const history = process.env.HISTORY || '48h'
const region = process.env.REGION || 'Global'

export default {
  id: 'firms',
  store: 'fs',
  taskTemplate: {
  },
  tasks: [{
    id: 's-npp',
    type: 'http',
    options: {
      url: `https://firms.modaps.eosdis.nasa.gov/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_${region}_${history}.csv`
    }
  }],
  hooks: {
    tasks: {
      before: {
        readMostRecent: {
          hook: 'readMongoCollection',
          collection: 'firms',
          dataPath: 'data.mostRecent',
          query: {},
          sort: { time: -1 },
          limit: 1
        }
      },
      after: {
        readCSV: {
          header: true,
          transform: {
            unitMapping: {
              latitude: { asNumber: true },
              longitude: { asNumber: true },
              bright_ti4: { asNumber: true },
              scan: { asNumber: true },
              track: { asNumber: true },
              frp: { asNumber: true },
              bright_ti5: { asNumber: true }
            }
          }
        },
        convertToGeoJson: {},
        apply: {
          function: (item) => {
            // Ingest most recent only
            const mostRecent = (_.isEmpty(item.mostRecent) ? null : moment.utc(item.mostRecent[0].time))
            const features = []
            _.forEach(item.data.features, (feature) => {
              const time = moment.utc(`${feature.properties.acq_date} ${feature.properties.acq_time}`, 'YYYY-MM-DD hhmm')
              // When collection is empty fill it in
              if (!mostRecent || time.isAfter(mostRecent)) {
                _.set(feature, 'time', time.toDate())
                features.push(feature)
              }
            })
            console.log(`Found ${features.length} new thermal hotspots` + (mostRecent ? ` after ${mostRecent}` : ''))
            item.data.features = features
          }
        }, /* For debug purpose
            writeJson: {
              store: 'fs'
            }, */
        writeMongoCollection: {
          collection: 'firms',
          chunkSize: 256
        },
        clearData: {}
      }
    },
    jobs: {
      before: {
        createStore: [{
          id: 'memory'
        }, {
          id: 'fs',
          options: {
            path: path.join(__dirname)
          }
        }],
        connectMongo: {
          url: dbUrl,
          clientPath: 'taskTemplate.client'
        },
        createMongoCollection: {
          clientPath: 'taskTemplate.client',
          collection: 'firms',
          indices: [
            [{ time: -1 }, { background: true }]
          ]
        }
      },
      after: {
        clearOutputs: {},
        removeStores: ['memory', 'fs']
      },
      error: {
        clearOutputs: {},
        removeStores: ['memory', 'fs']
      }
    }
  }
}
