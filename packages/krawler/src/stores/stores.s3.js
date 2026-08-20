import {
  S3Client,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand
} from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { PassThrough, Writable } from 'node:stream'
import makeDebug from 'debug'

const debug = makeDebug('krawler:stores')

// Accept the AWS SDK v2 client options historically used in jobfiles
// (accessKeyId/secretAccessKey at the top level, s3ForcePathStyle) as well as native v3 ones.
function toClientConfig (options = {}) {
  const { accessKeyId, secretAccessKey, sessionToken, s3ForcePathStyle, signatureVersion, ...config } = options
  if (accessKeyId && secretAccessKey && !config.credentials) {
    config.credentials = { accessKeyId, secretAccessKey, sessionToken }
  }
  if (!_isNil(s3ForcePathStyle) && _isNil(config.forcePathStyle)) config.forcePathStyle = s3ForcePathStyle
  // v3 always signs with SigV4, which binds the region into the signature, whereas v2 fell back to
  // SigV2 on custom endpoints and ignored it. Derive the region from the endpoint so that jobfiles
  // written against v2, which never had to declare one, keep working unchanged.
  if (!config.region) config.region = regionFromEndpoint(config.endpoint) || 'us-east-1'
  return config
}

// Matches the s3.<region>.<host> layout used by AWS, OVH, Scaleway and most S3-compatible providers
function regionFromEndpoint (endpoint) {
  if (!endpoint) return undefined
  const host = String(typeof endpoint === 'string' ? endpoint : endpoint.hostname)
    .replace(/^https?:\/\//, '')
    .replace(/[:/].*$/, '')
  const match = host.match(/^s3[.-]([a-z0-9-]+)\./i)
  // s3.amazonaws.com carries no region in the host, do not read 'amazonaws' as one
  if (!match || host.split('.').length < 4) return undefined
  return match[1].toLowerCase()
}

function _isNil (value) { return value === undefined || value === null }

// Store operations accept either a plain key or the { key, params } object used by the write hooks
function toKey (options) { return typeof options === 'string' ? options : options.key }
function toParams (options) { return typeof options === 'string' ? {} : (options.params || {}) }

function createStore (options, id) {
  debug('Creating S3 store ' + id + ' with following parameters', options)
  const client = new S3Client(toClientConfig(options.client))
  const Bucket = options.bucket

  return {
    // Exposed so that callers can reach the underlying client if they need to
    client,
    bucket: Bucket,

    createWriteStream (writeOptions, callback = () => {}) {
      const Key = toKey(writeOptions)
      const params = toParams(writeOptions)
      // lib-storage handles the multipart split, part numbering, retries and concurrency
      const body = new PassThrough()
      const upload = new Upload({ client, params: { Bucket, Key, Body: body, ...params } })
      const uploaded = upload.done()

      // The store contract is that 'finish' means the object is on S3, not merely that the local
      // stream drained — hence the wrapper: its 'final' waits for the upload to complete.
      const writeStream = new Writable({
        write (chunk, encoding, done) {
          if (body.write(chunk, encoding)) return done()
          body.once('drain', done)
        },
        final (done) {
          body.end()
          uploaded.then(() => done(), done)
        },
        destroy (error, done) {
          // Abort so that a failed multipart upload does not keep billing for its parts
          if (error) upload.abort().catch(() => {})
          done(error)
        }
      })
      // Surface a failure that happens while we are still writing; once the stream has ended it is
      // 'final' that reports it, so do not destroy twice.
      uploaded.catch((error) => {
        if (!writeStream.writableEnded) writeStream.destroy(error)
      })
      writeStream.on('finish', () => callback(null))
      writeStream.on('error', (error) => callback(error))
      return writeStream
    },

    createReadStream (readOptions) {
      const Key = toKey(readOptions)
      const readStream = new PassThrough()
      client.send(new GetObjectCommand({ Bucket, Key }))
        .then(({ Body }) => {
          Body.on('error', (error) => readStream.destroy(error))
          Body.pipe(readStream)
        })
        .catch((error) => readStream.destroy(error))
      return readStream
    },

    exists (existsOptions, callback) {
      client.send(new HeadObjectCommand({ Bucket, Key: toKey(existsOptions) }))
        .then(() => callback(null, true))
        .catch((error) => {
          const status = error && error.$metadata ? error.$metadata.httpStatusCode : undefined
          if (status === 404 || error.name === 'NotFound' || error.name === 'NoSuchKey') return callback(null, false)
          callback(error)
        })
    },

    remove (removeOptions, callback) {
      client.send(new DeleteObjectCommand({ Bucket, Key: toKey(removeOptions) }))
        .then(() => callback(null))
        .catch(callback)
    }
  }
}

export default createStore
