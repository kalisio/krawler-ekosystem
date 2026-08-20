---
title: Services
description: Stores, tasks and jobs services reference
---

# Services

Krawler exposes three [Feathers services](https://docs.feathersjs.com/api/services.html): **stores**, **tasks** and **jobs**.

## Stores

The `stores` service allows you to manage in-memory data stores with the following operations:
* **create(data)**: create a store based on the provided data object properties
  * **id**: unique store ID
  * **type**: store type (e.g. `fs`)
  * **options**: specific store implementation options
* **remove(id)**: remove the store with the given ID
* **get(id)**: retrieve the store with the given ID

The returned store objects comply with the [abstract-blob-store](https://github.com/maxogden/abstract-blob-store) interface. Available store types are the following:
* [`fs`](https://github.com/mafintosh/fs-blob-store) for the local file system
* [`s3`](https://github.com/jb55/s3-blob-store) for AWS S3
* [`memory`](https://github.com/retrohacker/memory-blob-store) for in-memory data buffers

## Tasks

The `tasks` service allows you to manage individual task execution with the following operations:
* **create(data)**: create a task based on the provided data object properties
  * **id**: unique task ID
  * **type**: task type (e.g. `http`)
  * **attemptsLimit**: if specified, the task will be run again up to this number of times before being declared as failed
  * **attemptsOptions**: if specified, each retried task will be run by merging the associated options for each retry given in this array
  * **faultTolerant**: will catch any error raised by the task execution so that the hook chain is stopped but the job will continue anyway
  * **options**: specific task implementation options, plus
    * **outputType**: the type of output produced by this task, defaults to `intermediate`
* **remove(id)**: remove the task with the given ID; this will actually remove the produced output from the store given as a (query) parameter

The returned task objects will contain an additional property for each output type, holding an array of produced output files. This is used by the [clearOutputs](./hooks.md#clearoutputs-options) hook to perform cleanup.

By default a task implementation returns a [stream](https://nodejs.org/api/stream.html) to extract data from, that is piped to the target store. Available task types are the following:
* [`http`](https://github.com/sindresorhus/got) for HTTP requests
* [`wms`](https://en.wikipedia.org/wiki/Web_Map_Service) for HTTP requests targeting WMS services
* [`wcs`](https://en.wikipedia.org/wiki/Web_Coverage_Service) for HTTP requests targeting WCS services
* [`wfs`](https://en.wikipedia.org/wiki/Web_Feature_Service) for HTTP requests targeting WFS services
* [`overpass`](https://wiki.openstreetmap.org/wiki/Overpass_API) for HTTP requests to query OpenStreetMap data
* [`store`](https://github.com/maxogden/abstract-blob-store) to read input data from a store
* [`mongo`](https://www.mongodb.com/) to read input data from a MongoDB database, same options as the [readMongoCollection](./hooks.md#readmongocollection-options) hook
* [`noop`](https://en.wikipedia.org/wiki/NOP) when you don't need to read anything; the purpose is just to launch the hooks, returns an `undefined` stream

If the task type is written `type-stream` then the stream is not piped directly to the store but returned in a `stream` property for further usage by hooks.

## Jobs

The `jobs` service allows you to manage job execution with the following operations:
* **create(data)**: create a job based on the provided data object properties
  * **id**: unique job ID
  * **type**: job type (e.g. `async`)
  * **tasks**: tasks to be run by the job
  * **options**: specific job implementation options
* **remove(id)**: remove the job with the given ID; this will actually remove the produced output from the store given as a (query) parameter

The returned job object is a [promise](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise) resolved or rejected when the job is finished or has failed.

Available common job options are the following:
* **workersLimit**: the maximum number of tasks to be run in parallel by the job
* **attemptsLimit**: if specified, each task will be run again up to this number of times before being declared as failed
* **faultTolerant**: will catch erroneous tasks so that the job will continue anyway; the hook chain will be stopped on the faulty tasks however
* **timeout**: will stop the job and flag it as erroneous after the given timeout (ms); it will wait until currently processed tasks have run however

The only available job type is `async`, which runs tasks in parallel by batch. It is the default
and does not need to be declared.

## Task templates

When creating a job, if a `taskTemplate` object is provided it will be automatically merged into all job tasks so that you can use it to store options common to all your tasks. It also provides task ID [templating](https://lodash.com/docs/4.17.4#template) based on the `jobId` and `taskId` injected variables. So if you provide the following task template:

```js
id: 'job',
taskTemplate: {
  store: 'job-store',
  id: '<%= jobId %>-<%= taskId %>',
  type: 'http',
  options: {
    url: 'xxx',
    parameter1: 'xxx'
  }
}
```

And submit the following task to your job:

```js
{
  id: 'task',
  options: {
    parameter2: 'xxx'
  }
}
```

The final task to be executed will be:

```js
{
  store: 'job-store',
  id: 'job-task',
  type: 'http',
  options: {
    url: 'xxx',
    parameter1: 'xxx',
    parameter2: 'xxx'
  }
}
```

## Complete example

Here's an example of a Feathers server that uses the complete set of Krawler services:

```js
import { feathers } from '@feathersjs/feathers'
import express from '@feathersjs/express'
import krawler from '@kalisio/krawler'

// Initialize the application
const app = express(feathers())
app.configure(express.rest())
app.use(express.json())
app.configure(krawler())

// Register the Krawler services
app.use('stores', krawler.stores())
app.use('tasks', krawler.tasks())
app.use('jobs', krawler.jobs())
app.use(express.errorHandler())

// Define the required hooks for your app
app.service('jobs').hooks({ /* ... */ })
app.service('tasks').hooks({ /* ... */ })

const server = await app.listen(3030)
console.log('Krawler app started on 127.0.0.1:3030')

// You can now call services in REST or programmatically
try {
  const tasks = await app.service('jobs').create({ /* ... */ })
  console.log('Job terminated, ' + tasks.length + ' tasks ran')
} catch (error) {
  console.log(error.message)
}
```

::: tip
When used through the CLI, the services are created and wired for you from the job file — you only declare the `hooks` pipeline and the tasks. See [Using Krawler](../guides/using.md).
:::
