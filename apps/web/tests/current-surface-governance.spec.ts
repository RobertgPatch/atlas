import { readFileSync, readdirSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BROWSER_ROUTE_PATTERNS } from '../src/routeContract'

const sourceRoot = resolve('src')
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])
const retiredBrowserPaths = [
  '/upload',
  '/partnerships',
  '/partnerships/:id',
  '/partnership-aggregation',
  '/partnership-tracker',
  '/k1-tracker',
  '/admin/users',
  '/admin/users/:id',
  '/forbidden',
] as const

const filesUnder = (directory: string): string[] => readdirSync(directory, { withFileTypes: true })
  .flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? filesUnder(path) : [path]
  })

const productionFiles = filesUnder(sourceRoot)
  .filter((path) => sourceExtensions.has(extname(path)))
  .filter((path) => !/(?:^|[/\\])__tests__(?:[/\\])|\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(path))

const navigationPattern = /(?:\bto|\bhref)\s*=\s*(?:\{\s*)?['"]([^'"]+)['"]|\bnavigate\s*\(\s*['"]([^'"]+)['"]/gmu
const routePattern = /<Route\b[^>]*\bpath\s*=\s*(?:\{\s*)?['"]([^'"]+)['"]/gmu

describe('current browser surface governance', () => {
  it('contains no legacy design switch, retired route registration, or retired navigation destination', () => {
    const findings: string[] = []

    for (const path of retiredBrowserPaths) {
      if (BROWSER_ROUTE_PATTERNS.includes(path as never)) {
        findings.push(`src/routeContract.ts: retired route registration ${path}`)
      }
    }

    for (const path of productionFiles) {
      const source = readFileSync(path, 'utf8')
      const label = relative(process.cwd(), path).replaceAll('\\', '/')

      for (const identifier of ['VITE_MAGIC_PATTERN_DESIGNS', 'magicPatternDesigns', 'legacyNavigation', 'LegacyNavItem']) {
        if (source.includes(identifier)) findings.push(`${label}: forbidden identifier ${identifier}`)
      }

      for (const match of source.matchAll(routePattern)) {
        if (retiredBrowserPaths.includes(match[1] as (typeof retiredBrowserPaths)[number])) {
          findings.push(`${label}: retired route registration ${match[1]}`)
        }
      }

      for (const match of source.matchAll(navigationPattern)) {
        const destination = match[1] ?? match[2]
        if (!destination || destination.startsWith('/v1')) continue
        const pathOnly = destination.split(/[?#]/u, 1)[0]
        if (retiredBrowserPaths.includes(pathOnly as (typeof retiredBrowserPaths)[number])) {
          findings.push(`${label}: retired navigation destination ${destination}`)
        }
      }
    }

    expect(findings.sort()).toEqual([])
  })
})
