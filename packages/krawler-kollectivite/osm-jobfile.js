import { hooks } from '@kalisio/krawler'
import path from 'path'
import makeDebug from 'debug'
import { fileURLToPath } from 'url'
import input_tasks from './osm-tasks.js'


const __dirname = path.dirname(fileURLToPath(import.meta.url))
const debug = makeDebug('krawler:osm-job')
const TIMEOUT = process.env.OVERPASS_TIMEOUT || 180
const INSEE_CODES = process.env.INSEE_CODES?.split(',') || ['31555', '30007'];
const SIREN_CODES = process.env.SIREN_CODES?.split(',') || []
const OVERPASS_API_URL = process.env.OVERPASS_API_URL || 'https://overpass-api.de/api/interpreter'
const OSM_TASK_FILTER = process.env.OSM_TASK_FILTER || '.*'

// Génère une tâche pour une requête OSM donnée
const generateTask = (id, query, properties) => {
  return {
    id,
    options: {
      data: query,
      url: OVERPASS_API_URL,
      properties
    }
  }
}

function buildFilterString(filters) {
  return filters
    .map(filterObj => {
      return Object.entries(filterObj)
        .map(([k, v]) => {
          if (Array.isArray(v)) {
            return `"${k}"~"${v.join('|')}"`;
          } else {
            return `"${k}"="${v}"`;
          }
        })
        .join('][');
    })
    .map(f => `[${f}]`)
    .join('');
}

function buildRequest(task) {
  let query = `[out:json][timeout:${TIMEOUT}];\n`;

  // convertit tableau INSEE et SIREN en expressions régulières (les ',' sont remplacés par '|')
  const inseeFilter = Array.isArray(INSEE_CODES) && INSEE_CODES.length > 0
    ? INSEE_CODES.join('|')
    : null;

  const sirenFilter = Array.isArray(SIREN_CODES) && SIREN_CODES.length > 0
    ? SIREN_CODES.join('|')
    : null;

  const areaRefs = [];

  // Merge les filtres INSEE et SIREN
  if (inseeFilter) {
    query += `area["ref:INSEE"~"${inseeFilter}"]->.a1;\n`;
    areaRefs.push('.a1');
  }

  if (sirenFilter) {
    query += `area["ref:FR:SIREN"~"${sirenFilter}"]->.a2;\n`;
    areaRefs.push('.a2');
  }

  if (areaRefs.length > 0) {
    query += `(${areaRefs.join('; ')};)->.a;\n`;
  }

  // Début de la requête principale
  query += '(\n';

  const types = ['nwrs', 'ways', 'relations', 'nodes'];

  for (const type of types) {
    if (Array.isArray(task[type])) {
      for (const group of task[type]) {
        if (!Array.isArray(group) || group.length === 0) continue;

        const osmType =
          type === 'nwrs' ? 'nwr' :
          type === 'ways' ? 'way' :
          type === 'relations' ? 'relation' :
          type === 'nodes' ? 'node' : type;

        const filtersStr = buildFilterString(group);
        query += `  ${osmType}${filtersStr}(area.a);\n`;
      }
    }
  }

  // Fin de l’union
  query += ');\n';
  query += `out ${task.out || 'center'};`;

  return query;
}


// Hook pour générer les tâches
const generateTasks = () => {
  return (hook) => {
    const tasks = []
    for (const [id, query] of Object.entries(input_tasks)) {
      // Check if the task matches the OSM_TASK_FILTER, its a regex
      if (!new RegExp(OSM_TASK_FILTER).test(id)) {
        debug(`Skipping task ${id} as it does not match the filter ${OSM_TASK_FILTER}`);
        continue;
      }
      console.log(`Generating task for ${id} for Code INSEE ${INSEE_CODES} and SIREN ${SIREN_CODES}`);
      const queryString = buildRequest(query)
      const task = generateTask(id, queryString, query.properties)
      tasks.push(task)
    }


    hook.data.tasks = tasks
    return hook
  }
}

hooks.registerHook('generateTasks', generateTasks)

export default {
  id: 'osm-job',
  store: 'output-store',
  taskTemplate: {
    store: 'output-store',
    type: 'overpass',
  },
  options: {
    workersLimit: 2,
    faultTolerant: true,
  },
  hooks: {
    tasks: {
      before: {
        basicAuth: { type: 'Proxy-Authorization' }
      },
      after: {
        readJson: {},
        convertOSMToGeoJson: {},
        apply: {
          function: (task) => {
            Object.assign(task.data, task.options.properties);
          }
        },
        writeJson: {
          outputType: 'geojson'
        }
      }
    },
    jobs: {
      before: {
        createStores: [{
          id: 'output-store',
          type: 'fs',
          storePath: 'taskTemplate.outputStore',
          options: { path: path.join(__dirname, '.','output','osm_output') }
        }],
        generateTasks: {}
      },
      after: {
        clearOutputs: {},
        removeStores: ['output-store']
      }
    }
  }
}
