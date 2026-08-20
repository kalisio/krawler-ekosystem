import path, { dirname } from 'path'
import fsStore from 'fs-blob-store'
import { hooks as pluginHooks } from '../src/index.js'
import logger from '../src/logger.js'
import { fileURLToPath } from 'url'
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const datagouvApiUrl = process.env.DATAGOUV_DEMO_API_URL || 'https://demo.data.gouv.fr/api/1'
const datagouvApiKey = process.env.DATAGOUV_DEMO_API_KEY
const datagouvDataset = process.env.DATAGOUV_DEMO_DATASET
const itDatagouv = (datagouvApiKey && datagouvDataset) ? it : it.skip

// Read back the resources of the target dataset from the API
async function getDatasetResources () {
  const response = await fetch(`${datagouvApiUrl}/datasets/${datagouvDataset}/`, { headers: { 'X-API-KEY': datagouvApiKey } })
  const json = await response.json()
  return json.resources
}

describe('krawler:hooks:datagouv', () => {
  const store = fsStore({ path: path.join(__dirname, 'data') })
  const datagouvOptions = { apiUrl: datagouvApiUrl, apiKey: datagouvApiKey, dataset: datagouvDataset }
  // Resources created on the dataset by the tests, deleted by the last one
  const resources = []
  let info

  function datagouvHook () {
    return {
      type: 'after',
      data: { id: 'datagouv.csv' },
      result: { id: 'datagouv.csv' },
      params: { store }
    }
  }

  beforeAll(() => {
    if (!datagouvApiKey || !datagouvDataset) {
      console.warn('Skipping data.gouv.fr tests, set the DATAGOUV_DEMO_API_KEY and DATAGOUV_DEMO_DATASET env variables to run them')
    }
    // Track what the hooks log to inform the user
    // https://vitest.dev/api/vi
    info = vi.spyOn(logger, 'info')
  })

  afterAll(() => {
    // https://vitest.dev/api/vi
    info.mockRestore()
    vi.unstubAllEnvs()
  })

  // Runs whatever the tests outcome, ensuring no resource is left on the dataset
  // when a test fails before the deletion one
  afterAll(async () => {
    for (const resource of resources) {
      await fetch(`${datagouvApiUrl}/datasets/${datagouvDataset}/resources/${resource}/`, {
        method: 'DELETE',
        headers: { 'X-API-KEY': datagouvApiKey }
      })
    }
  })

  it('exposes data.gouv.fr hooks', () => {
    expect(typeof pluginHooks.uploadDatagouvResource).toBe('function')
    expect(typeof pluginHooks.deleteDatagouvResource).toBe('function')
  })

  it('raises when required options are missing', async () => {
    // Ensure the hooks cannot fall back on the env variables
    vi.stubEnv('DATAGOUV_API_KEY', '')
    vi.stubEnv('DATAGOUV_DATASET', '')
    await expect(pluginHooks.uploadDatagouvResource({ dataset: 'my-dataset', key: 'datagouv.csv' })(datagouvHook())).rejects.toThrow(/apiKey/)
    await expect(pluginHooks.uploadDatagouvResource({ apiKey: 'my-key', key: 'datagouv.csv' })(datagouvHook())).rejects.toThrow(/dataset/)
    await expect(pluginHooks.uploadDatagouvResource({ apiKey: 'my-key', dataset: 'my-dataset' })(datagouvHook())).rejects.toThrow(/key/)
    await expect(pluginHooks.deleteDatagouvResource({ apiKey: 'my-key', dataset: 'my-dataset' })(datagouvHook())).rejects.toThrow(/resource/)
    vi.unstubAllEnvs()
  })

  it('falls back on the env variables', async () => {
    vi.stubEnv('DATAGOUV_API_KEY', 'my-key')
    vi.stubEnv('DATAGOUV_DATASET', 'my-dataset')
    // Options are complete, the hook now fails on the unreachable API instead of the missing options
    await expect(pluginHooks.deleteDatagouvResource({ apiUrl: 'http://localhost:1', resource: 'my-resource' })(datagouvHook())).rejects.toThrow(/fetch failed/)
    vi.unstubAllEnvs()
  })

  itDatagouv('creates a first resource from the store', async () => {
    const hook = datagouvHook()
    await pluginHooks.uploadDatagouvResource(Object.assign({
      key: '<%= id %>',
      contentType: 'text/csv',
      metadata: { title: 'krawler test resource 1', format: 'csv', filetype: 'file' }
    }, datagouvOptions))(hook)

    expect(hook.result.datagouv.id).toBeTruthy()
    resources.push(hook.result.datagouv.id)
    // The user is informed of what has been published
    expect(info).toHaveBeenCalledWith(expect.stringContaining(`Uploaded datagouv.csv as resource ${resources[0]}`))

    const uploaded = (await getDatasetResources()).find(resource => resource.id === resources[0])
    expect(uploaded.title).toBe('krawler test resource 1')
  }, 60000)

  itDatagouv('creates a second resource from the file system', async () => {
    const hook = datagouvHook()
    await pluginHooks.uploadDatagouvResource(Object.assign({
      file: path.join(__dirname, 'data', 'datagouv.csv'),
      fileName: 'datagouv-2.csv',
      contentType: 'text/csv',
      metadata: { title: 'krawler test resource 2', format: 'csv', filetype: 'file' }
    }, datagouvOptions))(hook)

    expect(hook.result.datagouv.id).toBeTruthy()
    resources.push(hook.result.datagouv.id)
    expect(resources[1]).not.toBe(resources[0])

    const uploaded = (await getDatasetResources()).find(resource => resource.id === resources[1])
    expect(uploaded.title).toBe('krawler test resource 2')
  }, 60000)

  itDatagouv('overwrites the first resource', async () => {
    const hook = datagouvHook()
    await pluginHooks.uploadDatagouvResource(Object.assign({
      resource: resources[0],
      key: '<%= id %>',
      fileName: 'datagouv-updated.csv',
      contentType: 'text/csv',
      metadata: { title: 'krawler test resource 1 (updated)', format: 'csv', filetype: 'file' }
    }, datagouvOptions))(hook)

    const uploaded = await getDatasetResources()
    // The file has been replaced on the existing resource, no new one has been created
    expect(uploaded.filter(resource => resources.includes(resource.id)).length).toBe(resources.length)
    const updated = uploaded.find(resource => resource.id === resources[0])
    expect(updated.title).toBe('krawler test resource 1 (updated)')
    expect(updated.url).toMatch(/datagouv-updated.csv$/)
  }, 60000)

  itDatagouv('deletes the resources one by one', async () => {
    const deleted = [...resources]
    for (const resource of deleted) {
      await pluginHooks.deleteDatagouvResource(Object.assign({ resource }, datagouvOptions))(datagouvHook())
      expect(info).toHaveBeenCalledWith(expect.stringContaining(`Deleted resource ${resource}`))
      // Nothing left to clean up for this one
      resources.shift()
    }

    const remaining = await getDatasetResources()
    expect(remaining.filter(resource => deleted.includes(resource.id)).length).toBe(0)
  }, 60000)
})
