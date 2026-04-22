import path, { dirname } from 'path'
import fsStore from 'fs-blob-store'
import fs from 'fs'
import { hooks as pluginHooks } from '../src/index.js'
import { fileURLToPath } from 'url'
import { describe, it, expect, beforeAll } from 'vitest'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
describe('krawler:hooks:system', () => {
  const inputStore = fsStore({ path: path.join(__dirname, 'data') })
  const outputStore = fsStore({ path: path.join(__dirname, 'output') })

  beforeAll(async () => {
  })

  const commandHook = {
    type: 'before',
    data: {
      id: 'command'
    },
    params: { store: outputStore }
  }

  it('run a command', async () => {
    let hook = await pluginHooks.runCommand({
      command: 'echo <%= id %>',
      stdout: true
    })(commandHook)
    expect(hook.data.stdout).toBeTruthy()
    expect(hook.data.stdout).toContain('command')
    hook = await pluginHooks.runCommand({
      command: ['echo', '<%= id %>'],
      spawn: true, // Use spawn instead of exec
      options: {
        stdio: 'inherit'
      }
    })(commandHook)
  }, 5000)

  it('raise error on command timeout', (done) => {
    pluginHooks.runCommand({
      command: 'pause',
      options: {
        timeout: 3000
      }
    })(commandHook)
      .catch(error => {
        expect(error).toBeTruthy()
        done()
      })
  }, 5000)

  it('run multiple commands', async () => {
    let hook = await pluginHooks.runCommand({
      command: ['echo hello', 'echo <%= id %>'],
      stdout: true
    })(commandHook)
    expect(hook.data.stdout).toBeTruthy()
    expect(hook.data.stdout).toContain('hello')
    expect(hook.data.stdout).toContain('command')
    hook = await pluginHooks.runCommand({
      command: [['echo', 'hello'], ['echo', '<%= id %>']],
      spawn: true, // Use spawn instead of exec
      options: {
        stdio: 'inherit'
      }
    })(commandHook)
  }, 5000)

  it('tar a file', () => {
    commandHook.data.id = 'krawler-icon'
    return pluginHooks.tar({
      cwd: inputStore.path,
      file: path.join(outputStore.path, '<%= id %>.tar'),
      files: ['<%= id %>.png']
    })(commandHook)
      .then(hook => {
        expect(fs.existsSync(path.join(outputStore.path, 'krawler-icon.tar'))).toBe(true)
      })
  }, 5000)

  it('untar a file', () => {
    try {
      fs.mkdirSync(path.join(outputStore.path, 'untar'))
    } catch (error) {
      // If already exist
    }
    return pluginHooks.untar({
      cwd: path.join(outputStore.path, 'untar'),
      file: path.join(outputStore.path, '<%= id %>.tar')
    })(commandHook)
      .then(hook => {
        expect(fs.existsSync(path.join(outputStore.path, 'untar', 'krawler-icon.png'))).toBe(true)
      })
  }, 5000)

  it('substitute env variables in text file', () => {
    try {
      fs.mkdirSync(path.join(outputStore.path, 'envsubst'))
    } catch (error) {
      // If already exist
    }
    return pluginHooks.envsubst({
      templateFile: path.join(inputStore.path, 'message.txt.tpl'),
      outputFile: path.join(outputStore.path, 'envsubst', 'message.txt'),
      envs: [
        { name: 'HELLO', value: 'hello' },
        { name: 'WORLD', value: 'world' }
      ]
    })(commandHook)
      .then(hook => {
        const filename = path.join(outputStore.path, 'envsubst', 'message.txt')
        expect(fs.existsSync(filename)).toBe(true)
        const content = fs.readFileSync(filename, 'utf8')
        expect(content).toBe('hello world')
      })
  }, 5000)
})
