#!/usr/bin/env node
/**
 * T065 — CI Guard: no @mui/* imports in partnerships feature files
 * Enforces UI Constitution §1 (catalog-only UI) and §10 (no external UI library drift).
 *
 * Usage:
 *   node scripts/ci/guard-partnerships-imports.mjs
 *
 * Exit codes:
 *   0 — no violations
 *   1 — one or more violations found
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../..')

const GUARDED_PATHS = [
  'apps/web/src/pages/PartnershipDirectory.tsx',
  'apps/web/src/pages/PartnershipDetail.tsx',
  'apps/web/src/pages/EntityDetail.tsx',
  'apps/web/src/features/partnerships',
]

/** Recursively collect .ts/.tsx files from a directory or file path */
function collectFiles(target) {
  const abs = join(ROOT, target)
  if (!existsSync(abs)) return []
  const stat = statSync(abs)
  if (stat.isFile()) return [abs]
  return walkDir(abs)
}

function walkDir(dir) {
  const results = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...walkDir(full))
    } else if (entry.isFile() && /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) {
      results.push(full)
    }
  }
  return results
}

const FORBIDDEN = [
  { pattern: /from\s+['"]@mui\//, label: '@mui/*' },
  { pattern: /import\s+['"]@mui\//, label: '@mui/*' },
  { pattern: /require\(\s*['"]@mui\//, label: '@mui/*' },
]

let violations = 0

for (const target of GUARDED_PATHS) {
  for (const file of collectFiles(target)) {
    const content = readFileSync(file, 'utf8')
    for (const { pattern, label } of FORBIDDEN) {
      const lines = content.split('\n')
      lines.forEach((line, i) => {
        if (pattern.test(line)) {
          console.error(`\x1b[31mERROR\x1b[0m  ${label} import found in ${file.replace(ROOT + '/', '')}:${i + 1}`)
          console.error(`       ${line.trim()}`)
          violations++
        }
      })
    }
  }
}

if (violations > 0) {
  console.error(`\n${violations} @mui violation(s) found. Use components from packages/ui instead.`)
  process.exit(1)
} else {
  console.log('\x1b[32mPASS\x1b[0m  No @mui imports found in partnerships feature files.')
  process.exit(0)
}
