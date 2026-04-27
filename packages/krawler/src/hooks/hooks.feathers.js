import _ from 'lodash'
import feathers from '@feathersjs/client'
import io from 'socket.io-client'
import fetch from 'node-fetch'
import makeDebug from 'debug'
// import { getItems } from 'feathers-hooks-common'
import {
  template, templateObject, templateQueryObject, transformJsonObject,
  getChunks, mergeErrors
} from '../utils.js'

const debug = makeDebug('krawler:hooks:feathers')
const StandardMethods = ['find', 'get', 'create', 'update', 'patch', 'remove']

function buildFeathersClient (hook, options) {
  if (options.distributed) {
    // If we use distributed services then the client is the app itself
    return hook.app
  }
  const client = feathers()
  let transporter
  if (options.transport === 'websocket') {
    const socket = io(options.origin, {
      transports: ['websocket'],
      path: options.path
    })
    transporter = feathers.socketio(socket)
    client.configure(transporter)
  } else {
    transporter = feathers.rest(options.origin).fetch(fetch)
    client.configure(transporter)
  }
  // Register services up-front (required for custom methods)
  if (options.customMethods) {
    options.customMethods.forEach(entry => {
      const service = transporter.service(entry.servicePath)
      client.use(entry.servicePath, service, {
        methods: StandardMethods.concat(entry.methods)
      })
    })
  }
  return client
}

async function maybeAuthenticate (client, options) {
  if (!options.distributed && options.authentication) {
    client.configure(feathers.authentication({
      path: options.authentication.path || '/authentication'
    }))
    const payload = _.omit(options.authentication, ['path'])
    await client.authenticate(payload)
  }
}

// Connect to the feathers API
export function connectFeathers (options = {}) {
  return async function (hook) {
    const item = hook.data // getItems(hook)
    const existing = _.get(item, options.clientPath || 'client')
    if (existing) {
      debug('Already connected to Feathers for ' + item.id)
    } else {
      debug('Connecting to Feathers for ' + item.id)
      const client = buildFeathersClient(hook, options)
      await maybeAuthenticate(client, options)
      _.set(item, options.clientPath || 'client', client)
      debug('Connected to Feathers for ' + item.id)
    }
    return hook
  }
}

// Disconnect from the API
export function disconnectFeathers (options = {}) {
  return async function (hook) {
    const item = hook.data // getItems(hook)
    const client = _.get(item, options.clientPath || 'client')
    if (_.isNil(client)) {
      debug('Already disconnected from Feathers for ' + item.id)
    } else {
      debug('Disconnecting from Feathers for ' + item.id)
      // If authenticated disconnect
      if (typeof client.logout === 'function') await client.logout()
      _.unset(item, options.clientPath || 'client')
      debug('Disconnected from Feathers for ' + item.id)
    }
    return hook
  }
}

function isReadOperation (methodName) {
  return ['find', 'get'].includes(methodName)
}

function isDataOperation (methodName) {
  return ['create', 'patch', 'update'].includes(methodName)
}

function isCustomOperation (methodName) {
  return !StandardMethods.includes(methodName)
}

function templateParams (item, options) {
  // Either we have the complete params object or only the query shortcut
  const templatedQuery = templateQueryObject(item,
    _.get(options, 'params.query', _.get(options, 'query', {})))
  // Avoid templating the special query object already managed above
  const params = (options.params ? templateObject(item, _.omit(options.params, ['query'])) : {})
  params.query = templatedQuery
  return params
}

// Resolve the data argument for a service method call (templated, chunked, possibly flattened)
function resolveCallData (hook, item, methodName, options) {
  if (options.data) return templateObject(item, options.data)
  if (!(isDataOperation(methodName) || isCustomOperation(methodName))) return undefined
  // For write operations allow transform before write by passing transform options for chunking
  let data = getChunks(hook, options)
  // Take care that for single data we need to extract transformed item from first chunks
  if ((data.length === 1) && (data[0].length === 1)) return data[0][0]
  // Only create supports chunks
  if (methodName !== 'create') data = _.flatten(data)
  return data
}

async function callFindGetRemove (service, methodName, item, id, serviceName, options) {
  const params = templateParams(item, options)
  if (methodName === 'find') {
    debug(`Performing ${methodName} on service ${serviceName} with`, params)
    return service[methodName](params)
  }
  debug(`Performing ${methodName} on service ${serviceName} with`, id, params)
  return service[methodName](id, params)
}

async function callPatchUpdateChunks (service, methodName, data, id, serviceName, options, errors) {
  const json = []
  for (const chunk of data) {
    const params = templateParams(chunk, options)
    debug(`Performing ${methodName} on service ${serviceName} with`, id, chunk, params)
    try {
      const result = await service[methodName](id, chunk, params)
      json.push(result)
    } catch (error) {
      if (options.raiseOnItemError) throw error
      errors.push(error)
    }
  }
  return json
}

async function callPatchUpdate (service, methodName, data, id, serviceName, options, errors) {
  if (!Array.isArray(data)) {
    const params = templateParams(data, options)
    debug(`Performing ${methodName} on service ${serviceName} with`, id, data, params)
    return service[methodName](id, data, params)
  }
  return callPatchUpdateChunks(service, methodName, data, id, serviceName, options, errors)
}

async function callCreateChunks (service, methodName, data, serviceName, options, errors) {
  let json = []
  for (const chunk of data) {
    const params = templateParams(chunk, options)
    debug(`Performing ${methodName} on service ${serviceName} with`, chunk, params)
    try {
      let results = await service[methodName](chunk, params)
      if (results.data) results = results.data
      json = json.concat(results)
    } catch (error) {
      if (options.raiseOnChunkError) throw error
      errors.push(error)
    }
  }
  return json
}

async function callCreate (service, methodName, data, serviceName, options, errors) {
  if (!Array.isArray(data)) {
    const params = templateParams(data, options)
    debug(`Performing ${methodName} on service ${serviceName} with`, data, params)
    return service[methodName](data, params)
  }
  return callCreateChunks(service, methodName, data, serviceName, options, errors)
}

async function dispatchServiceMethod (ctx) {
  const { service, methodName, item, id, data, serviceName, options, errors } = ctx
  switch (methodName) {
    case 'find':
    case 'get':
    case 'remove':
      return callFindGetRemove(service, methodName, item, id, serviceName, options)
    case 'patch':
    case 'update':
      return callPatchUpdate(service, methodName, data, id, serviceName, options, errors)
    case 'create':
    default: // Should manage custom methods
      return callCreate(service, methodName, data, serviceName, options, errors)
  }
}

function applyServiceResult (hook, item, methodName, serviceName, json, options) {
  if (!json) return
  if (json.data) json = json.data
  if (!Array.isArray(json)) json = [json]
  debug(`${methodName} on service ${serviceName} returned ${json.length} result(s)`, json)
  // Allow transform after read
  if (isReadOperation(methodName) && options.transform) {
    const templatedTransform = templateObject(item, options.transform)
    json = transformJsonObject(json, templatedTransform)
  }
  // Except if explicitely defined otherwise read operations store results while write operations do not
  const updateResult = (_.has(options, 'updateResult') ? _.get(options, 'updateResult') : isReadOperation(methodName) || isCustomOperation(methodName))
  if (updateResult) _.set(hook, options.dataPath || 'result.data', json)
}

// Perform a service operation
export function callFeathersServiceMethod (options = {}) {
  return async function (hook) {
    const item = hook.data // getItems(hook)
    const client = _.get(item, options.clientPath || 'client')
    if (_.isNil(client)) {
      throw new Error('You must be connected to Feathers before using the \'callFeathersServiceMethod\' hook')
    }

    const serviceName = template(item, _.get(options, 'service', _.snakeCase(item.id)))
    const methodName = template(item, _.get(options, 'method', 'find'))
    const service = client.service(serviceName)
    const id = _.has(options, 'id') ? options.id : item.id
    const data = resolveCallData(hook, item, methodName, options)
    const errors = []

    const json = await dispatchServiceMethod({ service, methodName, item, id, data, serviceName, options, errors })
    applyServiceResult(hook, item, methodName, serviceName, json, options)

    if (errors.length > 1) throw mergeErrors(errors)
    if (errors.length > 0) throw errors[0]
  }
}
