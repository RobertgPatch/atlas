import { randomUUID } from 'node:crypto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { config } from '../../src/config.js'
import {
  admissionService,
  type AdmissionRequest,
} from '../../src/modules/abuse-protection/admission.service.js'
import type { AdmissionDecision } from '../../src/modules/abuse-protection/protection.types.js'
import { createMarketDataService } from '../../src/modules/market-data/market-data.service.js'
import { marketDataService } from '../../src/modules/market-data/market-data.service.js'
import type {
  MarketDataProvider,
  MarketPriceObservation,
} from '../../src/modules/market-data/market-data.types.js'
import type { SourceHoldingRecord } from '../../src/modules/liquidity-sources/liquidity-source.types.js'
import { reportsExport } from '../../src/modules/reports/reports.export.js'
import { runBackfill } from '../../src/scripts/backfill-market-price-snapshots.js'
import {
  assertZeroSideEffects,
  createInMemoryAdmissionStoreFixture,
  createProviderSpy,
  createSideEffectTracker,
  type SideEffectTracker,
} from '../helpers/abuseProtectionTestHelpers.js'
import { createTestFixture, type TestFixture } from '../helpers/testApp.js'

type RejectionKind = 'deduplicated' | 'quota_rejected'

const decisionCases: ReadonlyArray<{ label: string; kind: RejectionKind }> = [
  { label: 'duplicate', kind: 'deduplicated' },
  { label: 'over-quota', kind: 'quota_rejected' },
]

const rejectedDecision = (
  kind: RejectionKind,
  request: { policy: { policyKey: string }; requestId: string },
): AdmissionDecision => kind === 'deduplicated'
  ? {
      decision: 'deduplicated',
      policyKey: request.policy.policyKey,
      requestId: request.requestId,
      operationId: '00000000-0000-4000-8000-000000000023',
      operationState: 'succeeded',
      resultReference: 'test://existing-operation/result',
    }
  : {
      decision: 'quota_rejected',
      error: 'QUOTA_EXCEEDED',
      reasonCode: 'TEST_DAILY_QUOTA_EXCEEDED',
      retryAfterSeconds: 300,
      policyKey: request.policy.policyKey,
      requestId: request.requestId,
    }

const holding = (): SourceHoldingRecord => ({
  id: randomUUID(),
  syncSnapshotId: randomUUID(),
  accountId: randomUUID(),
  symbol: 'AAPL',
  description: 'Apple Inc.',
  type: 'equity',
  sector: 'Technology',
  industry: 'Consumer Electronics',
  cusip: null,
  isin: null,
  currencyCode: 'USD',
  quantity: 10,
  costBasis: 1_000,
  institutionPrice: 150,
  marketValue: 1_500,
  unrealizedGainLoss: 500,
  asOfDate: '2026-08-24',
  sourceKind: 'CSV',
  sourceAsOfDate: '2026-08-24',
  sourceAsOfAt: '2026-08-24T20:00:00.000Z',
  quoteEligible: true,
  providerSymbol: 'AAPL',
  exact: {
    quantity: '10',
    costBasis: '1000',
    institutionPrice: '150',
    marketValue: '1500',
    unrealizedGainLoss: '500',
  },
})

const closingPrice = (): MarketPriceObservation => ({
  id: randomUUID(),
  provider: 'test-market-provider',
  symbol: 'AAPL',
  price: 200,
  currencyCode: 'USD',
  priceType: 'official_close',
  marketSession: 'closed',
  providerTimestamp: '2026-08-24T20:00:00.000Z',
  receivedAt: '2026-08-24T20:00:01.000Z',
  tradingDate: '2026-08-24',
  isDelayed: false,
  feed: 'test-feed',
})

describe.each(decisionCases)(
  'external cost admission for a $label decision',
  ({ kind }) => {
    let fixture: TestFixture
    let sideEffects: SideEffectTracker
    let admitSpy: ReturnType<typeof vi.spyOn>
    let originalDatabaseUrl: string

    beforeEach(async () => {
      fixture = await createTestFixture()
      sideEffects = createSideEffectTracker()
      originalDatabaseUrl = config.databaseUrl

      const admission = createInMemoryAdmissionStoreFixture()
      admission.setDefaultDecision((request) => rejectedDecision(kind, request))
      admitSpy = vi.spyOn(admissionService, 'admit').mockImplementation(
        (request: AdmissionRequest) => admission.admit({
          policy: request.policy,
          requestId: request.requestId,
        }),
      )
    })

    afterEach(async () => {
      Object.assign(config, { databaseUrl: originalDatabaseUrl })
      await fixture.app.close()
      vi.restoreAllMocks()
    })

    const expectAdmissionBeforeEffects = async (
      workflow: string,
      invoke: () => Promise<unknown>,
    ) => {
      await invoke().catch(() => undefined)
      expect.soft(admitSpy, `${workflow} must ask admission before starting work`)
        .toHaveBeenCalledTimes(1)
      assertZeroSideEffects(
        sideEffects,
        `${workflow} must not perform work after a ${kind} decision.`,
      )
    }

    it('blocks market-data provider and persistence calls', async () => {
      const providerCall = createProviderSpy<
        { symbols: string[]; tradingDate: string },
        MarketPriceObservation[]
      >({
        sideEffects,
        implementation: async () => [closingPrice()],
      })
      const provider: MarketDataProvider = {
        id: 'test-market-provider',
        feed: 'test-feed',
        isDelayed: false,
        getLatestPrices: async () => [],
        getClosingPrices: (symbols, tradingDate) =>
          providerCall.invoke({ symbols, tradingDate }),
      }
      const service = createMarketDataService({
        provider,
        store: {
          getLatestPrices: async () => [],
          savePrices: async () => {
            sideEffects.increment('databaseWrites')
          },
        },
        getSelectedHoldings: () => [holding()],
        refreshOnRead: false,
        maxAgeSeconds: 60,
      })

      await expectAdmissionBeforeEffects('market-data closing-price refresh', () =>
        service.refreshClosingPrices('2026-08-24'))
    })

    it('blocks report generation and its database reads', async () => {
      vi.spyOn(reportsExport, 'generateReportExport').mockImplementation(async () => {
        sideEffects.increment('exports')
        sideEffects.increment('databaseWrites')
        return {
          fileName: 'blocked.csv',
          contentType: 'text/csv; charset=utf-8',
          body: Buffer.from('should-not-be-generated'),
        }
      })

      await expectAdmissionBeforeEffects('report export', async () =>
        fixture.app.inject({
          method: 'GET',
          url: '/v1/reports/export?reportType=portfolio_summary&format=csv',
          headers: { cookie: fixture.cookie },
        }))
    })

    it('blocks backfill initialization, providers, and snapshot writes', async () => {
      Object.assign(config, { databaseUrl: 'postgres://test-only/backfill' })
      vi.spyOn(console, 'info').mockImplementation(() => undefined)
      const refresh = createProviderSpy<string, unknown>({
        sideEffects,
        implementation: async (tradingDate) => {
          sideEffects.increment('backfills')
          sideEffects.increment('databaseWrites')
          return {
            status: 'success',
            provider: 'test-market-provider',
            tradingDate,
            requestedSymbolCount: 1,
            refreshedSymbolCount: 1,
            valuationSnapshotId: randomUUID(),
            valuedHoldingCount: 1,
            fallbackHoldingCount: 0,
            warnings: [],
          }
        },
      })
      vi.spyOn(marketDataService, 'refreshClosingPrices').mockImplementation(
        async (tradingDate) => refresh.invoke(tradingDate) as never,
      )

      await expectAdmissionBeforeEffects('market-price backfill', () =>
        runBackfill(
          ['--from=2026-08-24', '--to=2026-08-24'],
          new Date('2026-08-25T21:00:00.000Z'),
        ))
    })
  },
)
