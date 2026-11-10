import { createHmac } from 'node:crypto'

/**
 * Sign WeatherLink API request parameters.
 * Path parameters must also be included.
 */
export function signParam (parameters = {}, apiKey, apiSecret) {
  const params = {
    ...parameters,
    'api-key': apiKey,
    t: Math.floor(Date.now() / 1000)
  }

  // The signature itself must not be included in the calculation
  delete params['api-signature']

  // Sort parameters alphabetically and concatenate their names and values
  const data = Object.keys(params)
    .sort()
    .map(name => `${name}${params[name]}`)
    .join('')

  // Generate the HMAC SHA-256 signature
  params['api-signature'] = createHmac('sha256', apiSecret)
    .update(data)
    .digest('hex')

  return params
}
