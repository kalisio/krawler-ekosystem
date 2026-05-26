import _ from 'lodash'
import makeDebug from 'debug'

const debug = makeDebug('krawler:hooks:auth')

// Apply a tough-cookie-compatible CookieJar (if provided) to fetch headers and persist Set-Cookie back to it.
// Feature-detects getCookieString/setCookie so non-jar truthy values (e.g. `jar: true`, legacy compat) are tolerated.
async function fetchWithJar (url, init, jar) {
  const headers = { ...(init.headers || {}) }
  if (jar && typeof jar.getCookieString === 'function') {
    const cookieString = await jar.getCookieString(url)
    if (cookieString) headers.cookie = cookieString
  }
  const response = await fetch(url, { ...init, headers })
  if (jar && typeof jar.setCookie === 'function') {
    const setCookies = response.headers.getSetCookie ? response.headers.getSetCookie() : []
    for (const c of setCookies) {
      await jar.setCookie(c, url)
    }
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
        // Set as well if we use cookie to store the session
        await fetchWithJar(url, {
          method: 'POST',
          body: new URLSearchParams(form)
        }, options.jar)
        _.set(requestOptions, 'jar', options.jar)
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
