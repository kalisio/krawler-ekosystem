import _ from 'lodash'
import { hooks } from '@kalisio/krawler'

const outputDir = './output'

// Configuration
const DB_URL = process.env.DB_URL || 'mongodb://127.0.0.1:27017/hubeau'
const TTL = parseInt(process.env.TTL, 10) || (7 * 24 * 60 * 60) // duration in seconds
const HISTORY = parseInt(process.env.HISTORY, 10) || 86400000 // duration in miliseconds (must be full days)
const TIMEOUT = parseInt(process.env.TIMEOUT, 10) || (30 * 60 * 1000) // duration in miliseconds

let stationDict = null
let total = null

// Create a custom hook to generate tasks
const generateTasks = (options) => {
  // We need to reset the total counter for each job
  return (hook) => {
    total = 0
    const tasks = []
    hook.data.batch.forEach(stationList => {
      let stationCodeStr = ''
      _.forEach(Object.keys(stationList), (stationCode) => {
        stationCodeStr += stationCode + ','
      })
      // Initial date is today minus the HISTORY and we want it in yyyy-mm-dd format
      const initialDate = new Date(new Date() - HISTORY).toISOString().slice(0, 10)

      // We remove the last character of the string (it's a ,)
      stationCodeStr = stationCodeStr.substring(0, stationCodeStr.length - 1)
      const task = {
        initialDate,
        id: hook.data.batch.indexOf(stationList),
        options: {
          url: options.baseUrl + 'bssId=' + stationCodeStr + '&date_debut_mesure=' + initialDate + '&fields=bssId,date_mesure,profondeur_nappe,niveau_eau_ngf&size=20000'
        }
      }
      tasks.push(task)
    })
    console.log('Generated ' + tasks.length + ' tasks')
    hook.data.tasks = tasks
    return hook
  }
}

// Create a custom hook to process data
const processData = (options) => {
  return (hook) => {
    const item = hook.data
    const dataToSave = []
    if (item.data.count > 20000) {
      const station = item.options.url.split('bssId=')[1].split('&')[0].split(',')
      console.log('Too many results for task ' + item.id.substring(13) + ' : ' + item.data.count + ' should be less than 20000')
      console.log('Request had : ' + station.length + ' stations : ' + station)
    }
    _.forEach(item.data.data, (obs) => {
      const timeObs = new Date(obs.date_mesure)
      const station = stationDict[obs.bssId]

      // We check if the new observation is more recent than the last_obs of the station
      if (timeObs > new Date(station.last_obs)) {
        const featureObservation = {
          type: 'Feature',
          time: timeObs.toISOString(),
          geometry: station.geometry,
          properties: {
            name: station.name,
            en_service: true,
            bssId: obs.bssId,
            profondeur_nappe: obs.profondeur_nappe,
            niveau_eau_ngf: obs.niveau_eau_ngf
          }
        }
        dataToSave.push(featureObservation)
      }
    })
    if (dataToSave.length > 0) {
      total += dataToSave.length
      console.log(dataToSave.length + ' new observations found by task ' + item.id.substring(13) + ' [total : ' + total + ']')
    }
    item.data = dataToSave

    return hook
  }
}

hooks.registerHook('processData', processData)
hooks.registerHook('generateTasks', generateTasks)

export default {
  id: 'hubeau-piezo-observations',
  store: 'memory',
  options: {
    workersLimit: 45,
    faultTolerant: true,
    TIMEOUT
  },
  taskTemplate: {
    id: 'observations/<%= taskId %>',
    type: 'http',
    attemptsLimit: 5
  },
  hooks: {
    tasks: {
      after: {
        readJson: {},
        processData: {},
        writeMongoCollection: {
          chunkSize: 256,
          collection: 'hubeau-piezo-observations',
          transform: { unitMapping: { time: { asDate: 'utc' } } },
          dataPath: 'data.data'
        },
        clearData: {}
      },
      error: {
        apply: {
          function: (item) => {
            console.error('Error for task ' + item.id.substring(13) + ' : ' + item.error)
            console.error('Request had : ' + item.options.url.split('bssId=')[1].split('&')[0].split(',').length + ' stations')
          }
        }
      }
    },
    jobs: {
      before: {
        createStores: [{
          id: 'memory'
        }, {
          id: 'fs',
          options: {
            path: outputDir
          }
        }],
        connectMongo: {
          url: DB_URL,
          // Required so that client is forwarded from job to tasks
          clientPath: 'taskTemplate.client'
        },
        createMongoCollection: {
          clientPath: 'taskTemplate.client',
          collection: 'hubeau-piezo-observations',
          indices: [
            [{ time: 1 }, { expireAfterSeconds: TTL }], // days in s
            { 'properties.bssId': 1 },
            [{ 'properties.bssId': 1, time: -1 }, { background: true }],
            [{ 'properties.bssId': 1, 'properties.profondeur_nappe': 1, time: -1 }, { background: true }],
            [{ 'properties.bssId': 1, 'properties.niveau_eau_ngf': 1, time: -1 }, { background: true }],
            { 'properties.profondeur_nappe': 1 },
            { 'properties.niveau_eau_ngf': 1 },
            { geometry: '2dsphere' }
          ]
        },
        getStations: {
          hook: 'readMongoCollection',
          clientPath: 'taskTemplate.client',
          collection: 'hubeau-piezo-stations',
          query: { 'properties.en_service': true },
          dataPath: 'data.stations'
        },
        createDict: {
          hook: 'apply',
          function: (item) => {
            // We create a dictionnary of stations, with the code of the station as a key
            stationDict = {}
            _.forEach(item.stations, (station) => {
              // In the stationDict we add the name of the station, and its geometry (its coordinates) but without the crs section
              // created with the code of the station as a key,
              // we also prepare the date of the last observation which is currently unknown
              const actualTime = Date.now()
              // console.log(station.geometry.type)
              stationDict[station.properties.bssId] = {
                geometry: { type: station.geometry.type, coordinates: station.geometry.coordinates },
                name: station.properties.name,
                // last obs is the 00:00:00 of the day before the actual time
                last_obs: new Date(actualTime - actualTime % (HISTORY) - (HISTORY)).toISOString()
              }
            })
          }
        },
        lastStoredObs: {
          hook: 'createMongoAggregation',
          clientPath: 'taskTemplate.client',
          collection: 'hubeau-piezo-observations',
          dataPath: 'data.lastObs',
          pipeline: [
            {
              $group: {
                _id: '$properties.bssId',
                last_obs: { $max: '$time' }
              }
            },
            { $project: { _id: 0, bssId: '$_id', last_obs: 1 } },
            { $sort: { last_obs: -1 } }
          ]
        },
        FinalDict: {
          hook: 'apply',
          function: (item) => {
            // We convert item.lastObs into a dict with the station code as a key and the date of the last observation as a value
            item.lastObs = _.keyBy(item.lastObs, 'bssId')

            _.forEach(Object.keys(stationDict), (bssId) => {
              const station = stationDict[bssId]
              if (item.lastObs[bssId] !== undefined) {
                // We recover the date of the last observation by converting it into a timestamp
                station.last_obs = new Date(item.lastObs[bssId].last_obs).getTime()
              }
            })
            console.log('Number of stations : ' + Object.keys(stationDict).length)
            const batch = [[]]
            // We devide the stationDict into several sub-lists, so that each list contains at most size observations
            _.forEach(Object.keys(stationDict), (stationCode) => {
              const station = stationDict[stationCode]
              // Limit of 200 stations per request imposed by the hub'eau API
              if (Object.keys(batch[batch.length - 1]).length < 200) {
                // We add the station to the last sub-dict of batch, with the station code as a key and the station dict as a value
                batch[batch.length - 1][stationCode] = station
              } else {
                // We add the station to a new sub-dict of batch
                batch.push({ [stationCode]: station })
              }
            })
            item.batch = batch
          }
        },
        generateTasks: {
          baseUrl: 'https://hubeau.eaufrance.fr/api/v1/niveaux_nappes/chroniques_tr?'
        }
      },
      after: {
        disconnectMongo: {
          clientPath: 'taskTemplate.client'
        },
        removeStores: ['memory', 'fs']
      },
      error: {
        disconnectMongo: {
          clientPath: 'taskTemplate.client'
        },
        removeStores: ['memory', 'fs']
      }
    }
  }
}
