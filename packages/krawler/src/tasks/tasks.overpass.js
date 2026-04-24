import { createRequestStream as createHttpRequestStream } from './tasks.http.js'

// Create the request stream for a task
function createRequestStream (options) {
  return createHttpRequestStream({
    // Default URL
    url: 'https://overpass-api.de/api/interpreter',
    ...options
  })
}

export default createRequestStream
