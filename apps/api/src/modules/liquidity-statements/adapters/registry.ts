import type { StatementFileKind } from '../liquidity-statement.types.js'
import type { StatementCell, StatementRecord } from '../statement-document.types.js'
import type { StatementAdapter } from './adapter.types.js'
import { merrillHoldingsCsvAdapter } from './merrill/holdings-csv.js'
import { charlesSchwabPositionsCsvAdapter } from './charles-schwab/positions-csv.js'
import { morganStanleyHoldingsXlsxAdapter } from './morgan-stanley/holdings-xlsx.js'
import { mappedCsvAdapter } from './mapped-csv.js'

const headerKey = (value: string) => value.trim().toLocaleLowerCase('en-US').replace(/\s+/gu, ' ')

export interface NamedRow {
  get(label: string): StatementCell | undefined
  unknown(knownLabels: readonly string[]): StatementCell[]
}

/** Named access is explicit and duplicate-safe; object coercion never hides a column. */
export function createNamedRow(header: StatementRecord, row: StatementRecord): NamedRow {
  if (header.cells.length !== row.cells.length) throw new Error('ROW_WIDTH_MISMATCH')
  const index = new Map<string, number>()
  header.cells.forEach((cell, position) => {
    const key = headerKey(cell.lexical ?? '')
    if (!key || index.has(key)) throw new Error('DUPLICATE_HEADER')
    index.set(key, position)
  })
  return Object.freeze({
    get(label: string) {
      const position = index.get(headerKey(label))
      return position === undefined ? undefined : row.cells[position]
    },
    unknown(knownLabels: readonly string[]) {
      const known = new Set(knownLabels.map(headerKey))
      return row.cells.filter((_, position) => !known.has(headerKey(header.cells[position]?.lexical ?? '')))
    },
  })
}

export class StatementAdapterRegistry {
  readonly #entries: StatementAdapter[] = []
  constructor(entries: readonly StatementAdapter[] = []) { entries.forEach(entry => this.register(entry)) }

  register(adapter: StatementAdapter): void {
    if (!/^[a-z][a-z0-9_-]+$/u.test(adapter.id) || !/^\d+\.\d+\.\d+$/u.test(adapter.version)) throw new Error('INVALID_ADAPTER_IDENTITY')
    if (this.#entries.some(entry => entry.id === adapter.id && entry.version === adapter.version)) throw new Error('DUPLICATE_ADAPTER')
    this.#entries.push(Object.freeze(adapter))
  }

  entries(): StatementAdapter[] { return Object.freeze([...this.#entries]) as StatementAdapter[] }
  compatible(kind: StatementFileKind): StatementAdapter[] { return this.entries().filter(entry => entry.fileKind === kind) }
  get(id: string, version: string): StatementAdapter | undefined { return this.#entries.find(entry => entry.id === id && entry.version === version) }
}

export const initialStatementAdapters = Object.freeze([
  merrillHoldingsCsvAdapter,
  charlesSchwabPositionsCsvAdapter,
  morganStanleyHoldingsXlsxAdapter,
  mappedCsvAdapter,
] satisfies StatementAdapter[])

export const createInitialStatementAdapterRegistry = () => new StatementAdapterRegistry(initialStatementAdapters)
