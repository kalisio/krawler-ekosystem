import { fileURLToPath } from 'node:url'
import { builtinModules } from 'node:module'
import path from 'node:path'
import { defineConfig, mergeConfig } from 'vite'
import { baseConfig } from '../../vite.base-config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default mergeConfig(baseConfig, defineConfig({
  root: __dirname,
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/index.js'),
      formats: ['es', 'cjs'],
      fileName: (format) => format === 'es' ? 'index.mjs' : 'index.cjs'
    },
    rollupOptions: {
      external: [
        ...builtinModules,
        ...builtinModules.map(m => `node:${m}`),
        /@feathersjs\//,
        /@kalisio\//,
        /@mapbox\//,
        /@tmcw\//,
        /@turf\//,
        /@xmldom\//,
        'aws-sdk',
        'boxen',
        'commander',
        'compression',
        'cors',
        'cron',
        'cross-spawn',
        'debug',
        'dockerode',
        'envsub',
        'feathers-hooks-common',
        'fs-blob-store',
        'fs-extra',
        'gdal-async',
        'helmet',
        'imapflow',
        'js-yaml',
        'kue',
        'lodash',
        'mathjs',
        'memory-blob-store',
        'merge-stream',
        'moment',
        'mongodb',
        'mubsub-es',
        'node-fetch',
        'osmtogeojson',
        'papaparse',
        'pg',
        'proj4',
        'reproject',
        'request',
        's3-blob-store',
        'sift',
        'socket.io-client',
        'tar',
        'txt-file-to-json',
        'unzipper',
        'uuid',
        'winston',
        'xml2js'
      ]
    }
  }
}))
