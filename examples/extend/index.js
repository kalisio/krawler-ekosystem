import { run, hooks, StoresService, TasksService } from '@kalisio/krawler'
import fsStore from 'fs-blob-store'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
let customStore

// Create a custom hook
const hook = (options = {}) => {
  return (hook) => {
    console.log(options)
    return hook
  }
}
hooks.registerHook('custom', hook)

// Create a custom store/tasks
StoresService.registerGenerator('custom-store', (options) => {
  customStore = fsStore(options)
  console.log('You created a custom store')
  return customStore
})
TasksService.registerGenerator('custom-task', (options, id) => {
  console.log('You created a custom task')
  return customStore.createReadStream(id)
})

// Create a jobfile
const jobfile = {
  id: 'job',
  store: 'job-store',
  tasks: [{
    id: 'index.js',
    type: 'custom-task',
    store: 'job-store'
  }],
  hooks: {
    jobs: {
      before: {
        createStores: { id: 'job-store', type: 'custom-store', options: { path: __dirname } },
        custom: 'You should see this !'
      }
    }
  }
}

run(jobfile)
  .then(tasks => {
    console.log('Job finished')
  })
