import _ from 'lodash'
import makeDebug from 'debug'
import { CookieJar } from 'tough-cookie'

const debug = makeDebug('krawler:hooks:auth')

// Detect anything that looks like a legacy `request.jar()` shortcut or unusable value.
// A real tough-cookie jar exposes async getCookieString/setCookie.
function isUsableJar (jar) {
  return jar && typeof jar.getCookieString === 'function' && typeof jar.setCookie === 'function'
}

// Apply a tough-cookie CookieJar to fetch headers and persist Set-Cookie back to it.
async function fetchWithJar (url, init, jar) {
  const headers = { ...(init.headers || {}) }
  const cookieString = await jar.getCookieString(url)
  if (cookieString) headers.cookie = cookieString
  const response = await fetch(url, { ...init, headers })
  const setCookies = response.headers.getSetCookie ? response.headers.getSetCookie() : []
  for (const c of setCookies) {
    await jar.setCookie(c, url)
  }
  return response
}

// Add headers for basic/proxy auth
export function basicAuth (options = {}) {
  return async function (hook) {
    if (hook.type !== 'before') {
      throw new Error('The \'basicAuth\' hook should only be used as a \'before\' hook.')
    }
    const path = options.optionsPath || 'options'
    const requestOptions = _.get(hook.data, path)
    const auth = requestOptions.auth
    if (auth) {
      const { user, password, url, form } = auth
      // Post auth information as form data ?
      if (form) {
        // Form auth typically returns a Set-Cookie session that subsequent task requests must replay.
        // If the caller didn't pass a real tough-cookie jar (incl. the legacy `jar: true` shortcut from
        // the request.jar() era), create one transparently so cookies persist across the auth → data hop.
        const jar = isUsableJar(options.jar) ? options.jar : new CookieJar()
        await fetchWithJar(url, {
          method: 'POST',
          body: new URLSearchParams(form)
        }, jar)
        // got accepts a tough-cookie jar via `cookieJar`; the http task maps requestOptions.jar onto it.
        _.set(requestOptions, 'jar', jar)
        options.jar = jar
      } else { // Default method is to directly set basic auth as header
        if (!requestOptions.headers) requestOptions.headers = {}
        // Defaults to Basic Auth
        const type = options.type || 'Authorization'
        requestOptions.headers[type] = 'Basic ' + Buffer.from(user + ':' + password).toString('base64')
        debug('Added basic auth header ' + type + ' = ' + requestOptions.headers[type])
      }
      // Once consumed not required anymore and will avoid polluting request parameters
      _.unset(requestOptions, 'auth')
    }
  }
}

// OAuth specification rely on snake case and we prefer to keep this to avoid any confusion
/* eslint-disable camelcase */
export function OAuth (options = {}) {
  return async function (hook) {
    if (hook.type !== 'before') {
      throw new Error('The \'OAuth\' hook should only be used as a \'before\' hook.')
    }
    const path = options.optionsPath || 'options'
    const requestOptions = _.get(hook.data, path)
    const oauth = requestOptions.oauth
    if (oauth) {
      const { client_id, client_secret, method, url } = oauth
      let response
      if (!requestOptions.headers) requestOptions.headers = {}
      if (method === 'client_secret_basic') {
        response = await fetch(url, {
          method: 'POST',
          headers: { Authorization: 'Basic ' + Buffer.from(client_id + ':' + client_secret).toString('base64') },
          body: JSON.stringify(_.omit(oauth, ['client_id', 'client_secret', 'method', 'url']))
        })
      } else if (method === 'client_secret_post') {
        response = await fetch(url, {
          method: 'POST',
          body: JSON.stringify(_.omit(oauth, ['method', 'url']))
        })
      }
      if (!response.ok) {
        throw new Error('OAuth rejected with HTTP code ' + response.status)
      }
      const { access_token, token_type } = await response.json()
      // Defaults to Bearer Auth
      const type = options.type || 'Authorization'
      requestOptions.headers[type] = `${token_type} ${access_token}`
      debug('Sending oauth header ' + type + ' = ' + requestOptions.headers[type])
      // Once consumed not required anymore and will avoid polluting request parameters
      _.unset(requestOptions, 'oauth')
    }
  }
}
