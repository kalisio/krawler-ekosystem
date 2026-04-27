import _ from 'lodash'
import mongo from 'mongodb'
import makeDebug from 'debug'
// import { getItems } from 'feathers-hooks-common'
import {
  template, templateObject, templateQueryObject, transformJsonObject, getStoreFromHook,
  getChunks, mergeErrors, dotify
} from '../utils.js'

const { MongoClient, MongoError, GridFSBucket } = mongo
const debug = makeDebug('krawler:hooks:mongo')

// Resolve the MongoDB client from the hook payload or throw a hook-specific error.
function requireClient (hook, options, hookName) {
  const item = hook.data // getItems(hook)
  const client = _.get(item, options.clientPath || 'client')
  if (_.isNil(client)) {
    throw new Error(`You must be connected to MongoDB before using the '${hookName}' hook`)
  }
  return { item, client }
}

// Resolve the templated collection name (defaulting to a snake-cased item id).
function getCollectionName (item, options) {
  return template(item, _.get(options, 'collection', _.snakeCase(item.id)))
}

// Resolve the templated bucket name (defaulting to a snake-cased item id).
function getBucketName (item, options) {
  return template(item, _.get(options, 'bucket', _.snakeCase(item.id)))
}

// mongodb v4+ removed the strict+callback existence check; use listCollections.
async function collectionExists (db, name) {
  const match = await db.listCollections({ name }, { nameOnly: true }).toArray()
  return match.length > 0
}

// Utility function to create/drop indices
async function dropIndex (collection, collectionName, index) {
  try {
    debug('Dropping index on collection ' + collectionName, index)
    await collection.dropIndex(index)
  } catch (error) {
    // If index does not exist we do not raise
    if (error instanceof MongoError && error.code === 27) {
      debug(collectionName + ' collection index does not exist, skipping drop')
    } else {
      // Rethrow
      throw error
    }
  }
}
async function createIndex (collection, collectionName, index) {
  try {
    // As arguments or single object ?
    if (Array.isArray(index)) {
      debug('Creating index on collection ' + collectionName, ...index)
      await collection.createIndex(...index)
    } else {
      debug('Creating index on collection ' + collectionName, index)
      await collection.createIndex(index)
    }
  } catch (error) {
    // If index already exists with different options we do not raise
    if (error instanceof MongoError && error.code === 85) {
      debug(collectionName + ' collection index does already exist with different options, skipping create')
    } else {
      // Rethrow
      throw error
    }
  }
}

// Connect to the mongo database
export function connectMongo (options = {}) {
  return async function (hook) {
    const item = hook.data // getItems(hook)
    const existing = _.get(item, options.clientPath || 'client')
    if (existing) {
      debug('Already connected to MongoDB for ' + item.id)
    } else {
      debug('Connecting to MongoDB for ' + item.id)
      const url = template(item, _.get(options, 'url', _.snakeCase(item.id)))
      const client = await MongoClient.connect(url, _.omit(options, ['hook', 'url', 'dbName', 'clientPath']))
      let dbName = options.dbName
      if (!dbName) {
        // Extract database name.  Need to remove the connections options if any
        const indexOfDBName = url.lastIndexOf('/') + 1
        const indexOfOptions = url.indexOf('?')
        if (indexOfOptions === -1) dbName = url.substring(indexOfDBName)
        else dbName = url.substring(indexOfDBName, indexOfOptions)
      }
      client.db = client.db(dbName)
      _.set(item, options.clientPath || 'client', client)
      debug('Connected to MongoDB for ' + item.id)
    }
    return hook
  }
}

// Disconnect from the database
export function disconnectMongo (options = {}) {
  return async function (hook) {
    const item = hook.data // getItems(hook)
    const client = _.get(item, options.clientPath || 'client')
    if (_.isNil(client)) {
      debug('Already disconnected from MongoDB for ' + item.id)
    } else {
      debug('Disconnecting from MongoDB for ' + item.id)
      await client.close()
      _.unset(item, options.clientPath || 'client')
      debug('Disconnected from MongoDB for ' + item.id)
    }
    return hook
  }
}

// Drop a collection
export function dropMongoCollection (options = {}) {
  return async function (hook) {
    const { item, client } = requireClient(hook, options, 'dropMongoCollection')
    const collection = getCollectionName(item, options)
    debug('Droping the ' + collection + ' collection')
    try {
      await client.db.dropCollection(collection)
    } catch (error) {
      // If collection does not exist we do not raise
      if (error instanceof MongoError && error.code === 26) {
        debug(collection + ' collection does not exist, skipping drop')
      } else {
        // Rethrow
        throw error
      }
    }
    return hook
  }
}

// Create a collection
export function createMongoCollection (options = {}) {
  return async function (hook) {
    const { item, client } = requireClient(hook, options, 'createMongoCollection')
    const collectionName = getCollectionName(item, options)
    let collection
    if (await collectionExists(client.db, collectionName)) {
      collection = client.db.collection(collectionName)
    } else {
      debug('Creating the ' + collectionName + ' collection')
      collection = await client.db.createCollection(collectionName)
    }
    await applyIndexOperation(createIndex, collection, collectionName, options)
    return hook
  }
}

// Apply a per-index operation (create/drop) over the configured index or indices.
async function applyIndexOperation (operation, collection, collectionName, options) {
  if (options.index) {
    await operation(collection, collectionName, options.index)
  } else if (options.indices) { // Or multiple indices
    for (const index of options.indices) {
      await operation(collection, collectionName, index)
    }
  }
}

// Drop an index
export function dropMongoIndex (options = {}) {
  return async function (hook) {
    const { item, client } = requireClient(hook, options, 'dropMongoIndex')
    const collectionName = getCollectionName(item, options)
    const collection = (await collectionExists(client.db, collectionName))
      ? client.db.collection(collectionName)
      : null
    if (!collection) {
      debug(collectionName + ' collection does not exist, skipping dropping index')
    } else {
      await applyIndexOperation(dropIndex, collection, collectionName, options)
    }
    return hook
  }
}

// Create an index
export function createMongoIndex (options = {}) {
  return async function (hook) {
    const { item, client } = requireClient(hook, options, 'createMongoIndex')
    const collectionName = getCollectionName(item, options)
    const collection = (await collectionExists(client.db, collectionName))
      ? client.db.collection(collectionName)
      : null
    if (!collection) {
      debug(collectionName + ' collection does not exist, skipping creating index')
    } else {
      await applyIndexOperation(createIndex, collection, collectionName, options)
    }
    return hook
  }
}

// Retrieve JSON documents from a collection
export function readMongoCollection (options = {}) {
  return async function (hook) {
    const { item, client } = requireClient(hook, options, 'readMongoCollection')
    const collectionName = getCollectionName(item, options)
    const collection = client.db.collection(collectionName)
    const templatedQuery = templateQueryObject(item, options.query || {}, _.omit(options, ['query']))
    const query = collection.find(templatedQuery)
    if (options.project) query.project(options.project)
    if (options.sort) query.sort(options.sort)
    if (options.limit) query.limit(options.limit)
    if (options.skip) query.skip(options.skip)
    debug(`Querying collection ${collectionName} with`, templatedQuery)
    let json = await query.toArray()
    // Allow transform after read
    if (options.transform) {
      const templatedTransform = templateObject(item, options.transform)
      json = transformJsonObject(json, templatedTransform)
    }

    _.set(hook, options.dataPath || 'result.data', json)
    return hook
  }
}

// Run a per-chunk bulkWrite, collecting non-fatal errors unless raiseOnChunkError is set.
async function runBulkWriteChunks (collection, collectionName, chunks, buildOps, bulkOptions, options, verb) {
  const errors = []
  for (const chunk of chunks) {
    debug(`${verb} ${chunk.length} JSON document in the ${collectionName} collection `)
    try {
      await collection.bulkWrite(chunk.map(buildOps), bulkOptions)
    } catch (error) {
      // Raise on first error ?
      if (options.raiseOnChunkError) throw error
      // Otherwise continue until all chunks have been processed
      errors.push(error)
    }
  }
  if (errors.length > 0) {
    throw mergeErrors(errors)
  }
}

// Insert JSON document(s) in a collection
export function writeMongoCollection (options = {}) {
  return async function (hook) {
    const { item, client } = requireClient(hook, options, 'writeMongoCollection')
    const collectionName = getCollectionName(item, options)
    const collection = client.db.collection(collectionName)
    const chunks = getChunks(hook, options)
    // Unordered bulk so a duplicate key doesn't stop the rest of the chunk.
    const bulkOptions = { ordered: false, ...options }
    const buildInsert = doc => ({ insertOne: { document: doc } })
    await runBulkWriteChunks(collection, collectionName, chunks, buildInsert, bulkOptions, options, 'Inserting')
    return hook
  }
}

// Update JSON document(s) in a collection
export function updateMongoCollection (options = {}) {
  return async function (hook) {
    const { item, client } = requireClient(hook, options, 'updateMongoCollection')
    const collectionName = getCollectionName(item, options)
    const collection = client.db.collection(collectionName)
    const chunks = getChunks(hook, options)
    const buildUpdate = doc => {
      const filter = templateQueryObject(doc, options.filter || {}, _.omit(options, ['filter']))
      const updateData = options.dotify // _id is immutable in Mongo
        ? dotify(_.omit(doc, ['_id']))
        : _.omit(doc, ['_id'])
      return {
        updateOne: {
          filter,
          upsert: options.upsert || false,
          hint: options.hint,
          update: { $set: updateData }
        }
      }
    }
    await runBulkWriteChunks(collection, collectionName, chunks, buildUpdate, options, options, 'Updating')
    return hook
  }
}

// Create aggregation
export function createMongoAggregation (options = {}) {
  return async function (hook) {
    const { item, client } = requireClient(hook, options, 'createMongoAggregation')
    const collectionName = getCollectionName(item, options)
    const collection = client.db.collection(collectionName)
    let pipeline = options.pipeline
    if (_.isNil(pipeline)) {
      throw new Error('You must define a pipeline to use the \'createMongoAggregation\' hook')
    }
    if (!Array.isArray(pipeline)) pipeline = [pipeline]
    const stages = []
    pipeline.forEach(stage => {
      stages.push(templateQueryObject(item, stage, options.pipelineTemplateOptions))
    })
    debug(`Creating aggregation on collection ${collectionName} with the pipeline `, stages)
    const cursor = await collection.aggregate(stages, _.omit(options, ['pipeline', 'collection', 'transform', 'dataPath']))
    let result = await cursor.toArray()
    // Allow transform after aggregation
    if (options.transform) {
      const templatedTransform = templateObject(item, options.transform)
      result = transformJsonObject(result, templatedTransform)
    }
    _.set(hook, options.dataPath || 'result.data', result)
    return hook
  }
}

// Delete documents in a collection
export function deleteMongoCollection (options = {}) {
  return async function (hook) {
    const { item, client } = requireClient(hook, options, 'deleteMongoCollection')
    const collectionName = getCollectionName(item, options)
    const collection = client.db.collection(collectionName)
    const templatedQuery = templateQueryObject(item, options.filter || {}, _.omit(options, ['filter']))
    debug(`Deleting documents in collection ${collectionName} with`, templatedQuery)
    await collection.deleteMany(templatedQuery)
    return hook
  }
}

// Create a GridFS bucket
export function createMongoBucket (options = {}) {
  return async function (hook) {
    const { item, client } = requireClient(hook, options, 'createMongoBucket')
    const bucketName = getBucketName(item, options)
    // mongodb >= 4 removed the strict+callback form of db.collection; a
    // GridFSBucket is cheap to instantiate and idempotent, so we always build
    // and memoise it here.
    if (!_.has(client, `buckets.${bucketName}`)) {
      debug('Creating the ' + bucketName + ' bucket')
      const bucket = new GridFSBucket(client.db, {
        chunkSizeBytes: 8 * 1024 * 1024,
        bucketName,
        ...options
      })
      _.set(client, `buckets.${bucketName}`, bucket)
    }
    return hook
  }
}

// Read file from a bucket
export function readMongoBucket (options = {}) {
  return async function (hook) {
    const { item, client } = requireClient(hook, options, 'readMongoBucket')
    const bucketName = getBucketName(item, options)
    const bucket = _.get(client, `buckets.${bucketName}`)
    const filePath = template(item, options.key || item.id)
    const store = await getStoreFromHook(hook, 'writeMongoBucket', options)
    debug(`Extracting ${filePath} from the ${bucketName} bucket `)
    return new Promise((resolve, reject) => {
      bucket.openDownloadStreamByName(filePath)
        .pipe(store.createWriteStream(filePath))
        .on('error', reject)
        .on('finish', _ => resolve(hook))
    })
  }
}

// Insert file in a bucket
export function writeMongoBucket (options = {}) {
  return async function (hook) {
    const { item, client } = requireClient(hook, options, 'writeMongoBucket')
    const bucketName = getBucketName(item, options)
    const bucket = _.get(client, `buckets.${bucketName}`)
    const templatedMetadata = templateQueryObject(item, options.metadata)
    const filePath = template(item, options.key || item.id)
    const store = await getStoreFromHook(hook, 'writeMongoBucket', options)
    debug(`Inserting ${filePath} in the ${bucketName} bucket `)
    return new Promise((resolve, reject) => {
      store.createReadStream(filePath)
        .pipe(bucket.openUploadStream(filePath, { metadata: templatedMetadata }))
        .on('error', reject)
        .on('finish', _ => resolve(hook))
    })
  }
}

// Delete file in a bucket
export function deleteMongoBucket (options = {}) {
  return async function (hook) {
    const { item, client } = requireClient(hook, options, 'deleteMongoBucket')
    const bucketName = getBucketName(item, options)
    const bucket = _.get(client, `buckets.${bucketName}`)
    const filePath = template(item, options.key || item.id)

    const results = await bucket.find({ filename: filePath }).toArray()
    if (results.length > 0) {
      debug(`Deleting ${filePath} in the ${bucketName} bucket `)
      await bucket.delete(results[0]._id)
    } else throw Error(`Cannot delete ${filePath} in the ${bucketName} bucket`)
    return hook
  }
}

// Drop a bucket
export function dropMongoBucket (options = {}) {
  return async function (hook) {
    const { item, client } = requireClient(hook, options, 'dropMongoBucket')
    const bucketName = getBucketName(item, options)
    const bucket = _.get(client, `buckets.${bucketName}`)
    await bucket.drop()
    debug(`Dropping the ${bucketName} bucket `)
    return hook
  }
}
