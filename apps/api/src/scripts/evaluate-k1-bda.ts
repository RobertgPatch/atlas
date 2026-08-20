import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

interface ValueRow { canonicalPath: string; kind: string; normalizedValue: unknown; page?: number; sourceLocations?: Array<{ page: number }> }
interface EvaluationCase {
  id: string
  containsProductionData: false
  expected: {
    values: ValueRow[]
    issueCodes: string[]
    matchOutcomes: string[]
    applyResult: unknown
  }
  observed: {
    values: ValueRow[]
    issues: Array<{ code: string; canonicalPath?: string; occurrenceKey?: string }>
    matchOutcomes: string[]
    applyResult: unknown
  }
}

const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => `${JSON.stringify(key)}:${stable(nested)}`).join(',')}}`
  return JSON.stringify(value)
}

const normalized = (row: ValueRow): string => {
  if (row.kind === 'MONEY' && typeof row.normalizedValue === 'string') return Number(row.normalizedValue).toFixed(2)
  if (row.kind === 'PERCENTAGE' && typeof row.normalizedValue === 'string') return String(Number(row.normalizedValue))
  if (row.kind === 'STRING' && typeof row.normalizedValue === 'string') return row.normalizedValue.trim()
  return stable(row.normalizedValue)
}

const indexed = (rows: ValueRow[]) => {
  const occurrences = new Map<string, number>()
  return new Map(rows.map((row) => {
    const occurrence = occurrences.get(row.canonicalPath) ?? 0
    occurrences.set(row.canonicalPath, occurrence + 1)
    return [`${row.canonicalPath}#${occurrence}`, row] as const
  }))
}

export const evaluateK1Case = (testCase: EvaluationCase) => {
  if (testCase.containsProductionData !== false) throw new Error('EVALUATION_CASE_MUST_BE_SANITIZED')
  const expected = indexed(testCase.expected.values)
  const observed = indexed(testCase.observed.values)
  const keys = [...expected.keys()]
  const accounted = keys.filter((key) => observed.has(key))
  const matches = keys.filter((key) => observed.has(key) && normalized(expected.get(key)!) === normalized(observed.get(key)!))
  const mismatches = keys.filter((key) => observed.has(key) && normalized(expected.get(key)!) !== normalized(observed.get(key)!))
  const issuePaths = new Set(testCase.observed.issues.flatMap((issue) => [issue.occurrenceKey, issue.canonicalPath].filter((value): value is string => Boolean(value))))
  const falseSafe = mismatches.filter((key) => !issuePaths.has(key) && !issuePaths.has(key.replace(/#\d+$/, '')))
  const observedIssueCodes = new Set(testCase.observed.issues.map((issue) => issue.code))
  const expectedPages = keys.filter((key) => expected.get(key)?.page != null)
  const grounded = expectedPages.filter((key) => {
    const actual = observed.get(key)
    return actual != null && (actual.page ?? actual.sourceLocations?.[0]?.page) === expected.get(key)?.page
  })
  const correctMatches = testCase.expected.matchOutcomes.filter((outcome, index) => testCase.observed.matchOutcomes[index] === outcome).length
  return {
    fixtureId: testCase.id,
    expectedFieldCount: keys.length,
    observedFieldCount: observed.size,
    fieldAccounting: keys.length ? accounted.length / keys.length : 1,
    normalizedExactMatch: keys.length ? matches.length / keys.length : 1,
    issueRecall: testCase.expected.issueCodes.length
      ? testCase.expected.issueCodes.filter((code) => observedIssueCodes.has(code)).length / testCase.expected.issueCodes.length : 1,
    falseSafeCount: falseSafe.length,
    falseSafeKeys: falseSafe,
    matcherAccuracy: testCase.expected.matchOutcomes.length ? correctMatches / testCase.expected.matchOutcomes.length : 1,
    groundingAccuracy: expectedPages.length ? grounded.length / expectedPages.length : 1,
    applyEquivalent: stable(testCase.expected.applyResult) === stable(testCase.observed.applyResult),
  }
}

const argument = process.argv.find((value) => value.startsWith('--case='))?.slice('--case='.length)
const casePath = resolve(process.cwd(), argument ?? 'tests/fixtures/k1-bda/evaluation-sample.json')
const testCase = JSON.parse(await readFile(casePath, 'utf8')) as EvaluationCase
const report = evaluateK1Case(testCase)
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
if (report.fieldAccounting < 1 || report.falseSafeCount > 0 || !report.applyEquivalent) process.exitCode = 1
