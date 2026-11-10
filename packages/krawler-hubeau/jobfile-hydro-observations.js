import _ from 'lodash'
import { hooks } from '@kalisio/krawler'

const OUTPUT_DIR = './output'

// Configuration
const DB_URL = process.env.DB_URL || 'mongodb://127.0.0.1:27017/hubeau'
const TTL = parseInt(process.env.TTL, 10) || (7 * 24 * 60 * 60) // duration in seconds
const HISTORY = parseInt(process.env.HISTORY, 10) || (1 * 24 * 60 * 60 * 1000) // duration in miliseconds
const TIMEOUT = parseInt(process.env.TIMEOUT, 10) || (30 * 60 * 1000) // duration in miliseconds

let dictstations = null
let total = null
let dbSearchTime = null

// Create a custom hook to generate tasks
const generateTasks = (options) => {
  return (hook) => {
    total = 0
    const tasks = []
    hook.data.batch.forEach(liststation => {
      let stationCodeStr = ''
      let initialDate = new Date().getTime()
      _.forEach(Object.keys(liststation), (stationCode) => {
        // We remove the first character of the stationCode (it's a #)
        stationCodeStr += stationCode.substring(1) + ','
        // We find the smallest last_obs of the stations in the batch
        if (liststation[stationCode].last_obs < initialDate) {
          initialDate = liststation[stationCode].last_obs
        }
      })
      // We convert the date in ISOString
      initialDate = new Date(initialDate).toISOString()

      // We remove the last character of the string (it's a ,)
      stationCodeStr = stationCodeStr.substring(0, stationCodeStr.length - 1)

      const task = {
        initialDate,
        id: hook.data.batch.indexOf(liststation),
        options: {

          url: options.baseUrl + 'code_entite=' + stationCodeStr + '&date_debut_obs=' + initialDate + '&fields=stationCode,date_obs,resultat_obs,grandeur_hydro&size=20000&sort=ASC'
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
    const stationsInUrl = item.options.url.split('code_entite=')[1].split('&')[0].split(',')
    if (item.data.count > 20000) {
      console.log('Too many results for task ' + item.id.substring(13) + ' : ' + item.data.count + ' should be less than 20000    ' + (parseInt(item.data.count, 10) - 20000) + ' Observations are missing')
      console.log('Request had : ' + stationsInUrl.length + ' stations : ' + stationsInUrl)
      _.forEach(stationsInUrl, (stationCode) => {
        console.log('stations ' + stationCode + ' had an estimation of ' + dictstations['#' + stationCode].est)
      })
    }
    _.forEach(item.data.data, (obs) => {
      const timeObs = new Date(obs.date_obs)
      const station = dictstations['#' + obs.stationCode]

      // We check if the new observation is more recent than the last stored observation of the station
      if (
        (obs.grandeur_hydro === 'H' && timeObs > new Date(station.last_H)) ||
        (obs.grandeur_hydro === 'Q' && timeObs > new Date(station.last_Q))
      ) {
        // console.log("New observation for station "+obs.stationCode+" : "+obs.grandeur_hydro+" : "+obs.resultat_obs+" at "+timeObs.toISOString() + " (last stored obs was at "+ new Date(station.last_H).toISOString()+")")

        dictstations['#' + obs.stationCode].real_count++
        const featureObservation = {
          type: 'Feature',
          time: timeObs.toISOString(),
          grandeur_hydro: obs.grandeur_hydro,
          geometry: station.geometry,
          properties: {
            name: station.name,
            stationCode: '#' + obs.stationCode,
            en_service: true,
            [obs.grandeur_hydro]: obs.resultat_obs / 1000
          }
        }
        dataToSave.push(featureObservation)
      }
    })
    if (dataToSave.length > 0) {
      total += dataToSave.length
      console.log(dataToSave.length + ' new observations found by task ' + item.id.substring(13) + ' [ ' + stationsInUrl.length + ' stations]  [total: ' + total + ']')
    }
    item.data = dataToSave

    return hook
  }
}

hooks.registerHook('processData', processData)
hooks.registerHook('generateTasks', generateTasks)

export default {
  id: 'hubeau-hydro-observations',
  store: 'memory',
  options: {
    workersLimit: 5,
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
        updateMongoCollection: {
          chunkSize: 256,
          collection: 'hubeau-hydro-observations',
          transform: { unitMapping: { time: { asDate: 'utc' } } },
          dataPath: 'data.data',
          upsert: true,
          filter: {
            'properties.stationCode': '<%= properties.stationCode %>',
            time: '<%= time %>',
            grandeur_hydro: '<%= grandeur_hydro %>'
          }
        },
        clearData: {}
      },
      error: {
        apply: {
          function: (item) => {
            console.error('Error for task ' + item.id.substring(13) + ' : ' + item.error)
            console.error('[task ' + item.id.substring(13) + '] had : ' + item.options.url.split('code_entite=')[1].split('&')[0].split(',').length + ' stations [' + item.options.url.split('code_entite=')[1].split('&')[0].split(',') + ']')
            console.error('Url was : ' + item.options.url)
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
            path: OUTPUT_DIR
          }
        }],
        connectMongo: {
          url: DB_URL,
          // Required so that client is forwarded from job to tasks
          clientPath: 'taskTemplate.client'
        },
        createMongoCollection: {
          clientPath: 'taskTemplate.client',
          collection: 'hubeau-hydro-observations',
          indices: [
            [{ time: 1 }, { expireAfterSeconds: TTL }], // days in s
            { 'properties.stationCode': 1 },
            [{ 'properties.stationCode': 1, time: -1 }, { background: true }],
            [{ 'properties.stationCode': 1, 'properties.H': 1, time: -1 }, { background: true }],
            [{ 'properties.stationCode': 1, 'properties.Q': 1, time: -1 }, { background: true }],
            { 'properties.Q': 1 },
            { 'properties.H': 1 },
            { geometry: '2dsphere' }
          ]
        },
        getStations: {
          hook: 'readMongoCollection',
          clientPath: 'taskTemplate.client',
          collection: 'hubeau-hydro-stations',
          filter: { 'properties.en_service': true },
          dataPath: 'data.stations'
        },
        createDict: {
          hook: 'apply',
          function: (item) => {
            // We create a dictionnary of stations, with the code of the station as a key
            dictstations = {}
            _.forEach(item.stations, (station) => {
              // In the dictstations we add the name of the station, and its geometry (its coordinates) but without the crs section
              // created with the code of the station as a key,
              // we also prepare the date of the last observations (last_H and last_Q) for now it's the date of today minus HISTORY
              const actualTime = Date.now()
              dictstations[station.properties.stationCode] = {
                name: station.properties.libelle_station,
                geometry: { type: station.geometry.type, coordinates: station.geometry.coordinates },
                last_H: (actualTime - HISTORY),
                last_Q: (actualTime - HISTORY),
                est: Math.round((actualTime - (actualTime - HISTORY)) / 300000) * 2
              }
            })

            console.log('Searching for stored observations in the database')
            dbSearchTime = new Date().getTime()
          }
        },
        lastStoredH: {
          hook: 'createMongoAggregation',
          clientPath: 'taskTemplate.client',
          collection: 'hubeau-hydro-observations',
          dataPath: 'data.lastH',
          pipeline: [
            {
              $match: {
                'properties.H': {
                  $exists: true
                },
                time: {
                  // We only take the observations of the last 24 hours
                  $gte: new Date(Date.now() - 86400000).toISOString()
                }
              }
            },
            {
              $group: {
                _id: '$properties.stationCode',
                last_H: { $max: '$time' }
              }
            }
          ],
          allowDiskUse: true
        },
        lastStoredQ: {
          hook: 'createMongoAggregation',
          clientPath: 'taskTemplate.client',
          collection: 'hubeau-hydro-observations',
          dataPath: 'data.lastQ',
          pipeline: [
            {
              $match: {
                'properties.Q': {
                  $exists: true
                },
                time: {
                  // We only take the observations of the last 24 hours
                  $gte: new Date(Date.now() - 86400000).toISOString()
                }
              }
            },
            {
              $group: {
                _id: '$properties.stationCode',
                last_Q: { $max: '$time' }
              }
            }
          ],
          allowDiskUse: true
        },
        FinalDict: {
          hook: 'apply',
          function: (item) => {
            console.log('Search ended at : ' + new Date().toISOString())
            console.log('Search took : ' + ((new Date().getTime() - dbSearchTime) / 1000) + ' seconds')

            // We convert item.lastH and lastQ into a dict with the station code as a key and the date of the last observation as a value
            item.lastH = _.keyBy(item.lastH, '_id')
            item.lastQ = _.keyBy(item.lastQ, '_id')

            _.forEach(Object.keys(dictstations), (stationCode) => {
              const station = dictstations[stationCode]

              // We look if the station is in item.lastH and item.lastQ
              if (item.lastH[stationCode]) {
                station.last_H = new Date(item.lastH[stationCode].last_H).getTime()
              }

              if (item.lastQ[stationCode]) {
                station.last_Q = new Date(item.lastQ[stationCode].last_Q).getTime()
              }

              // We take the oldest date between the two
              station.last_obs = Math.min(new Date(station.last_H), new Date(station.last_Q))

              // console.log("Station "+stationCode+" : last H : "+new Date(station.last_H).toISOString()+" last Q : "+ new Date(station.last_Q).toISOString()+" last obs : "+new Date(station.last_obs).toISOString())
              // We calculate the number of observations that we estimate to receive (it's a maximum)
              // Assuming that observations are made every 5 minutes, whether they are observations of Q AND H
              // And that the station is active

              station.est = Math.round((Date.now() - station.last_obs) / 300000) * 2 // We multiply by 2 because we have 2 observations per 5 minutes (Q and H)
            })
            console.log('Number of stations : ' + Object.keys(dictstations).length)
            // We sort the dictstations in descending order of the `est` field while keeping the keys
            dictstations = _.fromPairs(_.orderBy(_.toPairs(dictstations), [([key, value]) => value.est], ['desc']))
            const size = 17000 // Limit is 20000 but we leave a margin juste in case
            const batch = [[]]
            let totalBatchEst = 0

            // We group together the stations that have roughly the same number of observations to receive
            let lastStationEst = dictstations[Object.keys(dictstations)[0]].est
            _.forEach(Object.keys(dictstations), (stationCode) => {
              const estimation = dictstations[stationCode].est

              // a batch needs to have less than `size` observations, less than 570 stations and the difference between the estimation of the last station and the current station needs to be less than 20
              // because the query will be based on the station with the oldest time of last observation, meaning we can get observations we already have
              if (totalBatchEst + estimation < size && Object.keys(batch[batch.length - 1]).length < 570 && Math.abs(estimation - lastStationEst) <= 20) {
                // We add the station to the last sub-dict of batch, with the station code as a key and the station dict as a value
                batch[batch.length - 1][stationCode] = dictstations[stationCode]
                totalBatchEst += estimation
              } else {
                // We add the station to a new sub-dict of batch
                // if(estimation!=lastStationEst){
                //   console.log('new batch because of estimation')
                // }
                // if(totalBatchEst + estimation >= size){
                //   console.log('new batch because of size')
                // }
                // if(Object.keys( batch[batch.length-1]).length >= 570){
                //   console.log('new batch because of number of stations')
                // }

                batch.push({ [stationCode]: dictstations[stationCode] })
                totalBatchEst = estimation
                lastStationEst = estimation
              }
            })
            item.batch = batch
          }
        },
        generateTasks: {
          baseUrl: 'https://hubeau.eaufrance.fr/api/v2/hydrometrie/observations_tr?'
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
