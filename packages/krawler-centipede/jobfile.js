import _ from 'lodash'

const DB_URL = process.env.DB_URL || 'mongodb://127.0.0.1:27017/centipede'
const TTL = parseInt(process.env.TTL) || (7 * 24 * 60 * 60) // duration in seconds

export default {
  id: 'centipede',
  store: 'memory',
  options: {
    workersLimit: 1,
    faultTolerant: true
  },
  tasks: [{
    id: 'basesrtk',
    type: 'wfs',
    options: {
      url: 'https://map.centipede-rtk.org/index.php/lizmap/service/?repository=cent&project=centipede&VERSION=1.3.0&SERVICE=WFS&REQUEST=GetFeature&typeName=basesrtk&outputformat=geojson'
    }
  }],
  hooks: {
    tasks: {
      after: {
        readJson: {},
        apply: {
          function: (item) => {
            const bases = []
            const pings = []
            _.forEach(item.data.features, (feature) => {
              const base = {
                type: feature.type,
                geometry: feature.geometry,
                properties: _.pick(feature.properties, [
                  'id',
                  'mp',
                  'data_format',
                  'systeme',
                  'frequence',
                  'recepteur',
                  'type_antenne',
                  'rapport',
                  'receiver',
                  'version',
                  'antenne',
                  'syscoor'
                ])
              }
              if (feature.rapport) base.rapport = 'https://centipede.fr/index.php/view/media/' + feature.rapport
              bases.push(base)
              pings.push({
                type: feature.type,
                geometry: feature.geometry,
                properties: {
                  id: feature.properties.id,
                  name: feature.properties.mp,
                  ping: feature.properties.ping === 'active' ? feature.properties.rapport ? 2 : 1 : 0,
                  message: feature.properties.rtcm_messages,
                  key: feature.properties.id + '-' + feature.properties.check_activite
                },
                time: feature.properties.check_activite
              })
            })
            item.bases = bases
            item.pings = pings
          }
        },
        updateBasesCollection: {
          hook: 'updateMongoCollection',
          collection: 'centipede-bases',
          dataPath: 'result.bases',
          filter: { 'properties.id': '<%= properties.id %>' },
          upsert: true,
          transform: {
            mapping: {
              'properties.mp': 'properties.name'
            }
          },
          chunkSize: 256
        },
        updatePingsCollection: {
          hook: 'updateMongoCollection',
          collection: 'centipede-pings',
          dataPath: 'result.pings',
          filter: { 'properties.key': '<%= properties.key %>' },
          upsert: true,
          transform: {
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
          TTL
        },
        createStores: { id: 'memory' },
        connectMongo: {
          url: DB_URL,
          // Required so that client is forwarded from job to tasks
          clientPath: 'taskTemplate.client'
        },
        createBasesCollection: {
          hook: 'createMongoCollection',
          clientPath: 'taskTemplate.client',
          collection: 'centipede-bases',
          indices: [
            [{ 'properties.id': 1 }, { unique: true }],
            { geometry: '2dsphere' }
          ]
        },
        createPingsCollection: {
          hook: 'createMongoCollection',
          clientPath: 'taskTemplate.client',
          collection: 'centipede-pings',
          indices: [
            [{ time: 1 }, { expireAfterSeconds: TTL }], // days in s
            [{ time: 1, 'properties.id': 1 }, { unique: true }],
            { 'properties.ping': 1 },
            { geometry: '2dsphere' }
          ]
        }
      },
      after: {
        disconnectMongo: {
          clientPath: 'taskTemplate.client'
        },
        removeStores: ['memory']
      },
      error: {
        disconnectMongo: {
          clientPath: 'taskTemplate.client'
        },
        removeStores: ['memory']
      }
    }
  }
}
