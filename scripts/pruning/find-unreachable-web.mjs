import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, extname, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css']
const ASSET_EXTENSIONS = ['.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.woff', '.woff2']
const CANDIDATE_EXTENSIONS = new Set([...SOURCE_EXTENSIONS, ...ASSET_EXTENSIONS])
const DEFAULT_ALLOWED_UNREACHABLE = [
  'apps/web/src/features/reports/fixtures/consolidatedHoldingsFixture.ts',
]

const normalizePath = (path) => path.split(sep).join('/')
const isTestFile = (path) =>
  /(?:^|[/\\])__tests__(?:[/\\])|\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(path)

const filesUnder = (directory) => readdirSync(directory, { withFileTypes: true })
  .flatMap((entry) => {
    const path = resolve(directory, entry.name)
    return entry.isDirectory() ? filesUnder(path) : [path]
  })

const gitWebFiles = (repositoryRoot) => {
  const result = spawnSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '--', 'apps/web/src'],
    { cwd: repositoryRoot, encoding: 'utf8' },
  )
  if (result.status !== 0) throw new Error(result.stderr || 'Unable to enumerate web files with Git.')
  return result.stdout.split(/\r?\n/u).filter(Boolean).map((path) => resolve(repositoryRoot, path))
}

const importReferences = (source) => {
  const references = []
  const patterns = [
    { kind: 'static', pattern: /(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/gmu },
    { kind: 'dynamic-literal', pattern: /import\s*\(\s*['"]([^'"]+)['"]\s*\)/gmu },
    { kind: 'css-import', pattern: /@import\s+(?:url\(\s*)?['"]([^'"]+)['"]/gmu },
    { kind: 'css-asset', pattern: /url\(\s*['"]?([^'"\s)]+)['"]?\s*\)/gmu },
  ]
  for (const { kind, pattern } of patterns) {
    for (const match of source.matchAll(pattern)) references.push({ kind, specifier: match[1] })
  }
  return references
}

const resolveReference = (importer, rawSpecifier) => {
  const specifier = rawSpecifier.split(/[?#]/u, 1)[0]
  if (!specifier.startsWith('.')) return null
  const unresolved = resolve(dirname(importer), specifier)
  const candidates = extname(unresolved)
    ? [unresolved]
    : [
        unresolved,
        ...[...CANDIDATE_EXTENSIONS].map((extension) => `${unresolved}${extension}`),
        ...SOURCE_EXTENSIONS.map((extension) => resolve(unresolved, `index${extension}`)),
      ]
  return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) ?? undefined
}

export function analyzeWebReachability(options = {}) {
  const repositoryRoot = resolve(options.repositoryRoot ?? import.meta.dirname, options.repositoryRoot ? '.' : '../..')
  const sourceRoot = resolve(options.sourceRoot ?? resolve(repositoryRoot, 'apps/web/src'))
  const entry = resolve(options.entry ?? resolve(sourceRoot, 'main.tsx'))
  const allFiles = (options.files ?? (
    options.sourceRoot ? filesUnder(sourceRoot) : gitWebFiles(repositoryRoot)
  ))
    .map((path) => resolve(path))
    .filter((path, index, files) => files.indexOf(path) === index)
    .filter((path) => existsSync(path) && statSync(path).isFile())
  const candidateFiles = allFiles.filter((path) => CANDIDATE_EXTENSIONS.has(extname(path).toLowerCase()))
  const testFiles = candidateFiles.filter(isTestFile)
  const productionFiles = candidateFiles.filter((path) => !isTestFile(path))
  const productionSet = new Set(productionFiles)
  const graph = new Map()
  const unresolvedSpecifiers = []
  const unresolvedDynamicImports = []

  for (const file of productionFiles) {
    if (!SOURCE_EXTENSIONS.includes(extname(file).toLowerCase())) {
      graph.set(file, [])
      continue
    }
    const source = readFileSync(file, 'utf8')
    const dependencies = []
    for (const reference of importReferences(source)) {
      const target = resolveReference(file, reference.specifier)
      if (target === null) continue
      if (target === undefined) {
        unresolvedSpecifiers.push({ file, ...reference })
        continue
      }
      if (productionSet.has(target)) dependencies.push(target)
    }
    for (const match of source.matchAll(/import\s*\(\s*(?!['"])([^)]+)\)/gmu)) {
      unresolvedDynamicImports.push({ file, expression: match[1].trim() })
    }
    graph.set(file, [...new Set(dependencies)])
  }

  const reachable = new Set()
  const pending = [entry]
  while (pending.length) {
    const file = pending.pop()
    if (!file || reachable.has(file)) continue
    reachable.add(file)
    for (const dependency of graph.get(file) ?? []) pending.push(dependency)
  }

  const label = (path) => normalizePath(relative(repositoryRoot, path))
  const allowed = new Set((options.allowedUnreachable ?? DEFAULT_ALLOWED_UNREACHABLE).map(normalizePath))
  const unreachable = productionFiles.filter((file) => !reachable.has(file))
  const allowedUnreachable = unreachable.filter((file) => allowed.has(label(file)))
  const unexpectedUnreachable = unreachable.filter((file) => !allowed.has(label(file)))
  const configCandidates = options.configFiles ?? [
    'apps/web/vite.config.ts',
    'apps/web/vitest.config.ts',
    'apps/web/tailwind.config.js',
    'apps/web/eslint.config.js',
  ]

  return {
    root: label(entry),
    productionFiles: productionFiles.map(label).sort(),
    testFiles: testFiles.map(label).sort(),
    reachableProduction: [...reachable].filter((file) => productionSet.has(file)).map(label).sort(),
    allowedUnreachable: allowedUnreachable.map(label).sort(),
    unexpectedUnreachable: unexpectedUnreachable.map(label).sort(),
    unresolvedSpecifiers: unresolvedSpecifiers.map((item) => ({ ...item, file: label(item.file) })),
    unresolvedDynamicImports: unresolvedDynamicImports.map((item) => ({ ...item, file: label(item.file) })),
    configExclusions: configCandidates.filter((path) => existsSync(resolve(repositoryRoot, path))).sort(),
  }
}

const asMarkdown = (result) => [
  '# Web production reachability',
  '',
  `- Root: \`${result.root}\``,
  `- Production candidates: ${result.productionFiles.length}`,
  `- Reachable production files: ${result.reachableProduction.length}`,
  `- Allowed unreachable files: ${result.allowedUnreachable.length}`,
  `- Unexpected unreachable files: ${result.unexpectedUnreachable.length}`,
  `- Excluded test files: ${result.testFiles.length}`,
  `- Reported non-literal dynamic imports: ${result.unresolvedDynamicImports.length}`,
  '',
  '## Unexpected unreachable files',
  '',
  ...(result.unexpectedUnreachable.length
    ? result.unexpectedUnreachable.map((path) => `- \`${path}\``)
    : ['None.']),
  '',
  '## Allowed unreachable files',
  '',
  ...(result.allowedUnreachable.length
    ? result.allowedUnreachable.map((path) => `- \`${path}\``)
    : ['None.']),
  '',
].join('\n')

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : ''
if (import.meta.url === invokedPath) {
  const result = analyzeWebReachability()
  process.stdout.write(process.argv.includes('--json')
    ? `${JSON.stringify(result, null, 2)}\n`
    : `${asMarkdown(result)}\n`)
  if (process.argv.includes('--check') && result.unexpectedUnreachable.length > 0) process.exitCode = 1
}
