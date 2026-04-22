import moment from 'moment'
import { utils } from '../src/index.js'
import { describe, it, expect, beforeAll } from 'vitest'
describe('krawler:utils', () => {
  beforeAll(() => {
  })

  it('transform object', () => {
    // Test data from https://opensky-network.org/api/states/all
    let data = {
      time: 1577970430,
      states: [
        [3939523, 'UAL2109 ', 'United States', 1577969618, 1577969619, -84.4841, 30.6434, 10858.5, false, 205.5, 272.73, 0, null, 11361.42, '0721', false, 0],
        [3675002, 'LAN712  ', 'Chile', 1577969619, 1577969619, 9.415, 40.2945, 12496.8, false, 258.32, 100.33, -0.65, null, 12633.96, '1277', false, 0]
      ]
    }
    data = utils.transformJsonObject(data, {
      transformPath: 'states',
      toObjects: ['icao', 'callsign', 'origin_country', 'time_position', 'last_contact', 'longitude', 'latitude', 'geo_altitude', 'on_ground', 'velocity', 'heading', 'vertical_rate', 'sensors', 'baro_altitude', 'squawk', 'spi', 'position_source'],
      filter: { velocity: { $gt: 210 } }, // Keep speed above 210 m/s
      mapping: { velocity: 'speed', geo_altitude: 'altitude' },
      unitMapping: {
        icao: { asString: 16, asCase: 'toUpperCase' },
        speed: { from: 'm/s', to: 'kts' }
      },
      pick: ['latitude', 'longitude', 'altitude', 'callsign', 'icao', 'speed']
    })
    expect(data.states).toBeTruthy() // Transform path
    expect(data.states.length).toBe(1)
    expect(data.states[0].icao).toBeTruthy() // Object conversion
    expect(data.states[0].icao).toBe('38137A') // Filtering and string conversion
    expect(data.states[0].origin_country).toBeUndefined() // Picking
    expect(data.states[0].time_position).toBeUndefined()
    expect(data.states[0].geo_altitude).toBeUndefined() // Mapping
    expect(data.states[0].altitude).toBeTruthy()
    expect(data.states[0].altitude).toBe(12496.8)
    expect(data.states[0].velocity).toBeUndefined()
    expect(data.states[0].speed).toBeTruthy()
    expect(data.states[0].speed).toBe(258.32 / 0.514444)
  })

  it('template query object', () => {
    const now = moment.utc()
    const item = {
      min: 30,
      max: 50,
      time: now,
      id: now.valueOf()
    }
    let query = {
      range: {
        $lte: '<%= max %>',
        $gte: '<%= min %>'
      },
      value: '17',
      date: '2020-01-02T12:00:00.000Z',
      time: '<%= time.format() %>',
      id: '<%= id %>',
      array: ['<%= min %>', '<%= max %>'],
      emptyString: ''
    }

    query = utils.templateQueryObject(item, query)
    expect(typeof query.range.$lte).toBe('number')
    expect(typeof query.range.$gte).toBe('number')
    expect(query.range.$lte).toBe(item.max)
    expect(query.range.$gte).toBe(item.min)
    expect(typeof query.value).toBe('number')
    expect(typeof query.date).toBe('object')
    expect(query.date.toISOString()).toBe('2020-01-02T12:00:00.000Z')
    expect(typeof query.time).toBe('object')
    expect(moment.utc(query.time).format()).toBe(item.time.format())
    expect(typeof query.id).toBe('number')
    expect(Array.isArray(query.array)).toBe(true)
    expect(query.array).toEqual([item.min, item.max])
    expect(query.emptyString).toBe('')
  })

  it('template timed geospatial query object', () => {
    const startTime = moment.utc().startOf('day').toISOString()
    const endTime = moment.utc().toISOString()
    const item = {
      department: '81',
      coordinates: [3, 45]
    }
    let query = {
      'properties.code': '<%= department %>',
      geometry: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: ['<%= coordinates[0] %>', '<%= coordinates[1] %>']
          },
          $maxDistance: 20000
        }
      },
      time: { $gte: startTime, $lte: endTime }
    }

    query = utils.templateQueryObject(item, query, { excludedProperties: ['properties.code'] })
    expect(query.time.$lte instanceof Date).toBe(true)
    expect(query.time.$gte instanceof Date).toBe(true)
    expect(query.time.$lte.toISOString()).toBe(endTime)
    expect(query.time.$gte.toISOString()).toBe(startTime)
    expect(typeof query['properties.code']).toBe('string')
    expect(query['properties.code']).toBe(item.department)
    expect(query.geometry.$near.$geometry.coordinates).toEqual(item.coordinates)
  })
})
