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
        /@aws-sdk\//,
        /@feathersjs\//,
        /@kalisio\//,
        /@tmcw\//,
        /@turf\//,
        /@xmldom\//,
        'boxen',
        'commander',
        'compression',
        'cors',
        'cron',
        'debug',
        'dockerode',
        'envsub',
        'feathers-hooks-common',
        'fs-blob-store',
        'fs-extra',
        'gdal-async',
        'got',
        'heap-js',
        'helmet',
        'imapflow',
        'js-yaml',
        'lodash',
        'lodash-es',
        'mathjs',
        'memory-blob-store',
        'moment',
        'mongodb',
        'mubsub-es',
        'osmtogeojson',
        'papaparse',
        'pg',
        'proj4',
        'sanitize-html',
        'sift',
        'socket.io-client',
        'tar',
        'tough-cookie',
        'unzipper',
        'winston',
        'xml2js'
      ]
    }
  }
}))
