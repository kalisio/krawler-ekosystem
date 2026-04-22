import { describe, beforeAll } from 'vitest'
// import { hooks as pluginHooks } from '../src'

describe.skip('krawler:hooks:pg', () => {
  beforeAll(() => {
    // chailint(chai, util)
  })

  /* const pgOptions = {
    host: 'test.rebex.net',
    port: 21,
    user: 'demo',
    pass: 'password',
    remoteDir: '/pub/example',
    remoteFile: '/pub/example/ConsoleClient.png',
    localFile: path.join(__dirname, 'output', 'ConsoleClient.png')
  }
  */
  /* const pgHook = {
    type: 'before'

    data: { id: 'ftp' },
    params: { store: store }
  }
  */
  /*
  it('connect to PG', async () => {
    await pluginHooks.connectPG(pgOptions)(pgHook)
    expect(pgHook.data.client).toBeTruthy()
  })

  it('connect to PG again', async() => {
    // Must not fail
    const result = await pluginHooks.connectPG(pgOptions)(pgHook).then(ok => ok, no => no)
    expect(result).toBe(pgHook)
  })

  it('disconnect from PG', async () => {
    pgHook.type = 'after'
    await pluginHooks.disconnectPG()(pgHook)
    expect(pgHook.data.client).toBeUndefined()
  })

  it('disconnect from PG again', async function () {
    // Must not fail
    const result = await pluginHooks.disconnectPG()(pgHook).then(ok => ok, no => no)
    expect(result).toBe(pgHook)
  })
  */
})
