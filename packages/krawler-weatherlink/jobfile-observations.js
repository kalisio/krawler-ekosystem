import _ from 'lodash'
import { hooks } from '@kalisio/krawler'
import { signParam } from './weatherlink-signature.js'

const outputDir = './output'

// Configuration
const dbUrl = process.env.DB_URL || 'mongodb://127.0.0.1:27017/kano'
const API_KEY = process.env.API_KEY || (console.error("API_KEY is not defined"), process.exit(1))
const API_SECRET = process.env.API_SECRET || (console.error("API_SECRET is not defined"), process.exit(1))
const STN_COLLECTION = process.env.STN_COLLECTION || 'weatherlink-stations'
const OBS_COLLECTION = process.env.OBS_COLLECTION || 'weatherlink-observations'


//const DATA_TYPE = process.env.DATA_TYPE && process.env.DATA_TYNegative potential consequences of an action.PE.split(',') || [ '23'['1','2','3','4','5','6','7','8','9','10','11','12','13','14','15','18','19','20','21','22','23','24','25','26','27']
const SUPPORTED_DATA_TYPES = [23]
const ttl = parseInt(process.env.TTL) || (7 * 24 * 60 * 60)  // duration in seconds
const timeout = parseInt(process.env.TIMEOUT) || (30 * 60 * 1000) // duration in milliseconds

let dictstations = null
let total = null

function toDegreeCelcius (value) {
  return (value - 32) * 5 / 9
}

function toMeterPerSecond (value) {
  return (value) * 1 / 3.6
}

// Create a custom hook to generate tasks
let generateTasks = (options) => {
 return (hook) => {
   total = 0
   let tasks = []
   // For all the keys of the dictstations dictionary
   _.forEach(Object.keys(dictstations), (code_station) => {
       // We prepare the request parameters
       let param = {"station-id": code_station }
       // We sign the request
       param = signParam(param,API_KEY,API_SECRET)
       let task = {
           // The task id is the position in the list of keys of the dictstations dictionary
           id: Object.keys(dictstations).indexOf(code_station),
           options: {
               url:  options.baseUrl+code_station + '?api-key=' + param["api-key"] + '&api-signature=' + param["api-signature"] + '&t=' + param["t"]
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
 id: 'weatherlink-observations',
 store: 'memory',
 options: {
   workersLimit: 45,
   faultTolerant: true,
   timeout: timeout
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
       processData: {
         hook: "apply",
         function: (item) => {
            //console.log(JSON.stringify(item.data, null, 2));
           let dataToSave = []
           let station_id = item.data.station_id
           _.forEach(item.data.sensors, (data) => {
             const obstime = new Date(data.data[0].ts * 1000)
             const data_structure_type = data.data_structure_type
             // if the data type is in the DATA_TYPE list and the obs is more recent than the last one
             if(SUPPORTED_DATA_TYPES.includes(data_structure_type) && (obstime > new Date(dictstations[station_id].last_obs[data_structure_type] || dictstations[station_id].last_obs[data_structure_type] === undefined))){
               console.log(data)
               let feature = {
                 type: 'Feature',
                 time: obstime,
                 geometry: dictstations[station_id].geometry,
                 properties: {
                   station_id : station_id,
                   lsid : data.lsid,
                   sensor_type : data.sensor_type,
                   data_structure_type:  data_structure_type,
                   temperature: toDegreeCelcius(data.data[0].temp),
                   humidity: data.data[0].hum,
                   windDirection: data.data[0].wind_dir_scalar_avg_last_10_min,
                   windSpeed: toMeterPerSecond(data.data[0].wind_speed_avg_last_10_min),
                   precipitations: data.data[0].rainfall_last_60_min_mm,
                 }
               }
               // We add all the keys of data.data[0] in properties
               _.forEach(Object.keys(data.data[0]), (key) => {
                 feature.properties[key] = data.data[0][key]
               })
               console.log("[Total: "+(++total)+"] new data for station " + station_id + " : " + feature.time.toISOString() + ", data type : " + feature.properties.data_structure_type)
               dataToSave.push(feature)
             }
           })
           item.data = dataToSave
         }
       },
       writeMongoCollection: {
         chunkSize: 256,
         collection: OBS_COLLECTION,
         transform: { unitMapping: { time: { asDate: 'utc' } } },
         dataPath: 'data.data'
       },
       clearData: {}
     },
     error: {
       apply: {
         function: (item) => {
           console.error('Error for task ' + item.id.substring(13) + ' : ' + item.error)
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
         url: dbUrl,
         // Required so that client is forwarded from job to tasks
         clientPath: 'taskTemplate.client'
       },
       createMongoCollection: {
         clientPath: 'taskTemplate.client',
         collection: OBS_COLLECTION,
         indices: [
           [{ time: 1 }, { expireAfterSeconds: ttl }], // days in s
           { 'properties.station_id': 1 },
           [{ 'properties.station_id': 1, time: -1 }, { background: true }],
           { geometry: '2dsphere' }
         ],
       },
       getStations: {
         hook: 'readMongoCollection',
         clientPath: 'taskTemplate.client',
         collection: STN_COLLECTION,
         dataPath: 'data.stations',
       },
       lastStoredObs: {
         hook: 'createMongoAggregation',
         clientPath: 'taskTemplate.client',
         collection: OBS_COLLECTION,
         dataPath: 'data.lastObs',
         pipeline: [
           {
             $group: {
               '_id': '$properties.station_id',
               'last_obs_by_data_structure_type': {
                 '$push': {
                   k: { '$toString': '$properties.data_structure_type' },
                   v: '$time'
                 }
               }
             }
           },
           {
             $project: {
               _id: 0,
               station_id: '$_id',
               last_obs_by_data_structure_type: { '$arrayToObject': '$last_obs_by_data_structure_type' }
             }
           }
         ]
       },
       createDict: {
         hook: 'apply',
         function: (item) => {
           // We create a dictionnary of stations, with the code of the station as a key
           dictstations = {}
           item.lastObs = _.keyBy(item.lastObs, 'station_id')
           _.forEach(item.stations, (station) => {
             // In the dictstations we add the name of the station, and its geometry (its coordinates)
             // created with the code of the station as a key,
             // we also add the date of the last observation for each data type (data_structure_type), if we have at least one observation else we add an empty object
             dictstations[station.properties.station_id] = {
               properties: { name: station.properties.station_name },
               geometry: { type: station.geometry.type, coordinates: station.geometry.coordinates },
               last_obs: item.lastObs[station.properties.station_id]?.last_obs_by_data_structure_type || {}
             }
           })
         }
       },
       generateTasks: {
         baseUrl: 'https://api.weatherlink.com/v2/current/',
       },
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




