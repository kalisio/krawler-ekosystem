import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { defineConfig, mergeConfig } from 'vitest/config'
import { baseConfig } from '../../vitest.base-config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default mergeConfig(baseConfig, defineConfig({
  root: __dirname,
  test: {
    name: 'krawler',
    // Tests share a single mongodb database (krawler-test) and a fixed HTTP
    // port (3030); run test files serially to avoid cross-file pollution.
    fileParallelism: false
  }
}))
