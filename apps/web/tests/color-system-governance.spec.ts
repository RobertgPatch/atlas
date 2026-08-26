import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const script = path.resolve('scripts/check-color-system.mjs')
const emptyExceptions = path.resolve('color-exceptions.json')
const fixtureExceptions = path.resolve('tests/fixtures/color-system/exceptions.json')

function run(root: string, exceptions = emptyExceptions) {
  return spawnSync(process.execPath, [script, '--root', root, '--exceptions', exceptions], {
    cwd: process.cwd(),
    encoding: 'utf8',
  })
}

describe('color-system governance CLI', () => {
  it('reports deterministic file, line, column, rule, and token diagnostics', () => {
    const result = run('tests/fixtures/color-system/prohibited.tsx')

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('tests/fixtures/color-system/prohibited.tsx:3:24 [competing-action-color] standard actions must use the shared button hierarchy: bg-blue-600')
    expect(result.stderr).toContain('tests/fixtures/color-system/prohibited.tsx:3:36 [nonsemantic-focus] focus colors must use the shared focus role: focus-visible:ring-blue-500')
    expect(result.stderr).toContain('tests/fixtures/color-system/prohibited.tsx:3:64 [legacy-interaction-token] legacy Jackson interaction aliases are prohibited: jackson-gold')
    expect(result.stderr).toContain('tests/fixtures/color-system/prohibited.tsx:9:28 [raw-canonical-interaction] canonical interaction values must be referenced through semantic tokens: #14532D')
  })

  it('accepts canonical interaction roles and labeled semantic colors', () => {
    const result = run('tests/fixtures/color-system/allowed.tsx')

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('passed with 0 findings')
  })

  it('honors an exact active non-interaction exception', () => {
    const result = run('tests/fixtures/color-system/decorative.tsx', fixtureExceptions)

    expect(result.status).toBe(0)
  })

  it('excludes test and generated source from production scans', () => {
    expect(run('tests/fixtures/color-system/ignored.test.tsx').status).toBe(0)
    expect(run('tests/fixtures/color-system/generated').status).toBe(0)
  })
})
