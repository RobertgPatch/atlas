#!/usr/bin/env node
/**
 * T057 — CI guard: fail if the K-1 Dashboard (or any feature code beneath it)
 * imports from a forbidden source.
 *
 * Forbidden:
 *   - `@mui/*`  (UI Constitution §1 bans secondary UI frameworks; SC-009)
 *   - `specs/002-k1-ingestion/reference/**` (Magic Patterns seed; must be
 *     normalized to the Atlas catalog before merge — UI Constitution §10)
 *
 * Scope: `apps/web/src/pages/K1Dashboard.tsx` and everything under
 *        `apps/web/src/features/k1/`.
 *
 * Usage (run from repository root):
 *   node scripts/ci/guard-k1-imports.mjs
 *
 * Exits non-zero with a list of violations when any forbidden import is found.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve, join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const SCOPES = [
  'apps/web/src/pages/K1Dashboard.tsx',
  'apps/web/src/pages/K1ReviewWorkspace.tsx',
  'apps/web/src/features/k1',
  'apps/web/src/features/review',
]

const FORBIDDEN = [
  { pattern: /from\s+['"]@mui\//, label: '@mui/*' },
  { pattern: /import\s+['"]@mui\//, label: '@mui/*' },
  { pattern: /require\(\s*['"]@mui\//, label: '@mui/*' },
  { pattern: /specs\/002-k1-ingestion\/reference\//, label: 'specs/002-k1-ingestion/reference/**' },
  { pattern: /specs\/003-review-and-finalization\/reference\//, label: 'specs/003-review-and-finalization/reference/**' },
  { pattern: /from\s+['"]pdfjs-dist/, label: 'pdfjs-dist (wrap via packages/ui/PdfPreview instead)' },
]

const collectFiles = (path) => {
  const abs = resolve(ROOT, path)
  try {
    const stat = statSync(abs)
    if (stat.isFile()) return [abs]
    if (!stat.isDirectory()) return []
    const out = []
    for (const entry of readdirSync(abs)) {
      out.push(...collectFiles(join(path, entry)))
    }
    return out
  } catch {
    return []
  }
}

const files = SCOPES.flatMap(collectFiles).filter((f) =>
  /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(f),
)

const violations = []
for (const file of files) {
  const content = readFileSync(file, 'utf8')
  for (const { pattern, label } of FORBIDDEN) {
    if (pattern.test(content)) {
      violations.push({ file: relative(ROOT, file), label })
    }
  }
}

if (violations.length > 0) {
  console.error('\n[k1-imports-guard] Forbidden imports detected:')
  for (const v of violations) console.error(`  - ${v.file}  ← imports ${v.label}`)
  console.error(
    '\nThe K-1 Processing Dashboard MUST use Atlas shared components only ' +
      '(UI Constitution §1, §10; SC-009).',
  )
  process.exit(1)
}

console.log(`[k1-imports-guard] OK — scanned ${files.length} file(s), 0 violations.`)
