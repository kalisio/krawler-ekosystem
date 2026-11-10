import _ from 'lodash'
import { hooks } from '@kalisio/krawler'
import winston from 'winston'

const DB_URL = process.env.DB_URL || 'mongodb://127.0.0.1:27017/hubeau'

// France has 101 departments: 94 numbered (01–95, excluding 20),
// 2 Corsican (2A, 2B), and 5 overseas (971, 972, 973, 974, 976).
const DEFAULT_CODE_DEP = [
  ...Array.from({ length: 95 }, (_, i) => String(i + 1).padStart(2, '0'))
    .filter(code => code !== '20'),
  '2A', '2B',
  '971', '972', '973', '974', '976'
]
const CODE_DEP = process.env.CODE_DEP
  ? process.env.CODE_DEP.split(',')
  : DEFAULT_CODE_DEP

const DATE_FIN_MESURE = process.env.DATE_FIN_MESURE || '2022-01-01'
let totalStations = 0
let totalInService = 0

// Create a custom hook to generate tasks
const generateTasks = (options) => {
  // We need to reset the total counter for each job
  return (hook) => {
    totalStations = 0
    const tasks = []
    // We split the list of depCode into batches of 27 codes
    const batch = _.chunk(CODE_DEP, 27)
    console.log('batch : ' + batch.length)
    batch.forEach(depCodes => {
      let depCodeStr = ''
      _.forEach(depCodes, (depCode) => {
        depCodeStr += depCode + ','
      })
      // We remove the last character of the string (it's a ,)
      depCodeStr = depCodeStr.substring(0, depCodeStr.length - 1)
      const id = batch.indexOf(depCodes)
      console.log('\nTask ' + id + ' : ' + depCodeStr)
      const task = {
        id: batch.indexOf(depCodes),
        options: {
          url: options.baseUrl + 'code_departement=' + depCodeStr + '&format=geojson&size=20000'
        }
      }
      tasks.push(task)
    })
    console.log('Generated ' + tasks.length + ' tasks')
    hook.data.tasks = tasks
    return hook
  }
}

hooks.registerHook('generateTasks', generateTasks)

export default {
  id: 'hubeau-piezo-stations',
  store: 'memory',
  options: {
    workersLimit: 2,
    faultTolerant: true
  },
  taskTemplate: {
    id: 'stations/<%= taskId %>',
    type: 'http',
    attemptsLimit: 5
  },
  hooks: {
    tasks: {
      after: {
        readJson: {},
        apply: {
          function: (item) => {
            if (item.data.count > 20000) { console.log('Warning: more than 20000 stations found, some may be missing') }
            const stations = []
            // We only keep the properties
            _.forEach(item.data.features, (feature) => {
              //  We only keep the stations with a geometry and that have a `date_fin_mesure` after 2022-01-01 (older stations are not updated anymore)
              if (!feature.geometry) console.log('Warning: station ' + feature.properties.bss_id + ' has no geometry')
              else {
                feature.properties.name = `${feature.properties.code_bss} (${feature.properties.nom_commune})`
                if (new Date(feature.properties.date_fin_mesure) < new Date(DATE_FIN_MESURE)) {
                  console.log('Warning: station ' + feature.properties.bss_id + ' is not in service anymore (date_fin_mesure = ' + feature.properties.date_fin_mesure + ')')
                  // We add a property to the station to indicate that it is not up to date (in_service = false)
                  feature.properties.en_service = false
                } else {
                  // We add a property to the station to indicate that it is up to date (in_service = true)
                  feature.properties.en_service = true
                  totalInService++
                }
                stations.push(feature)
              }
            })
            item.data = stations
            item.totalStations = totalStations
            item.totalInService = totalInService
          }
        },
        log: (logger, item) => {
          const count = Array.isArray(item.data) ? item.data.length : 0
          totalStations += count
          logger.info(`Task ${String(item.id).replace('stations/', '')} : ${count} stations found [total : ${totalStations}] [total in service : ${totalInService}]`)
        },
        updateMongoCollection: {
          collection: 'hubeau-piezo-stations',
          filter: { 'properties.bss_id': '<%= properties.bss_id %>' },
          upsert: true,
          chunkSize: 256
        },
        clearData: {}
      },
      error: {
        apply: {
          function: (item) => {
            console.error('Error ' + item.error)
          }
        }
      }
    },
    jobs: {
      before: {
        createStores: { id: 'memory' },
        connectMongo: {
          url: DB_URL,
          // Required so that client is forwarded from job to tasks
          clientPath: 'taskTemplate.client'
        },
        createLogger: {
          loggerPath: 'taskTemplate.logger',
          Console: {
            format: winston.format.printf(log => winston.format.colorize().colorize(log.level, `${log.level}: ${log.message}`)),
            level: 'verbose'
          }
        },
        createMongoCollection: {
          clientPath: 'taskTemplate.client',
          collection: 'hubeau-piezo-stations',
          indices: [
            [{ 'properties.bss_id': 1 }, { unique: true }],
            { geometry: '2dsphere' }
          ]
        },
        generateTasks: {
          baseUrl: 'https://hubeau.eaufrance.fr/api/v1/niveaux_nappes/stations?'
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
