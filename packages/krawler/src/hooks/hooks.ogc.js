import _ from 'lodash'
import xml2js from 'xml2js'
import makeDebug from 'debug'

const debug = makeDebug('krawler:hooks:ogc')

// Generate a YAML from specific hook result values
export function getCapabilities (options = {}) {
  return async function (hook) {
    const queryParameters = _.merge({ request: 'GetCapabilities' }, _.omit(options, ['url', 'headers']))

    const url = new URL(options.url)
    Object.keys(queryParameters).forEach((param) => {
      const value = queryParameters[param]
      if (Array.isArray(value)) {
        value.forEach((val) => url.searchParams.append(param, val))
      } else {
        url.searchParams.append(param, value)
      }
    })

    debug('Requesting ' + options.url + ' with following parameters', queryParameters)
    const response = await fetch(url, {
      method: 'GET',
      headers: options.headers
    })
    if (!response.ok) {
      throw new Error('Request rejected with HTTP code ' + response.status)
    }
    const body = await response.text()
    const parser = new xml2js.Parser({ explicitArray: false })
    const result = await parser.parseStringPromise(body)
    _.set(hook, options.dataPath || 'result.data', result)
    return hook
  }
}
