import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolve } from 'node:path'

import { analyzeWebReachability } from './find-unreachable-web.mjs'

const repositoryRoot = resolve(import.meta.dirname, 'fixtures/web-graph')
const sourceRoot = resolve(repositoryRoot, 'src')

test('resolves static, type, barrel, index, literal dynamic, CSS, and asset edges', () => {
  const result = analyzeWebReachability({
    repositoryRoot,
    sourceRoot,
    entry: resolve(sourceRoot, 'main.ts'),
    allowedUnreachable: [],
    configFiles: ['vite.config.ts'],
  })

  assert.deepEqual(result.unexpectedUnreachable, ['src/dynamic-target.ts', 'src/unused.ts'])
  assert.deepEqual(result.allowedUnreachable, [])
  assert.ok(result.reachableProduction.includes('src/feature/component.ts'))
  assert.ok(result.reachableProduction.includes('src/feature/index.ts'))
  assert.ok(result.reachableProduction.includes('src/model.ts'))
  assert.ok(result.reachableProduction.includes('src/lazy.ts'))
  assert.ok(result.reachableProduction.includes('src/icon.svg'))
})

test('excludes tests/config and reports non-literal dynamic imports without guessing an edge', () => {
  const result = analyzeWebReachability({
    repositoryRoot,
    sourceRoot,
    entry: resolve(sourceRoot, 'main.ts'),
    allowedUnreachable: [],
    configFiles: ['vite.config.ts'],
  })

  assert.deepEqual(result.testFiles, ['src/ignored.test.ts'])
  assert.deepEqual(result.configExclusions, ['vite.config.ts'])
  assert.deepEqual(result.unresolvedDynamicImports, [{
    file: 'src/main.ts',
    expression: 'dynamicTarget',
  }])
})
