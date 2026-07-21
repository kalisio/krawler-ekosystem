import path, { dirname } from 'path'
import fsStore from 'fs-blob-store'
import fs from 'fs'
import { hooks as pluginHooks } from '../src/index.js'
import { fileURLToPath } from 'url'
import { describe, it, expect, beforeAll } from 'vitest'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
describe('krawler:hooks:xml', () => {
  const inputStore = fsStore({ path: path.join(__dirname, 'data') })
  const outputStore = fsStore({ path: path.join(__dirname, 'output') })

  beforeAll(async () => {
  })

  const xmlHook = {
    type: 'after',
    data: {
      id: 'wms.xml'
    },
    result: {
      id: 'wms.xml'
    },
    params: { store: inputStore }
  }

  it('converts XML to JSON', () => {
    return pluginHooks.readXML()(xmlHook)
      .then(hook => {
        expect(hook.result.data).toBeTruthy()
      })
  }, 5000)

  it('supports XML ISO-8859-1 encoding', () => {
    const hook = { type: 'after', data: { id: 'iso-8859-1.xml' }, result: { id: 'iso-8859-1.xml' }, params: { store: inputStore } }
    return pluginHooks.readXML()(hook)
      .then(hook => {
        expect(hook.result.data.str).toEqual('Station village de Gréville')
      })
  }, 5000)

  it('needs an XML declaration to properly decode text', () => {
    const hook = { type: 'after', data: { id: 'iso-8859-1.no-decl.xml' }, result: { id: 'iso-8859-1.no-decl.xml' }, params: { store: inputStore } }
    return pluginHooks.readXML()(hook)
      .then(hook => {
        expect(hook.result.data.str).toEqual('Station village de Gr�ville') // iso-8859-1 data interpreted as utf8
      })
  }, 5000)

  it('does not support every XML encoding', () => {
    const hook = { type: 'after', data: { id: 'iso-8859-2.xml' }, result: { id: 'iso-8859-2.xml' }, params: { store: inputStore } }
    return pluginHooks.readXML()(hook)
      .then(hook => {
        expect(hook.result.data.str).toEqual('g�l�') // iso-8859-2 data interpreted as utf8
      })
  }, 5000)

  it('converts JSON to XML', () => {
    // Switch to output store
    xmlHook.params.store = outputStore
    return pluginHooks.writeXML()(xmlHook)
      .then(hook => {
        expect(fs.existsSync(path.join(outputStore.path, hook.result.id + '.xml'))).toBe(true)
      })
  }, 5000)
})
