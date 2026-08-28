import { randomUUID } from 'node:crypto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { config } from '../../src/config.js'
import * as database from '../../src/infra/db/client.js'
import * as migrations from '../../src/infra/db/migrate.js'
import {
  admissionService,
  type AdmissionRequest,
} from '../../src/modules/abuse-protection/admission.service.js'
import { admitCostWorkload } from '../../src/modules/abuse-protection/costWorkloadAdmission.js'
import type { AdmissionDecision } from '../../src/modules/abuse-protection/protection.types.js'
import { BedrockK1StatusCheckboxVerifier } from '../../src/modules/k1/extraction/bedrockCheckboxVerifier.js'
import { retryK1Extraction } from '../../src/modules/k1/extraction/k1Retry.service.js'
import { createK1IngestionBatch } from '../../src/modules/k1/ingestion/k1Batch.service.js'
import { durableK1BatchRepository } from '../../src/modules/k1/k1.repository.js'
import { createMarketDataService } from '../../src/modules/market-data/market-data.service.js'
import type {
  MarketDataProvider,
  MarketPriceObservation,
} from '../../src/modules/market-data/market-data.types.js'
import { plaidApi } from '../../src/modules/plaid/plaid.client.js'
import { plaidRepository } from '../../src/modules/plaid/plaid.repository.js'
import { reportsExport } from '../../src/modules/reports/reports.export.js'
import { marketDataService } from '../../src/modules/market-data/market-data.service.js'
import { runBackfill } from '../../src/scripts/backfill-market-price-snapshots.js'
import {
  assertZeroSideEffects,
  createProviderSpy,
  createSideEffectTracker,
  type SideEffectTracker,
} from '../helpers/abuseProtectionTestHelpers.js'
import { createTestFixture, type TestFixture } from '../helpers/testApp.js'

type BlockingDecision = 'disabled' | 'protection_unavailable'

const decisionCases: ReadonlyArray<{
  decision: BlockingDecision
  error: 'WORKLOAD_DISABLED' | 'PROTECTION_UNAVAILABLE'
}> = [
  { decision: 'disabled', error: 'WORKLOAD_DISABLED' },
  { decision: 'protection_unavailable', error: 'PROTECTION_UNAVAILABLE' },
]

const blockedDecision = (
  decision: BlockingDecision,
  request: Pick<AdmissionRequest, 'policy' | 'requestId'>,
): AdmissionDecision => ({
  decision,
  error: decision === 'disabled' ? 'WORKLOAD_DISABLED' : 'PROTECTION_UNAVAILABLE',
  reasonCode: decision === 'disabled' ? 'WORKLOAD_DISABLED' : 'CONTROL_STATE_UNAVAILABLE',
  retryAfterSeconds: 300,
  policyKey: request.policy.policyKey,
  requestId: request.requestId,
})

const holding = () => ({
  id: randomUUID(),
  syncSnapshotId: randomUUID(),
  accountId: randomUUID(),
  plaidAccountId: 'plaid-account-test',
  plaidSecurityId: 'plaid-security-test',
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
  'paid workload containment for a $decision control decision',
  ({ decision, error }) => {
    let sideEffects: SideEffectTracker
    let fixture: TestFixture | null
    let admitSpy: ReturnType<typeof vi.spyOn>
    let originalPlaidClientId: string
    let originalPlaidSecret: string
    let originalDatabaseUrl: string

    beforeEach(() => {
      fixture = null
      sideEffects = createSideEffectTracker()
      originalPlaidClientId = config.plaid.clientId
      originalPlaidSecret = config.plaid.secret
      originalDatabaseUrl = config.databaseUrl
      admitSpy = vi.spyOn(admissionService, 'admit').mockImplementation(
        async (request: AdmissionRequest) => blockedDecision(decision, request),
      )
    })

    afterEach(async () => {
      Object.assign(config.plaid, {
        clientId: originalPlaidClientId,
        secret: originalPlaidSecret,
      })
      Object.assign(config, { databaseUrl: originalDatabaseUrl })
      await fixture?.app.close()
      vi.restoreAllMocks()
    })

    const assertBlockedBeforeEffects = async (
      workflow: string,
      expectedControlKey: string,
      invoke: () => Promise<unknown>,
    ) => {
      const outcome = await invoke().then(
        (value) => ({ value, caught: null as unknown }),
        (caught: unknown) => ({ value: null, caught }),
      )

      expect.soft(admitSpy, `${workflow} must ask admission exactly once`)
        .toHaveBeenCalledTimes(1)
      expect.soft(
        admitSpy.mock.calls[0]?.[0].policy.killSwitch,
        `${workflow} must use its independent control`,
      ).toBe(expectedControlKey)

      if (
        outcome.value
        && typeof outcome.value === 'object'
        && 'statusCode' in outcome.value
        && typeof outcome.value.statusCode === 'number'
      ) {
        const response = outcome.value as {
          statusCode: number
          json(): unknown
        }
        expect.soft(response.statusCode, `${workflow} must return the bounded 503 contract`)
          .toBe(503)
        const body = response.statusCode === 503 ? response.json() : null
        expect.soft(body, `${workflow} must return the stable protection error code`)
          .toMatchObject({ error })
      } else {
        expect.soft(outcome.caught, `${workflow} must stop before work`).toMatchObject({
          code: error,
        })
      }

      assertZeroSideEffects(
        sideEffects,
        `${workflow} must perform no work after a ${decision} decision.`,
      )
    }

    it('blocks K-1 upload-slot and persistence work', async () => {
      vi.spyOn(durableK1BatchRepository, 'create').mockImplementation(async () => {
        sideEffects.increment('uploadSlots')
        sideEffects.increment('databaseWrites')
        throw new Error('K1_UPLOAD_SIDE_EFFECT_MUST_NOT_RUN')
      })

      await assertBlockedBeforeEffects('K-1 upload admission', 'k1_uploads', () =>
        createK1IngestionBatch({
          actorUserId: randomUUID(),
          entityScopeId: randomUUID(),
          files: [{
            fileName: 'schedule-k1.pdf',
            sizeBytes: 1_024,
            sha256: 'a'.repeat(64),
          }],
        }))
    })

    it('blocks K-1 extraction transactions and queue work', async () => {
      vi.spyOn(database, 'withTransaction').mockImplementation(async () => {
        sideEffects.increment('databaseWrites')
        sideEffects.increment('queueMessages')
        throw new Error('K1_EXTRACTION_SIDE_EFFECT_MUST_NOT_RUN')
      })

      await assertBlockedBeforeEffects('K-1 extraction retry', 'k1_extraction', () =>
        retryK1Extraction({
          k1DocumentId: randomUUID(),
          expectedDocumentVersion: 1,
          actorUserId: randomUUID(),
        }))
    })

    it('rechecks the independent checkbox switch immediately before Bedrock', async () => {
      const provider = createProviderSpy<unknown, unknown>({
        sideEffects,
        implementation: async () => ({
          output: {
            message: {
              content: [{ text: '{"finalK1":true,"amendedK1":false}' }],
            },
          },
        }),
      })
      const verifier = new BedrockK1StatusCheckboxVerifier({
        client: { send: (command) => provider.invoke(command) as never },
        modelId: 'test-model',
        beforeProviderCall: () => admitCostWorkload({
          workloadKey: 'k1_bedrock_checkbox',
          controlKey: 'k1_bedrock_checkbox',
          method: 'POST',
          routePattern: '/v1/k1-documents/:k1DocumentId/retry-extraction',
          principal: 'test-document',
          canonicalInputs: { documentId: 'test-document' },
          globalDailyLimit: 1,
        }),
      } as ConstructorParameters<typeof BedrockK1StatusCheckboxVerifier>[0] & {
        beforeProviderCall: () => Promise<void>
      })

      await assertBlockedBeforeEffects(
        'K-1 Bedrock checkbox verification',
        'k1_bedrock_checkbox',
        () => verifier.verify(Buffer.from('%PDF-test')),
      )
    })

    it('blocks Plaid before provider calls', async () => {
      fixture = await createTestFixture()
      Object.assign(config.plaid, {
        clientId: 'test-client-id',
        secret: 'test-secret',
      })
      const provider = createProviderSpy<unknown, unknown>({
        sideEffects,
        implementation: async () => ({
          data: {
            link_token: 'link-test-token',
            expiration: '2026-08-25T12:30:00.000Z',
          },
        }),
      })
      vi.spyOn(plaidApi, 'linkTokenCreate').mockImplementation(
        async (input) => provider.invoke(input) as never,
      )

      await assertBlockedBeforeEffects('Plaid link-token creation', 'plaid_refresh', () =>
        fixture!.app.inject({
          method: 'POST',
          url: '/v1/plaid/link-token',
          headers: { cookie: fixture!.cookie },
          payload: { mode: 'create' },
        }))
    })

    it('blocks market refresh before provider and price persistence', async () => {
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

      await assertBlockedBeforeEffects(
        'market-data closing-price refresh',
        'market_data_refresh',
        () => service.refreshClosingPrices('2026-08-24'),
      )
    })

    it('blocks report exports before generation and database reads', async () => {
      fixture = await createTestFixture()
      vi.spyOn(reportsExport, 'generateReportExport').mockImplementation(async () => {
        sideEffects.increment('exports')
        sideEffects.increment('databaseWrites')
        return {
          fileName: 'blocked.csv',
          contentType: 'text/csv; charset=utf-8',
          body: Buffer.from('must-not-be-generated'),
        }
      })

      await assertBlockedBeforeEffects('report export', 'report_exports', () =>
        fixture!.app.inject({
          method: 'GET',
          url: '/v1/reports/export?reportType=portfolio_summary&format=csv',
          headers: { cookie: fixture!.cookie },
        }))
    })

    it('blocks backfills before migration, provider, and snapshot writes', async () => {
      Object.assign(config, { databaseUrl: 'postgres://test-only/backfill' })
      vi.spyOn(console, 'info').mockImplementation(() => undefined)
      vi.spyOn(migrations, 'runMigrations').mockImplementation(async () => {
        sideEffects.increment('databaseWrites')
      })
      vi.spyOn(plaidRepository, 'bootstrapFromDatabase').mockImplementation(async () => {
        sideEffects.increment('databaseWrites')
      })
      vi.spyOn(marketDataService, 'refreshClosingPrices').mockImplementation(async () => {
        sideEffects.increment('providerCalls')
        sideEffects.increment('backfills')
        sideEffects.increment('databaseWrites')
        return {
          status: 'success',
          provider: 'test-provider',
          tradingDate: '2026-08-24',
          requestedSymbolCount: 1,
          refreshedSymbolCount: 1,
          valuationSnapshotId: randomUUID(),
          valuedHoldingCount: 1,
          fallbackHoldingCount: 0,
          warnings: [],
        }
      })

      await assertBlockedBeforeEffects('market-price backfill', 'backfills', () =>
        runBackfill(
          ['--from=2026-08-24', '--to=2026-08-24'],
          new Date('2026-08-25T21:00:00.000Z'),
        ))
    })
  },
)
