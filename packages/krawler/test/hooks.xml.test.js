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

  it('converts JSON to XML', () => {
    // Switch to output store
    xmlHook.params.store = outputStore
    return pluginHooks.writeXML()(xmlHook)
      .then(hook => {
        expect(fs.existsSync(path.join(outputStore.path, hook.result.id + '.xml'))).toBe(true)
      })
  }, 5000)
})
