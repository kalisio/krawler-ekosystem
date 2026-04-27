import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { defineConfig } from 'vitest/config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const baseConfig = {
  test: {
    globals: true,
    silent: false,
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      all: true,
      clean: true,
      include: ['src/**/*.js'],
      exclude: [
        'node_modules/**',
        'dist/**',
        'test/**',
        '*.config.js'
      ],
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage/'
    }
  },
  resolve: {
    alias: {
      '@kalisio/krawler': path.resolve(__dirname, 'packages/krawler/src/index.js')
    }
  }
}
