import path, { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import fsStore from 'fs-blob-store'
import { hooks as pluginHooks } from '../src/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

describe('krawler:hooks:txt', () => {
  const inputStore = fsStore({ path: path.join(__dirname, 'data') })

  const txtHook = {
    type: 'after',
    result: { id: 'lines.txt' },
    params: { store: inputStore }
  }

  beforeAll(() => {
  })

  it('convert TXT to JSON', async () => {
    await pluginHooks.readTXT({})(txtHook)
    expect(txtHook.result.data.length).toBe(8)
    txtHook.result.data.forEach(line => {
      expect(line.length).toBe(10)
    })
  }, 5000)
})
