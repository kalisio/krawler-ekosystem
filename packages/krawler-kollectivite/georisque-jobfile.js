import { hooks } from '@kalisio/krawler'
import path from 'path'
import makeDebug from 'debug'
import _ from 'lodash'
import { fileURLToPath } from 'url'
import { features } from 'process'
import { fetchInseeCodes } from './utils.js'


const __dirname = path.dirname(fileURLToPath(import.meta.url))
const debug = makeDebug('krawler:georisque-job')
const INSEE_CODES = process.env.INSEE_CODES?.split(',') || ['31555', '30007', '33063', '33243', '33179'];
const SIREN_CODES = process.env.SIREN_CODES?.split(',') || ['243100518',];


// Hook pour générer les tâches
const generateTasks = (options) => {
    return (hook) => {
        const tasks = []

        // for each CODE_INSEE
        hook.data.inseeCodes.forEach((code) => {
            for (let i = 1; i <= 3; i++) {
                // - 1 : Seveso seuil haut
                // - 2 : Seveso seuil bas
                // - 3 : Non Seveso
                const fullUrl = `${options.baseUrl}code_insee=${code}&page_size=1000&statutSeveso=${i}`
                const type = (i === 3) ? 'icpe' : 'seveso'
                const task = {
                    id: `georisque-${type}-${code}-${i}`,
                    options: {
                        url: fullUrl,
                        sevesoStatus: i,
                        inseeCode: code,
                        type
                    }
                }
                tasks.push(task)
            }
        })


        debug('Generated tasks', tasks)
        hook.data.tasks = tasks
        return hook
    }
}

const convertToGeoJson = (options) => {
    return (hook) => {
        const item = hook.data
        const sevesoStatus = item.options.sevesoStatus
        const inseeCode = item.options.inseeCode
        const features = []


        _.forEach(item.data.data, (entry) => {
            const { latitude, longitude, ...properties } = entry

            const feature = {
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [longitude, latitude]
                },
                properties
            }

            features.push(feature)
            // console.log(`Converted entry to feature: ${JSON.stringify(feature)}`)
        })
        item.data.data = features
        console.log(`Total features for code ${inseeCode} and seveso status ${sevesoStatus}: [${features.length}]`)
        return hook
    }
}

hooks.registerHook('convertToGeoJson', convertToGeoJson)
hooks.registerHook('generateTasks', generateTasks)
hooks.registerHook('fetchInseeCodes', fetchInseeCodes)

export default {
    id: 'georisque-job',
    store: 'output-store',
    taskTemplate: {
        store: 'output-store',
        type: 'http',
    },
    options: {
        workersLimit: 2,
    },
    hooks: {
        tasks: {
            after: {
                readJson: {},
                convertToGeoJson: {}
            }
        },
        jobs: {
            before: {
                createStores: [{
                    id: 'output-store',
                    type: 'fs',
                    storePath: 'taskTemplate.outputStore',
                    options: { path: path.join(__dirname, '.', 'output', 'georisque_output') }
                }],
                fetchInseeCodes: {},
                generateTasks: {
                    baseUrl: 'https://georisques.gouv.fr/api/v1/installations_classees?',
                }
            },
            after: {
                merge: {
                    hook: "apply",
                    function: (result) => {
                        const merged = {
                            seveso: [],
                            icpe: []
                        };

                        // We want to distinguish between seveso and icpe features and create separate collections
                        // for this we need to change the structure of the result, since it still needs to be an array
                        // we define indexes 0 and 1 for seveso and icpe respectively, so we can write them separately later in the writeJson hooks
                        for (const item of result) {
                            const { options: { type }, data: { data: features } } = item;
                            if (type === 'seveso') {
                                merged.seveso.push(...features);
                            } else if (type === 'icpe') {
                                merged.icpe.push(...features);
                            }
                        }

                        // Put 0: for seveso and 1: for icpe
                        // But keep the rest of the result after because the hook "clearOutputs" needs it to remove the task's outputs
                        // so that we only keep the seveso and icpe files
                        const rest = result.slice();
                        result.length = 0;
                        result.push(
                            { type: 'FeatureCollection', features: merged.seveso },
                            { type: 'FeatureCollection', features: merged.icpe },
                            ...rest
                        );
                    },
                    perItem: false, // Used so that the apply hook only runs once for the whole result and not for each item
                },
                write_seveso: {
                    hook: "writeJson",
                    key: 'seveso.json',
                    dataPath: "result.0",
                    outputType: 'geojson',
                },
                write_icpe: {
                    hook: "writeJson",
                    key: 'icpe.json',
                    dataPath: "result.1",
                    outputType: 'geojson',
                },
                clearOutputs: {},
                removeStores: ['output-store']
            }
        }
    }
}
