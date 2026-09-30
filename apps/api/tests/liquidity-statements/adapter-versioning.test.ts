import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { StatementAdapterRegistry, initialStatementAdapters } from '../../src/modules/liquidity-statements/adapters/registry.js'
import type { StatementAdapter } from '../../src/modules/liquidity-statements/adapters/adapter.types.js'

const versioned = (id: string, version: string): StatementAdapter => ({
  id, version, custodianKey: id, fileKind: 'CSV', canonicalSchemaVersion: '3.0.0', detect: () => [],
  parse: () => ({ accounts: [], controls: [], dispositions: [], findings: [] }),
})
describe('adapter family versioning', () => {
  it('versions families independently and rejects unavailable pinned versions', () => {
    const one = versioned('family_one', '1.0.0'), oneNext = versioned('family_one', '1.1.0'), two = versioned('family_two', '3.0.0')
    const registry = new StatementAdapterRegistry([one, oneNext, two])
    expect(registry.get('family_one', '1.1.0')).toBe(oneNext)
    expect(registry.get('family_two', '3.0.0')).toBe(two)
    expect(registry.get('family_two', '1.1.0')).toBeUndefined()
    expect(registry.entries().filter(adapter => adapter.id === 'family_two')).toEqual([two])
  })

  it('keeps adapters pure by forbidding database, network, reports and application imports', async () => {
    const paths = [
      '../../src/modules/liquidity-statements/adapters/merrill/holdings-csv.ts',
      '../../src/modules/liquidity-statements/adapters/charles-schwab/positions-csv.ts',
      '../../src/modules/liquidity-statements/adapters/morgan-stanley/holdings-xlsx.ts',
      '../../src/modules/liquidity-statements/adapters/mapped-csv.ts',
    ]
    for (const path of paths) {
      const source = await readFile(new URL(path, import.meta.url), 'utf8')
      expect(source).not.toMatch(/(?:infra\/db|liquidity-source\.repository|reports\/|csv-application|https?:|node:(?:http|https|net|tls))/u)
    }
    expect(initialStatementAdapters.map(adapter => `${adapter.id}@${adapter.version}`)).toEqual([
      'merrill_holdings_csv@1.0.0', 'charles_schwab_positions_csv@1.0.0', 'morgan_stanley_holdings_xlsx@1.0.0', 'mapped_csv@1.0.0',
    ])
  })
})
