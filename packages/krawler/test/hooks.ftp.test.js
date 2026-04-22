import { execSync } from 'child_process'
import FsStore from 'fs-blob-store'
import fs from 'fs'
import path from 'path'
import { hooks as pluginHooks } from '../src/index.js'
import { describe, it, expect, beforeAll } from 'vitest'
const outputDir = './test/output'

// FTP hooks shell out to the `lftp` binary; skip these tests when unavailable.
const hasLftp = (() => {
  try { execSync('command -v lftp', { stdio: 'ignore' }); return true } catch { return false }
})()
const itLftp = hasLftp ? it : it.skip

describe('krawler:hooks:ftp', () => {
  beforeAll(() => {
  })

  const store = FsStore({ path: outputDir })

  const ftpOptions = {
    remoteDir: '/pure-ftpd/doc',
    remoteFile: '/pure-ftpd/doc/README',
    localFile: 'README',
    pattern: 'README*',
    // Avoid some problems with certificates
    settings: {
      'ssl:verify-certificate': false
    }
  }

  const ftpHook = {
    type: 'before',
    data: {
      id: 'ftp',
      client: {
        host: 'ftp.pureftpd.org',
        port: 21,
        user: 'anonymous',
        pass: 'anonymous'
      }
    },
    params: { store }
  }

  itLftp('list FTP', async () => {
    await pluginHooks.listFTP(ftpOptions)(ftpHook)
    expect(ftpHook.result.data).toBeTruthy()
  }, 60000)

  itLftp('glob FTP', async () => {
    await pluginHooks.globFTP(ftpOptions)(ftpHook)
    expect(ftpHook.result.data).toBeTruthy()
  }, 60000)

  itLftp('get from FTP', async () => {
    try {
      fs.mkdirSync(store.path)
    } catch (error) {
      // If already exist
    }
    await pluginHooks.getFTP(ftpOptions)(ftpHook)
    expect(fs.existsSync(path.join(store.path, 'README'))).toBe(true)
  }, 60000)
})
