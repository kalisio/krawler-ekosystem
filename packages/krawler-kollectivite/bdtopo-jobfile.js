import { hooks } from '@kalisio/krawler'
import path from 'path'
import makeDebug from 'debug'
import { fileURLToPath } from 'url'
import centroid from '@turf/centroid'
import input_tasks from './bdtopo-tasks.js'
import { fetchInseeCodes } from './utils.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const debug = makeDebug('krawler:bdtopo-job')
const BDTOPO_API_URL = process.env.BDTOPO_API_URL || 'https://data.geopf.fr/wfs/ows'
const BDTOPO_TASK_FILTER = process.env.BDTOPO_TASK_FILTER || '.*'

function buildOGCFilter (filters) {
  if (!filters?.length) return null

  const escapeXml = (str) =>
    String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/'/g, '&apos;')
      .replace(/"/g, '&quot;')

  const predicate = (key, value) =>
    typeof value === 'string' && value.includes('*')
      ? `<PropertyIsLike wildCard='*' singleChar='?' escapeChar='\\' matchCase='false'><PropertyName>${key}</PropertyName><Literal>${escapeXml(value)}</Literal></PropertyIsLike>`
      : `<PropertyIsEqualTo><PropertyName>${key}</PropertyName><Literal>${escapeXml(value)}</Literal></PropertyIsEqualTo>`

  const filterBlock = (filterObj) => {
    const parts = Object.entries(filterObj).map(([key, val]) => {
      if (Array.isArray(val)) {
        const orParts = val.map(v => predicate(key, v)).join('')
        return val.length > 1 ? `<Or>${orParts}</Or>` : orParts
      }
      return predicate(key, val)
    })
    return parts.length > 1 ? `<And>${parts.join('')}</And>` : parts[0]
  }

  const blocks = filters.map(filterBlock)
  const inner = blocks.length > 1 ? `<And>${blocks.join('')}</And>` : blocks[0]
  return `<Filter>${inner}</Filter>`
}

function buildRequest (task, inseeCodes) {
  const allFilters = []
  if (inseeCodes?.length)
    allFilters.push({ insee_commune: inseeCodes.length === 1 ? inseeCodes[0] : inseeCodes })
  if (task.filter && !Array.isArray(task.filter))
    allFilters.push(task.filter)

  const xmlFilter = buildOGCFilter(allFilters)
  //if (xmlFilter) console.log(`\n[FILTER XML] ${task.typename}:\n${xmlFilter}\n`)

  const params = new URLSearchParams({
    SERVICE: 'WFS', VERSION: '2.0.0', REQUEST: 'GetFeature',
    TYPENAMES: task.typename,
    OUTPUTFORMAT: 'application/json',
    SRSNAME: task.srsName || 'EPSG:4326',
  })
  if (xmlFilter) params.set('FILTER', xmlFilter)

  const url = `${BDTOPO_API_URL}?${params.toString()}`
  return url
}

const generateTasks = () => (hook) => {
  const inseeCodes = hook.data.inseeCodes
  hook.data.tasks = Object.entries(input_tasks)
    .filter(([id]) => {
      const ok = new RegExp(BDTOPO_TASK_FILTER).test(id)
      if (!ok) debug(`Skipping task ${id}`)
      return ok
    })
    .map(([id, taskDef]) => {
      return {
        id,
        options: {
          url: buildRequest(taskDef, inseeCodes),
          properties: { ...taskDef.properties, _sourceSrs: taskDef.srsName || 'EPSG:4326' },
          out: taskDef.out
        }
      }
    })
  return hook
}

hooks.registerHook('generateTasks', generateTasks)
hooks.registerHook('fetchInseeCodes', fetchInseeCodes)

export default {
  id: 'bdtopo-job',
  store: 'output-store',
  taskTemplate: { store: 'output-store', type: 'http' },
  options: { workersLimit: 2, faultTolerant: true },
  hooks: {
    tasks: {
      before: {
        basicAuth: { type: 'Proxy-Authorization' }
      },
      after: {
        readJson: {},
        apply: {
          function: (task) => {
            if (task.options.out == "center") {
              task.data.features = task.data.features
              .filter(f => f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon')
              .map(f => centroid(f, { properties: f.properties }))
            }
            const { _sourceSrs, ...cleanProps } = task.options.properties
            Object.assign(task.data, cleanProps)
          }
        },
        reprojectGeoJson: {
          from: 'EPSG:2154',
          to: 'EPSG:4326',
          match: { 'options.properties._sourceSrs': 'EPSG:2154' }
        },
        writeJson: { outputType: 'geojson' }
      },
      error: {
        apply: {
          function: (task) => {
            console.error(`Task: ${task.id}`)
            console.error(`Status: ${task.error?.message || task.error}`)
            console.error(`URL: \n${task.options?.url}`)
          }
        }
      }
    },
    jobs: {
      before: {
        createStores: [{
          id: 'output-store', type: 'fs', storePath: 'taskTemplate.outputStore',
          options: { path: path.join(__dirname, '.', 'output', 'bdtopo_output') }
        }],
        fetchInseeCodes: {},
        generateTasks: {}
      },
      after: {
        clearOutputs: {},
        removeStores: ['output-store']
      }
    }
  }
}