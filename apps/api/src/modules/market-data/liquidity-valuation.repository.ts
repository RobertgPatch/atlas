import { randomUUID } from 'node:crypto'
import { pool, withTransaction } from '../../infra/db/client.js'

export type LiquidityValuationSource = 'official_close' | 'custodian_fallback'

export interface LiquidityValuationPositionInput {
  sourceHoldingId: string
  accountId: string
  symbol: string | null
  description: string
  securityType: string
  currencyCode: string | null
  quantity: number | null
  costBasis: number | null
  closingPrice: number | null
  marketValue: number | null
  unrealizedGainLoss: number | null
  valuationSource: LiquidityValuationSource
  provider: string | null
  feed: string | null
  priceAsOf: string | null
}

export interface SaveLiquidityValuationInput {
  tradingDate: string
  selectedAccountIds: string[]
  provider: string | null
  feed: string | null
  priceAsOf: string | null
  capturedAt: string
  positions: LiquidityValuationPositionInput[]
  warnings: string[]
}

export interface SavedLiquidityValuation {
  id: string
  tradingDate: string
  capturedAt: string
}

export interface LiquidityValuationPerformancePoint {
  date: string
  totalMarketValue: number | null
  totalCostBasis: number | null
  totalUnrealizedGainLoss: number | null
  accountCount: number
  capturedAt: string
  priceAsOf: string | null
  pricedHoldingCount: number
  fallbackHoldingCount: number
}

export interface LiquidityValuationStore {
  saveSnapshot(input: SaveLiquidityValuationInput): Promise<SavedLiquidityValuation>
  listPerformancePoints(input: {
    accountIds: string[]
    fromDate?: string
    toDate?: string
    limit?: number
  }): Promise<LiquidityValuationPerformancePoint[]>
}

interface MemorySnapshot extends SaveLiquidityValuationInput {
  id: string
  accountSelectionKey: string
}

interface PerformanceRow {
  trading_date: Date | string
  captured_at: Date | string
  price_as_of: Date | string | null
  total_market_value_amount: number | string | null
  total_cost_basis_amount: number | string | null
  total_unrealized_gain_loss_amount: number | string | null
  account_count: number | string
  priced_holding_count: number | string
  fallback_holding_count: number | string
}

const normalizeAccountIds = (accountIds: string[]): string[] =>
  [...new Set(accountIds)].sort((left, right) => left.localeCompare(right))

const accountSelectionKey = (accountIds: string[]): string =>
  normalizeAccountIds(accountIds).join('|')

const sumKnown = (values: Array<number | null>): number | null => {
  const known = values.filter((value): value is number => value != null)
  return known.length > 0 ? known.reduce((total, value) => total + value, 0) : null
}

const isoValue = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString()

const dateValue = (value: Date | string): string =>
  value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)

const numericValue = (value: number | string | null): number | null =>
  value == null ? null : Number(value)

const toPerformancePoint = (row: PerformanceRow): LiquidityValuationPerformancePoint => ({
  date: dateValue(row.trading_date),
  totalMarketValue: numericValue(row.total_market_value_amount),
  totalCostBasis: numericValue(row.total_cost_basis_amount),
  totalUnrealizedGainLoss: numericValue(row.total_unrealized_gain_loss_amount),
  accountCount: Number(row.account_count),
  capturedAt: isoValue(row.captured_at),
  priceAsOf: row.price_as_of == null ? null : isoValue(row.price_as_of),
  pricedHoldingCount: Number(row.priced_holding_count),
  fallbackHoldingCount: Number(row.fallback_holding_count),
})

const aggregateSnapshot = (
  snapshot: MemorySnapshot,
  accountIds: Set<string>,
): LiquidityValuationPerformancePoint | null => {
  const positions = snapshot.positions.filter((position) => accountIds.has(position.accountId))
  if (positions.length === 0) return null

  return {
    date: snapshot.tradingDate,
    totalMarketValue: sumKnown(positions.map((position) => position.marketValue)),
    totalCostBasis: sumKnown(positions.map((position) => position.costBasis)),
    totalUnrealizedGainLoss: sumKnown(
      positions.map((position) => position.unrealizedGainLoss),
    ),
    accountCount: new Set(positions.map((position) => position.accountId)).size,
    capturedAt: snapshot.capturedAt,
    priceAsOf: snapshot.priceAsOf,
    pricedHoldingCount: positions.filter(
      (position) => position.valuationSource === 'official_close',
    ).length,
    fallbackHoldingCount: positions.filter(
      (position) => position.valuationSource === 'custodian_fallback',
    ).length,
  }
}

export const createInMemoryLiquidityValuationStore = (): LiquidityValuationStore & {
  clear(): void
} => {
  const snapshots: MemorySnapshot[] = []

  return {
    async saveSnapshot(input) {
      const normalizedIds = normalizeAccountIds(input.selectedAccountIds)
      const key = accountSelectionKey(normalizedIds)
      const existing = snapshots.find(
        (snapshot) =>
          snapshot.tradingDate === input.tradingDate &&
          snapshot.accountSelectionKey === key,
      )
      const saved: MemorySnapshot = {
        ...input,
        id: existing?.id ?? randomUUID(),
        selectedAccountIds: normalizedIds,
        accountSelectionKey: key,
        positions: input.positions.map((position) => ({ ...position })),
        warnings: [...input.warnings],
      }
      if (existing) snapshots.splice(snapshots.indexOf(existing), 1, saved)
      else snapshots.push(saved)
      return { id: saved.id, tradingDate: saved.tradingDate, capturedAt: saved.capturedAt }
    },

    async listPerformancePoints(input) {
      const normalizedIds = normalizeAccountIds(input.accountIds)
      if (normalizedIds.length === 0) return []
      const selected = new Set(normalizedIds)
      const latestByDate = new Map<string, MemorySnapshot>()
      for (const snapshot of snapshots) {
        if (!normalizedIds.every((accountId) => snapshot.selectedAccountIds.includes(accountId))) {
          continue
        }
        if (input.fromDate && snapshot.tradingDate < input.fromDate) continue
        if (input.toDate && snapshot.tradingDate > input.toDate) continue
        const current = latestByDate.get(snapshot.tradingDate)
        if (!current || snapshot.capturedAt > current.capturedAt) {
          latestByDate.set(snapshot.tradingDate, snapshot)
        }
      }
      return [...latestByDate.values()]
        .sort((left, right) => left.tradingDate.localeCompare(right.tradingDate))
        .slice(-(input.limit ?? 5_000))
        .map((snapshot) => aggregateSnapshot(snapshot, selected))
        .filter((point): point is LiquidityValuationPerformancePoint => point != null)
    },

    clear() {
      snapshots.length = 0
    },
  }
}

const memoryStore = createInMemoryLiquidityValuationStore()

export const liquidityValuationRepository: LiquidityValuationStore & {
  _debugClear(): void
} = {
  async saveSnapshot(input) {
    if (!pool) return memoryStore.saveSnapshot(input)

    const normalizedIds = normalizeAccountIds(input.selectedAccountIds)
    const key = accountSelectionKey(normalizedIds)
    const totalMarketValue = sumKnown(input.positions.map((position) => position.marketValue))
    const totalCostBasis = sumKnown(input.positions.map((position) => position.costBasis))
    const totalUnrealizedGainLoss = sumKnown(
      input.positions.map((position) => position.unrealizedGainLoss),
    )
    const pricedHoldingCount = input.positions.filter(
      (position) => position.valuationSource === 'official_close',
    ).length
    const fallbackHoldingCount = input.positions.length - pricedHoldingCount

    return withTransaction(async (client) => {
      const externalAccountIds = [
        ...new Set(input.positions.map((position) => position.accountId)),
      ]
      const accountResult = await client.query<{
        id: string
        plaid_account_id: string
      }>(
        `select id, plaid_account_id
         from plaid_investment_accounts
         where plaid_account_id = any($1::text[])`,
        [externalAccountIds],
      )
      const internalAccountIdByPlaidId = new Map(
        accountResult.rows.map((account) => [account.plaid_account_id, account.id]),
      )
      const missingAccountIds = externalAccountIds.filter(
        (accountId) => !internalAccountIdByPlaidId.has(accountId),
      )
      if (missingAccountIds.length > 0) {
        throw new Error(
          `Cannot save Liquidity valuation for ${missingAccountIds.length} unknown account${missingAccountIds.length === 1 ? '' : 's'}.`,
        )
      }

      const id = randomUUID()
      const snapshotResult = await client.query<{ id: string; captured_at: Date | string }>(
        `insert into liquidity_valuation_snapshots (
           id, trading_date, account_selection_key, selected_account_ids, provider, feed,
           price_as_of, captured_at, total_market_value_amount, total_cost_basis_amount,
           total_unrealized_gain_loss_amount, account_count, holding_count,
           priced_holding_count, fallback_holding_count, warnings, updated_at
         ) values (
           $1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
           $16::jsonb, $8
         )
         on conflict (trading_date, account_selection_key)
         do update set
           selected_account_ids = excluded.selected_account_ids,
           provider = excluded.provider,
           feed = excluded.feed,
           price_as_of = excluded.price_as_of,
           captured_at = excluded.captured_at,
           total_market_value_amount = excluded.total_market_value_amount,
           total_cost_basis_amount = excluded.total_cost_basis_amount,
           total_unrealized_gain_loss_amount = excluded.total_unrealized_gain_loss_amount,
           account_count = excluded.account_count,
           holding_count = excluded.holding_count,
           priced_holding_count = excluded.priced_holding_count,
           fallback_holding_count = excluded.fallback_holding_count,
           warnings = excluded.warnings,
           updated_at = excluded.updated_at
         returning id, captured_at`,
        [
          id,
          input.tradingDate,
          key,
          JSON.stringify(normalizedIds),
          input.provider,
          input.feed,
          input.priceAsOf,
          input.capturedAt,
          totalMarketValue,
          totalCostBasis,
          totalUnrealizedGainLoss,
          new Set(input.positions.map((position) => position.accountId)).size,
          input.positions.length,
          pricedHoldingCount,
          fallbackHoldingCount,
          JSON.stringify(input.warnings),
        ],
      )
      const snapshot = snapshotResult.rows[0]!
      await client.query(
        'delete from liquidity_valuation_positions where valuation_snapshot_id = $1',
        [snapshot.id],
      )

      if (input.positions.length > 0) {
        const columnsPerRow = 17
        const params: unknown[] = []
        const values = input.positions.map((position, index) => {
          const offset = index * columnsPerRow
          params.push(
            randomUUID(),
            snapshot.id,
            internalAccountIdByPlaidId.get(position.accountId),
            position.sourceHoldingId,
            position.symbol,
            position.description,
            position.securityType,
            position.currencyCode,
            position.quantity,
            position.costBasis,
            position.closingPrice,
            position.marketValue,
            position.unrealizedGainLoss,
            position.valuationSource,
            position.provider,
            position.feed,
            position.priceAsOf,
          )
          return `(${Array.from({ length: columnsPerRow }, (_, column) => `$${offset + column + 1}`).join(', ')})`
        })
        await client.query(
          `insert into liquidity_valuation_positions (
             id, valuation_snapshot_id, plaid_investment_account_id, source_holding_id,
             symbol, description, security_type, currency_code, quantity, cost_basis_amount,
             closing_price, market_value_amount, unrealized_gain_loss_amount, valuation_source,
             provider, feed, price_as_of
           ) values ${values.join(', ')}`,
          params,
        )
      }

      return {
        id: snapshot.id,
        tradingDate: input.tradingDate,
        capturedAt: isoValue(snapshot.captured_at),
      }
    })
  },

  async listPerformancePoints(input) {
    if (!pool) return memoryStore.listPerformancePoints(input)

    const accountIds = normalizeAccountIds(input.accountIds)
    if (accountIds.length === 0) return []
    const limit = Math.min(Math.max(input.limit ?? 5_000, 1), 5_000)
    const params: unknown[] = [JSON.stringify(accountIds)]
    const conditions = ['selected_account_ids @> $1::jsonb']
    if (input.fromDate) {
      params.push(input.fromDate)
      conditions.push(`trading_date >= $${params.length}`)
    }
    if (input.toDate) {
      params.push(input.toDate)
      conditions.push(`trading_date <= $${params.length}`)
    }
    params.push(limit)
    const accountIdsParam = params.length + 1
    params.push(accountIds)

    const result = await pool.query<PerformanceRow>(
      `with ranked as (
         select id, trading_date, captured_at, price_as_of,
           row_number() over (partition by trading_date order by captured_at desc, updated_at desc) as rank
         from liquidity_valuation_snapshots
         where ${conditions.join(' and ')}
       ), chosen as (
         select id, trading_date, captured_at, price_as_of
         from ranked
         where rank = 1
         order by trading_date desc
         limit $${params.length - 1}
       )
       select chosen.trading_date, chosen.captured_at, chosen.price_as_of,
         sum(position.market_value_amount) as total_market_value_amount,
         sum(position.cost_basis_amount) as total_cost_basis_amount,
         sum(position.unrealized_gain_loss_amount) as total_unrealized_gain_loss_amount,
         count(distinct position.plaid_investment_account_id) as account_count,
         count(*) filter (where position.valuation_source = 'official_close') as priced_holding_count,
         count(*) filter (where position.valuation_source = 'custodian_fallback') as fallback_holding_count
       from chosen
       join liquidity_valuation_positions position
         on position.valuation_snapshot_id = chosen.id
       join plaid_investment_accounts account
         on account.id = position.plaid_investment_account_id
        and account.plaid_account_id = any($${accountIdsParam}::text[])
       group by chosen.id, chosen.trading_date, chosen.captured_at, chosen.price_as_of
       order by chosen.trading_date asc`,
      params,
    )
    return result.rows.map(toPerformancePoint)
  },

  _debugClear() {
    memoryStore.clear()
  },
}
