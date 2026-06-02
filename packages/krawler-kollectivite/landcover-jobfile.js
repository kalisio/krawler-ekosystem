import { hooks } from '@kalisio/krawler'
import path from 'path'
import makeDebug from 'debug'
import _ from 'lodash'
import { fileURLToPath } from 'url'


const __dirname = path.dirname(fileURLToPath(import.meta.url))
const debug = makeDebug('krawler:landcover-jobfile')
const CLC_CODES = process.env.CLC_CODES?.split(',') || ['111', '112', '121'];
const OVERPASS_API_URL = process.env.OVERPASS_API_URL || 'https://overpass-api.de/api/interpreter?data='
const INSEE_CODES = process.env.INSEE_CODES?.split(',') || ['31555', '30007'];
const SIREN_CODES = process.env.SIREN_CODES?.split(',') || []

// 111 code for "Urban fabric" in Corine Land Cover 2018
// 112 code for "Industrial or commercial units"
// 121 code for "Arable land"

const generateTasks = (options) => {
    return async (hook) => {
        const tasks = [];
        const bounds = [];

        const fetchBounds = async (filterTag, filterValue, meta, boundaryType) => {
            if (!filterValue) return;
            const overpassQuery = `[out:json][timeout:25];
                    relation["boundary"="${boundaryType}"]["${filterTag}"~"${filterValue}"];
                    out bb;`;
            const url = `${OVERPASS_API_URL}${encodeURIComponent(overpassQuery)}`;
            const res = await fetch(url);
            if (!res.ok) {
                throw new Error(`Failed to fetch bounding box for ${filterTag}=${filterValue}: ${res.status} ${res.statusText}`);
            }
            const { elements } = await res.json();
            if (!elements?.[0]?.bounds) {
                throw new Error(`No bounding box found for ${filterTag}=${filterValue}`);
            }
            bounds.push({ ...elements[0].bounds, ...meta });
        };

        for (const insee of (INSEE_CODES ?? [])) {
            await fetchBounds('ref:INSEE', insee, { id: `insee-${insee}`, inseeCode: insee }, 'administrative');
        }

        for (const siren of (SIREN_CODES ?? [])) {
            await fetchBounds('ref:FR:SIREN', siren, { id: `siren-${siren}`, sirenCode: siren }, 'local_authority');
        }

        for (const bound of bounds) {
            const { minlat, minlon, maxlat, maxlon, id, ...boundMeta } = bound;
            const bboxFilter = `BBOX(geom,${minlon},${minlat},${maxlon},${maxlat},'EPSG:4326')`;

            for (const clc of CLC_CODES) {
                const fullUrl = `${options.baseUrl}&CQL_FILTER=${bboxFilter} AND code_18=${clc}`;
                const task = {
                    id: `landcover-${id}-${clc}`,
                    options: { url: fullUrl, code_18: clc, ...boundMeta }
                };
                debug(`Generated task for ${id} and CLC code ${clc}: ${fullUrl}`);
                tasks.push(task);
            }
        }

        debug(`Generated ${tasks.length} tasks`);
        hook.data.tasks = tasks;
        return hook;
    };
};



const testHook = (options) => {
    return async (hook) => {
        const writeJsonFunction = hooks.getHookFunction('writeJson');
        const groupedTasks = {}; // We will group tasks by code_18

        for (const result of hook.result) {
            const code18 = result.options.code_18;

            // Create an artificial task for each code_18
            if (!groupedTasks[code18]) {
                groupedTasks[code18] = {
                    id: `landcover-${code18}`,
                    store: result.store,
                    type: result.type,
                    outputStore: result.outputStore,
                    options: { code_18: code18 }, // utile pour retrouver le code
                    data: { "type": "FeatureCollection", "features": [] },
                };
            }

            groupedTasks[code18].data.features.push(...result.data);
        }

        // Put the grouped tasks at the beginning of the result, so that it is easier to find them for the writeJson hook
        // We need to keep the olds tasks in the result, so that the clearOutputs hook can remove them
        hook.result = [...Object.values(groupedTasks), ...hook.result];

        // Write JSON for each grouped task
        for (const task of Object.values(groupedTasks)) {
            const index = hook.result.findIndex(t => t.id === task.id);

            const opts = {
                key: `${task.id}.json`,
                dataPath: `result.${index}.data`,
            };
            debug(`Writing JSON for task ${task.id}`);
            await writeJsonFunction(opts)(hook);
        }

        return hook;
    };
};

hooks.registerHook('testHook', testHook)
hooks.registerHook('generateTasks', generateTasks)

export default {
    id: 'landcover-job',
    store: 'output-store',
    taskTemplate: {
        store: 'output-store',
        type: 'wfs',
    },
    options: {
        workersLimit: 2,
    },
    hooks: {
        tasks: {
            after: {
                readJson: {},
                cleanGeojson: {
                    hook: "apply",
                    function: async (hook) => {
                        // Check that data.features exists and is an array
                        if (!Array.isArray(hook.data?.features)) {
                            console.error('Invalid GeoJSON FeatureCollection:', hook.data);
                            return hook;
                        }

                        // Keep only type, geometry, and properties for each feature
                        hook.data = hook.data.features.map(({ type, geometry, properties }) => ({
                            type,
                            geometry,
                            properties
                        }));

                        return hook;
                    }
                },
                wait: {}
            }
        },
        jobs: {
            before: {
                createStores: [{
                    id: 'output-store',
                    type: 'fs',
                    storePath: 'taskTemplate.outputStore',
                    options: { path: path.join(__dirname, '.', 'output', 'landcover_output') }
                }
                ],
                generateTasks: {
                    baseUrl: 'https://data.geopf.fr/wfs/ows?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=LANDCOVER.CLC18_FR:clc18_fr&OUTPUTFORMAT=application/json&SRSNAME=EPSG:4326'
                }
            },
            after: {

                testHook: {},
                clearOutputs: {},
                removeStores: ['output-store']
            }
        }
    }
}

