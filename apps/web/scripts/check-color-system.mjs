#!/usr/bin/env node

import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

const VALID_EXTENSIONS = new Set(['.css', '.js', '.jsx', '.ts', '.tsx'])
const VALID_EXCEPTION_CATEGORIES = new Set(['semantic', 'visualization', 'decorative'])
const REQUIRED_EXCEPTION_FIELDS = ['id', 'path', 'match', 'category', 'rationale', 'review']

const RULES = [
  {
    id: 'legacy-interaction-token',
    message: 'legacy Jackson interaction aliases are prohibited',
    pattern: /jackson-(?:gold|hover|light)/gi,
  },
  {
    id: 'raw-canonical-interaction',
    message: 'canonical interaction values must be referenced through semantic tokens',
    pattern: /#(?:14532D|0F3D22|0F2A1E|166534)/gi,
  },
  {
    id: 'raw-gold',
    message: 'raw gold values require a named decorative token and exact exception',
    pattern: /#(?:C9A96E|B39359)/gi,
  },
  {
    id: 'nonsemantic-focus',
    message: 'focus colors must use the shared focus role',
    pattern: /(?:focus|focus-visible):(?!ring-focus\b|border-focus\b|outline-focus\b)(?:ring|border|outline)-(?:blue|indigo|amber|yellow|green|emerald)(?:-\d{2,3})?/gi,
  },
  {
    id: 'nonsemantic-choice',
    message: 'checkbox and radio selection must use the shared primary role',
    pattern: /(?:accent|checked:bg|checked:border)-(?:blue|indigo|amber|yellow|green|emerald)(?:-\d{2,3})?/gi,
  },
]

const ACTION_COLOR_PATTERN = /(?:bg|hover:bg|active:bg)-(?:blue|indigo|amber|yellow|green|emerald)-(?:400|500|600|700|800|900)/gi
const BLUE_INTERACTION_PATTERN = /(?:hover:bg|hover:text|hover:border)-(?:blue|indigo)-(?:50|100|200|300|400|500|600|700|800|900)/gi
const SELECTED_BLUE_PATTERN = /(?:bg|border|ring|text)-(?:blue|indigo)-(?:50|100|200|300|400|500|600|700|800|900)/gi
const SELECTED_MARKER_PATTERN = /selected|aria-selected|aria-current|aria-pressed|activeTab|currentPath|filter\s*===|view\s*===/i

function normalizePath(filePath) {
  return filePath.split(path.sep).join('/')
}

function isExcluded(filePath) {
  const normalized = normalizePath(filePath)
  const base = path.basename(filePath)
  return normalized.includes('/node_modules/')
    || normalized.includes('/dist/')
    || normalized.includes('/generated/')
    || normalized.includes('/__tests__/')
    || /\.(?:test|spec)\.[cm]?[jt]sx?$/i.test(base)
    || base.endsWith('.d.ts')
}

async function collectFiles(rootPath) {
  const rootStat = await stat(rootPath)
  if (rootStat.isFile()) {
    return !isExcluded(rootPath) && VALID_EXTENSIONS.has(path.extname(rootPath)) ? [rootPath] : []
  }
  const entries = await readdir(rootPath, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const candidate = path.join(rootPath, entry.name)
    if (isExcluded(candidate)) continue
    if (entry.isDirectory()) files.push(...await collectFiles(candidate))
    else if (entry.isFile() && VALID_EXTENSIONS.has(path.extname(entry.name))) files.push(candidate)
  }
  return files.sort((left, right) => left.localeCompare(right))
}

function locationFor(source, index) {
  const before = source.slice(0, index)
  const line = before.split(/\r?\n/).length
  const lastBreak = Math.max(before.lastIndexOf('\n'), before.lastIndexOf('\r'))
  return { line, column: index - lastBreak }
}

function addMatches(findings, source, relativePath, rule, pattern) {
  pattern.lastIndex = 0
  for (const match of source.matchAll(pattern)) {
    const location = locationFor(source, match.index ?? 0)
    findings.push({
      path: relativePath,
      line: location.line,
      column: location.column,
      rule: rule.id,
      message: rule.message,
      match: match[0],
    })
  }
}

function addLineMatches(findings, line, offset, source, relativePath, rule, pattern) {
  pattern.lastIndex = 0
  for (const match of line.matchAll(pattern)) {
    const absoluteIndex = offset + (match.index ?? 0)
    const location = locationFor(source, absoluteIndex)
    findings.push({
      path: relativePath,
      line: location.line,
      column: location.column,
      rule: rule.id,
      message: rule.message,
      match: match[0],
    })
  }
}

export function scanSource(source, relativePath) {
  const findings = []
  for (const rule of RULES) addMatches(findings, source, relativePath, rule, new RegExp(rule.pattern))

  const lines = source.split(/\r?\n/)
  const lineStartOffsets = [0]
  for (const newline of source.matchAll(/\r?\n/g)) {
    lineStartOffsets.push((newline.index ?? 0) + newline[0].length)
  }
  for (const [lineIndex, line] of lines.entries()) {
    const offset = lineStartOffsets[lineIndex] ?? source.length
    if (/<button\b|buttonClassName\s*\(/i.test(line)) {
      addLineMatches(findings, line, offset, source, relativePath, {
        id: 'competing-action-color',
        message: 'standard actions must use the shared button hierarchy',
      }, new RegExp(ACTION_COLOR_PATTERN))
      addLineMatches(findings, line, offset, source, relativePath, {
        id: 'competing-interactive-hover',
        message: 'generic interactive hover colors must use primary roles',
      }, new RegExp(BLUE_INTERACTION_PATTERN))
    }
    for (const match of line.matchAll(new RegExp(SELECTED_BLUE_PATTERN))) {
      const matchIndex = match.index ?? 0
      const nearbyContext = line.slice(Math.max(0, matchIndex - 180), matchIndex)
      if (SELECTED_MARKER_PATTERN.test(nearbyContext)) {
        addLineMatches(findings, line, offset, source, relativePath, {
          id: 'competing-selected-color',
          message: 'selected interaction states must use primary roles',
        }, new RegExp(match[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'))
      }
    }
  }

  const unique = new Map()
  for (const finding of findings) {
    unique.set(`${finding.path}:${finding.line}:${finding.column}:${finding.rule}:${finding.match}`, finding)
  }
  return [...unique.values()].sort(compareDiagnostics)
}

function compareDiagnostics(left, right) {
  return left.path.localeCompare(right.path)
    || left.line - right.line
    || left.column - right.column
    || left.rule.localeCompare(right.rule)
}

export function validateExceptionRegistry(registry, findings) {
  const diagnostics = []
  if (!Array.isArray(registry)) return ['color-exceptions.json: registry must be a JSON array']

  const ids = new Set()
  const occurrences = new Set()
  registry.forEach((entry, index) => {
    const label = `color-exceptions.json[${index}]`
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      diagnostics.push(`${label}: entry must be an object`)
      return
    }
    for (const field of REQUIRED_EXCEPTION_FIELDS) {
      if (typeof entry[field] !== 'string' || entry[field].trim() === '') {
        diagnostics.push(`${label}: ${field} is required`)
      }
    }
    if (typeof entry.category === 'string' && !VALID_EXCEPTION_CATEGORIES.has(entry.category)) {
      diagnostics.push(`${label}: category must be semantic, visualization, or decorative`)
    }
    if (typeof entry.path === 'string' && /[*?{}[\]]/.test(entry.path)) {
      diagnostics.push(`${label}: path must be exact and cannot contain a glob`)
    }
    if (typeof entry.id === 'string' && ids.has(entry.id)) diagnostics.push(`${label}: duplicate id ${entry.id}`)
    if (typeof entry.id === 'string') ids.add(entry.id)
    const occurrence = `${entry.path}\u0000${entry.match}`
    if (occurrences.has(occurrence)) diagnostics.push(`${label}: duplicate exception for ${entry.path} / ${entry.match}`)
    occurrences.add(occurrence)

    const matching = findings.filter((finding) => finding.path === entry.path && finding.match === entry.match)
    if (typeof entry.path === 'string' && typeof entry.match === 'string' && matching.length === 0) {
      diagnostics.push(`${label}: stale exception does not match an active finding`)
    }
    if (matching.some((finding) => /interaction|focus|choice|action|selected|hover/.test(finding.rule))) {
      diagnostics.push(`${label}: interaction findings cannot be excepted`)
    }
  })
  return diagnostics.sort()
}

export async function auditColorSystem({ root, exceptionsPath, cwd = process.cwd() }) {
  const absoluteRoot = path.resolve(cwd, root)
  const absoluteExceptions = path.resolve(cwd, exceptionsPath)
  const files = await collectFiles(absoluteRoot)
  const findings = []
  for (const file of files) {
    const relativePath = normalizePath(path.relative(cwd, file))
    if (relativePath === 'design-tokens.js') continue
    findings.push(...scanSource(await readFile(file, 'utf8'), relativePath))
  }

  const registry = JSON.parse(await readFile(absoluteExceptions, 'utf8'))
  const exceptionDiagnostics = validateExceptionRegistry(registry, findings)
  const covered = new Set(Array.isArray(registry)
    ? registry.map((entry) => `${entry.path}\u0000${entry.match}`)
    : [])
  const activeFindings = findings.filter((finding) => !covered.has(`${finding.path}\u0000${finding.match}`))
  return { findings: activeFindings.sort(compareDiagnostics), exceptionDiagnostics }
}

function parseArgs(args) {
  const options = { root: 'src', exceptionsPath: 'color-exceptions.json' }
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--root' && args[index + 1]) options.root = args[++index]
    else if (args[index] === '--exceptions' && args[index + 1]) options.exceptionsPath = args[++index]
    else throw new Error(`Unknown or incomplete argument: ${args[index]}`)
  }
  return options
}

async function main() {
  const result = await auditColorSystem(parseArgs(process.argv.slice(2)))
  const diagnostics = [
    ...result.findings.map((finding) => `${finding.path}:${finding.line}:${finding.column} [${finding.rule}] ${finding.message}: ${finding.match}`),
    ...result.exceptionDiagnostics,
  ]
  if (diagnostics.length) {
    for (const diagnostic of diagnostics) console.error(diagnostic)
    console.error(`Color system audit failed with ${diagnostics.length} finding(s).`)
    process.exitCode = 1
    return
  }
  console.log('Color system audit passed with 0 findings.')
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
