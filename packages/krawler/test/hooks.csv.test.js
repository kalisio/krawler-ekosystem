import path, { dirname } from 'path'
import fsStore from 'fs-blob-store'
import fs from 'fs'
import { hooks as pluginHooks } from '../src/index.js'
import { fileURLToPath } from 'url'
import { describe, it, expect, beforeAll } from 'vitest'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
function checkJson (hook) {
  // We know we have a max value at 73.44 in this file
  expect(hook.result.data).toBeTruthy()
  let maxPixel, maxIndex
  let index = 0
  hook.result.data.forEach(pixel => {
    if (pixel.value > 73) {
      maxPixel = pixel
      maxIndex = index
    }
    index++
  })
  expect(maxPixel).toBeTruthy()
  // This point [139.736316,35.630105] should be in pixel
  expect(maxPixel.bbox[0] < 139.736316).to.toBe(true)
  expect(maxPixel.bbox[2] > 139.736316).to.toBe(true)
  expect(maxPixel.bbox[1] < 35.630105).to.toBe(true)
  expect(maxPixel.bbox[3] > 35.630105).to.toBe(true)
  // It is located at [96, 16]
  expect(Math.floor(maxIndex / 300)).toBe(16)
  expect(maxIndex % 300).toBe(96)
}

describe('krawler:hooks:csv', () => {
  const inputStore = fsStore({ path: path.join(__dirname, 'data') })
  const outputStore = fsStore({ path: path.join(__dirname, 'output') })

  beforeAll(async () => {
  })

  const csvHook = {
    type: 'after',
    data: {
      id: 'RJTT-30-18000-2-1.csv'
    },
    result: {
      id: 'RJTT-30-18000-2-1.csv'
    },
    params: { store: inputStore }
  }

  it('converts CSV to JSON', async () => {
    await pluginHooks.readCSV({
      header: true,
      transform: {
        mapping: {
          Lonmin: 'bbox[0]',
          Latmin: 'bbox[1]',
          Lonmax: 'bbox[2]',
          Latmax: 'bbox[3]',
          Elev: 'value'
        }
      }
    })(csvHook)
    checkJson(csvHook)
  }, 5000)

  it('converts JSON to CSV', async () => {
    await pluginHooks.readCSV({ header: true })(csvHook)
    // Switch to output store
    csvHook.params.store = outputStore
    await pluginHooks.writeCSV()(csvHook)
    expect(fs.existsSync(path.join(outputStore.path, csvHook.result.id + '.csv'))).toBe(true)
  }, 5000)

  const mergeCsvHook = {
    type: 'after',
    data: {
      id: 'RJTT-30-18000-2-1-merged'
    },
    result: [
      { id: 'RJTT-30-18000-2-1-part1' },
      { id: 'RJTT-30-18000-2-1-part2' },
      { id: 'RJTT-30-18000-2-1-part3' }
    ],
    params: { store: outputStore }
  }

  it('Merges CSV', async () => {
    mergeCsvHook.result.forEach(result => {
      fs.copyFileSync(path.join(inputStore.path, result.id + '.csv'), path.join(outputStore.path, result.id + '.csv'))
    })
    await pluginHooks.mergeCSV({ parse: { header: true }, unparse: { header: true } })(mergeCsvHook)
    expect(fs.existsSync(path.join(outputStore.path, csvHook.result.id + '.csv'))).toBe(true)
  }, 60000)
})
