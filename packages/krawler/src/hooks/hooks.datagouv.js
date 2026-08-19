import _ from 'lodash'
import fs from 'fs'
import path from 'path'
import { buffer as streamToBuffer } from 'node:stream/consumers'
import makeDebug from 'debug'
import { callOnHookItems, getStoreFromHook, templateObject } from '../utils.js'
import logger from '../logger.js'

const debug = makeDebug('krawler:hooks:datagouv')

// Default data.gouv.fr API base URL
const DEFAULT_API_URL = 'https://www.data.gouv.fr/api/1'

// Upload a file as a resource on a data.gouv.fr dataset.
// When a 'resource' is given its file is overwritten, otherwise a new resource is created.
// The file is read from a store ('key') or from the file system ('file').
export function uploadDatagouvResource (options = {}) {
  return callOnHookItems(options)(async (item, hook) => {
    const { apiUrl, apiKey, dataset, resource } = getDatagouvApiOptions('uploadDatagouvResource', item, options)
    const { key, file, fileName } = templateObject(item, options, ['key', 'file', 'fileName'])
    if (!key && !file) throw new Error('Missing \'key\' (store) or \'file\' (path) option for the \'uploadDatagouvResource\' hook')

    // Read the file to be uploaded, udata expects it under the 'file' multipart field
    const name = fileName || path.basename(key || file)
    const store = (key ? await getStoreFromHook(hook, 'uploadDatagouvResource', options) : null)
    const form = new FormData()
    form.append('file', await getBlob(store, key, file, options.contentType), name)

    logger.info(`Uploading ${name} on data.gouv.fr dataset ${dataset}` + (resource ? ` (resource ${resource})` : ''))
    const uploaded = await callDatagouvApi(apiUrl, apiKey, 'POST', resource
      ? `/datasets/${dataset}/resources/${resource}/upload/`
      : `/datasets/${dataset}/upload/`, { body: form })
    const uploadedResource = uploaded.id || resource
    logger.info(`Uploaded ${name} as resource ${uploadedResource} on data.gouv.fr dataset ${dataset}`)

    // Resource metadata (title, description, format, ...) can only be set once the file has been uploaded
    if (options.metadata) {
      const metadata = templateObject(item, options.metadata)
      debug(`Updating metadata of resource ${uploadedResource}`, metadata)
      await callDatagouvApi(apiUrl, apiKey, 'PUT', `/datasets/${dataset}/resources/${uploadedResource}/`, { json: metadata })
      logger.info(`Updated metadata of resource ${uploadedResource} on data.gouv.fr dataset ${dataset}`)
    }

    _.set(item, options.dataPath || 'datagouv', uploaded)
  })
}

// Delete a resource from a data.gouv.fr dataset
export function deleteDatagouvResource (options = {}) {
  return callOnHookItems(options)(async (item) => {
    const { apiUrl, apiKey, dataset, resource } = getDatagouvApiOptions('deleteDatagouvResource', item, options)
    if (!resource) throw new Error('Missing \'resource\' option for the \'deleteDatagouvResource\' hook')

    logger.info(`Deleting resource ${resource} from data.gouv.fr dataset ${dataset}`)
    await callDatagouvApi(apiUrl, apiKey, 'DELETE', `/datasets/${dataset}/resources/${resource}/`)
    logger.info(`Deleted resource ${resource} from data.gouv.fr dataset ${dataset}`)
  })
}

// -----------------------------------------------------------------------------
// UTILS
// -----------------------------------------------------------------------------

// Retrieve the API options of a hook, defaulting to the DATAGOUV_* env variables
function getDatagouvApiOptions (hookName, item, options) {
  const { apiUrl, apiKey, dataset, resource } = templateObject(item, options, ['apiUrl', 'apiKey', 'dataset', 'resource'])
  const datagouvApiUrl = apiUrl || process.env.DATAGOUV_API_URL || DEFAULT_API_URL
  const datagouvApiKey = apiKey || process.env.DATAGOUV_API_KEY
  const datagouvDataset = dataset || process.env.DATAGOUV_DATASET
  if (!datagouvApiKey) throw new Error(`Missing 'apiKey' option or DATAGOUV_API_KEY for the '${hookName}' hook`)
  if (!datagouvDataset) throw new Error(`Missing 'dataset' option or DATAGOUV_DATASET for the '${hookName}' hook`)
  return { apiUrl: datagouvApiUrl, apiKey: datagouvApiKey, dataset: datagouvDataset, resource }
}

// Read the file to be uploaded from a store or from the file system
async function getBlob (store, key, file, contentType) {
  const type = { type: contentType }
  if (store) return new Blob([await streamToBuffer(store.createReadStream({ key }))], type)
  // Avoid loading the whole file in memory
  return fs.openAsBlob(file, type)
}

// Perform an authenticated request against the data.gouv.fr (udata) API
async function callDatagouvApi (apiUrl, apiKey, method, endpoint, options = {}) {
  const url = `${apiUrl.replace(/\/$/, '')}${endpoint}`
  const headers = { 'X-API-KEY': apiKey }
  // Multipart body content type is set by fetch itself
  if (options.json) headers['Content-Type'] = 'application/json'
  debug(`Calling data.gouv.fr API ${method} ${url}`)
  const response = await fetch(url, { method, headers, body: options.body || (options.json ? JSON.stringify(options.json) : undefined) })
  const body = await response.text()
  let result = {}
  try {
    result = (body ? JSON.parse(body) : {})
  } catch (error) {
    result = body
  }
  if (!response.ok) throw new Error(`data.gouv.fr API error ${response.status} on ${method} ${url}: ${JSON.stringify(result)}`)
  debug(`Called data.gouv.fr API ${method} ${url}`, result)
  return result
}
