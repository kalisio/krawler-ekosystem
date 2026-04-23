import { hooks } from '@kalisio/krawler'

// Create a custom hook
const hook = (options = {}) => {
  return (hook) => {
    // build a task for each model
    const tasks = []

    options.models.forEach(model => {
      const task = {
        id: model.id,
        options: {
          url: model.url,
          proxyUrl: options.proxyUrl
        }
      }
      tasks.push(task)
    })
    hook.data.tasks = tasks
    return hook
  }
}

hooks.registerHook('generateTasks', hook)
