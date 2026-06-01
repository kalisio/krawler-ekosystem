#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// import cluster from 'cluster'
import { Healthcheck } from './healthcheck.js'
import { processOptions, cli } from './cli.js'
import logger from './logger.js'

// Re-exec under --conditions=development if not already set.
// Without this, bin.js loads hooks via src/ while the user jobfile loads them via dist/index.mjs
// (per package.json `exports.import`), giving two distinct hooks registries and breaking
// custom hook registration. The development condition unifies both resolutions on src/.
const hasDevCondition = process.execArgv.some(arg =>
  arg === '--conditions=development' ||
  (arg.startsWith('--conditions=') && arg.slice('--conditions='.length).split(',').includes('development'))
)
if (!hasDevCondition) {
  const child = spawnSync(
    process.execPath,
    ['--conditions=development', fileURLToPath(import.meta.url), ...process.argv.slice(2)],
    { stdio: 'inherit' }
  )
  process.exit(child.status ?? 1)
}

/* WIP: cluster mode, the main issue is that stores are created by a job before hook
   thus are not availalbe on workers not running the job but running only tasks
if (cluster.isMaster) {
  for (let i = 0; i < 2; i++) {
    cluster.fork()
  }
  cluster.once('listening', (worker, address) => worker.send('runJob'))
} else {
  if (require.main === module) {
    let options = processOptions()
    options.mode = 'setup'
    cli(options.job, options)
    // Launch job on first available worker
    process.on('message', message => {
      if (message === 'runJob') {
        options.mode = 'runJob'
        cli(options.job, options)
      }
    })
  }
}
*/
const options = await processOptions()
try {
  await cli(options.job, options)
  if (!options.cron && !options.api) process.exit(Healthcheck.error)
} catch (error) {
  logger.error(error)
  process.exit(1)
}
