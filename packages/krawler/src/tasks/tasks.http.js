import _ from 'lodash'
import got from 'got'
import makeDebug from 'debug'

const debug = makeDebug('krawler:tasks')

// Build URLSearchParams with array values expanded as repeated keys
// (replicates request's qsStringifyOptions: { arrayFormat: 'repeat' })
function buildSearchParams (queryParameters) {
  const searchParams = new URLSearchParams()
  for (const key of Object.keys(queryParameters)) {
    const value = queryParameters[key]
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) {
      value.forEach((v) => searchParams.append(key, v))
    } else {
      searchParams.append(key, value)
    }
  }
  return searchParams
}

// Build the request parameters to download data from input data source
export function getRequestParameters (options) {
  const queryParameters = _.merge({}, _.omit(options, ['url', 'method', 'body', 'headers', 'timeout', 'auth', 'oauth', 'jar']))
  const requestParameters = {
    method: options.method || 'GET',
    headers: options.headers,
    body: options.body,
    cookieJar: options.jar,
    // Do not throw on non-2xx so the downstream consumer can read statusCode from the 'response' event
    throwHttpErrors: false
  }
  // Only set searchParams when we actually have params; otherwise got would override
  // any pre-existing query string already embedded in options.url.
  if (Object.keys(queryParameters).length > 0) {
    requestParameters.searchParams = buildSearchParams(queryParameters)
  }
  if (options.timeout) {
    requestParameters.timeout = { request: options.timeout }
  }
  debug('Requesting with the following parameters', requestParameters)
  return requestParameters
}

const METHODS_WITH_BODY = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

// Create the request stream for a task
export function createRequestStream (options) {
  const params = getRequestParameters(options)
  const stream = got.stream(options.url, params)
  // got.stream returns a Duplex; for body-bearing methods without an explicit body,
  // it would hang waiting for written data. Signal end-of-input explicitly.
  if (METHODS_WITH_BODY.has(params.method) && params.body === undefined) {
    stream.end()
  }
  return stream
}

export default createRequestStream
