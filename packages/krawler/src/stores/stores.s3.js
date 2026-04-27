import aws from 'aws-sdk'
import store from 's3-blob-store'
import makeDebug from 'debug'

const debug = makeDebug('krawler:stores')

// Create the fs store
function createStore (options, id) {
  debug('Creating S3 store ' + id + ' with following parameters', options)
  const s3 = new aws.S3(options.client)
  // Some S3 operations (notably headObject used by store.exists()) fail when run as the very first
  // call against a freshly created client; a benign listObjects warm-up avoids that.
  s3.listObjects({ Bucket: options.bucket, MaxKeys: 1 }, function (err, res) {
    if (!err) debug('Client initialized for S3 store ' + id)
    else throw new Error('Failed to initialize client for S3 store ' + id)
  })
  return store({
    client: s3,
    bucket: options.bucket
  })
}

export default createStore
