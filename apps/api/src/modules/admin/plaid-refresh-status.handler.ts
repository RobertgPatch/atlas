import { timingSafeEqual } from 'node:crypto'

import type { FastifyReply, FastifyRequest } from 'fastify'
import { ZodError } from 'zod'
import { config } from '../../config.js'
import {
  schedulerRefreshBodySchema,
  schedulerTokenHeadersSchema,
} from '../reports/reports.zod.js'
import { RefreshAlreadyRunningError } from '../plaid/plaid.holdings-sync.js'
import { plaidRepository } from '../plaid/plaid.repository.js'
import { evaluateSnapshotFreshness } from '../plaid/plaid.refresh-policy.js'
import { plaidRefreshScheduler } from '../plaid/plaid.refresh-scheduler.js'
import { admitCostWorkload } from '../abuse-protection/costWorkloadAdmission.js'

const sendValidationError = (reply: FastifyReply, error: ZodError) =>
  reply.status(400).send({ error: 'VALIDATION_ERROR', issues: error.issues })

const tokenMatches = (received: string) => {
  const expected = Buffer.from(config.plaidRefresh.schedulerToken, 'utf8')
  const candidate = Buffer.from(received, 'utf8')
  return expected.length > 0
    && expected.length === candidate.length
    && timingSafeEqual(expected, candidate)
}

const uniqueWarnings = (warnings: string[]) => [...new Set(warnings)]

export const runPlaidRefreshHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  let headers: ReturnType<typeof schedulerTokenHeadersSchema.parse>
  let body: ReturnType<typeof schedulerRefreshBodySchema.parse>

  try {
    headers = schedulerTokenHeadersSchema.parse(request.headers)
    body = schedulerRefreshBodySchema.parse(request.body ?? {})
  } catch (error) {
    if (error instanceof ZodError) {
      if (error.issues.some((issue) => issue.path[0] === 'x-atlas-scheduler-token')) {
        reply.status(401).send({ error: 'UNAUTHORIZED' })
        return
      }
      sendValidationError(reply, error)
      return
    }
    throw error
  }

  if (!tokenMatches(headers['x-atlas-scheduler-token'])) {
    reply.status(401).send({ error: 'UNAUTHORIZED' })
    return
  }
  if (body.force) {
    reply.status(400).send({ error: 'SCHEDULER_FORCE_NOT_ALLOWED' })
    return
  }

  await admitCostWorkload({
    workloadKey: 'plaid_scheduled_refresh',
    method: 'POST',
    routePattern: '/v1/admin/plaid-refresh/run',
    principal: 'scheduler:plaid-refresh',
    canonicalInputs: { scheduledFor: body.scheduledFor ?? null },
    globalDailyLimit: config.abuseProtection.quotas.externalProvider.plaidRefreshesGlobalDay,
    quotas: [
      ...plaidRepository.getSelectedInvestmentAccounts().map((account) => ({
        scopeKind: 'account' as const,
        scopeValue: account.id,
        limit: config.abuseProtection.quotas.externalProvider.plaidRefreshesPerAccountDay,
      })),
      { scopeKind: 'global', scopeValue: 'atlas', limit: config.abuseProtection.quotas.externalProvider.plaidRefreshesGlobalDay },
    ],
    leaseTtlSeconds: Math.ceil(config.abuseProtection.timeouts.plaidProviderMs / 1_000),
  })

  try {
    const attempt = await plaidRefreshScheduler.runScheduledRefresh({
      scheduledFor: body.scheduledFor,
      force: body.force,
    })
    reply.status(202).send(attempt)
  } catch (error) {
    if (error instanceof RefreshAlreadyRunningError) {
      reply.status(409).send({
        error: 'REFRESH_ALREADY_RUNNING',
        activeRefreshId: error.activeRefreshId,
      })
      return
    }
    throw error
  }
}

export const getPlaidRefreshStatusHandler = async (
  _request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  const selectedAccountIds = plaidRepository
    .getSelectedInvestmentAccounts()
    .map((account) => account.id)
  const [policy, latestAttempt, latestSuccessfulAttempt, activeAttempt, latestSnapshot] =
    await Promise.all([
      plaidRepository.getRefreshPolicy(),
      plaidRepository.getLatestRefreshAttempt(),
      plaidRepository.getLatestRefreshAttempt({ successfulOnly: true }),
      plaidRepository.getActiveRefreshAttempt(selectedAccountIds),
      selectedAccountIds.length > 0
        ? plaidRepository.getLatestHoldingsSnapshotMetadata({
            dashboardEligible: true,
            selectedAccountIds,
            successfulOnly: true,
          })
        : Promise.resolve(null),
    ])
  const freshness = evaluateSnapshotFreshness({
    policy,
    snapshot: latestSnapshot,
    activeAttempt,
  })
  const schedulerConfigured =
    config.plaidRefresh.schedulerEnabled &&
    config.plaidRefresh.schedulerMode !== 'none' &&
    Boolean(config.plaidRefresh.schedulerToken)
  const warnings = uniqueWarnings([
    ...plaidRefreshScheduler.getSchedulerWarnings(),
    ...freshness.warnings,
    ...(selectedAccountIds.length === 0
      ? ['No Plaid investment accounts are selected for Liquidity refresh.']
      : []),
  ])

  reply.send({
    refreshPolicy: {
      cadence: policy.cadence,
      refreshTimeLocal: policy.refreshTimeLocal,
      timezone: policy.timezone,
      automaticRefreshEnabled: policy.automaticRefreshEnabled,
    },
    schedulerConfigured,
    schedulerMode: config.plaidRefresh.schedulerMode,
    freshnessStatus: freshness.status,
    lastAttemptedRefreshAt: latestAttempt?.startedAt ?? null,
    lastSuccessfulRefreshAt: latestSuccessfulAttempt?.completedAt ?? null,
    nextRefreshAt: freshness.nextRefreshAt,
    activeRefreshId: activeAttempt?.id ?? null,
    warnings,
    checkedAt: new Date().toISOString(),
  })
}
