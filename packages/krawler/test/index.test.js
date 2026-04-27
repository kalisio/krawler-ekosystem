import feathers from '@feathersjs/feathers'
import plugin from '../src/index.js'
import { describe, it, expect, beforeAll } from 'vitest'
describe('krawler', () => {
  let app

  beforeAll(() => {
    app = feathers()
  })

  it('is ES module compatible', () => {
    expect(typeof plugin).toBe('function')
    expect(typeof plugin.stores).toBe('function')
    expect(typeof plugin.stores.Service).toBe('function')
    expect(typeof plugin.tasks).toBe('function')
    expect(typeof plugin.tasks.Service).toBe('function')
    expect(typeof plugin.jobs).toBe('function')
    expect(typeof plugin.jobs.Service).toBe('function')
  })

  it('registers the plugin', () => {
    expect(() => app.configure(plugin)).not.toThrow()
  })
})
