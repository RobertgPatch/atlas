import type { FastifyReply, FastifyRequest } from 'fastify'
import { z, ZodError } from 'zod'

import { config } from '../../config.js'
import { auditRepository } from '../audit/audit.repository.js'
import {
  PROTECTION_CONTROL_KEYS,
  ProtectionOverrideConflictError,
  protectionOverrideRepository,
  protectionOverrideService,
  type ProtectionControlKey,
  type ProtectionOverrideRecord,
} from '../abuse-protection/index.js'

const paramsSchema = z.object({
  controlKey: z.enum(PROTECTION_CONTROL_KEYS),
}).strict()

const scalarSchema = z.union([
  z.string().max(256),
  z.number().finite(),
  z.boolean(),
])

const overrideSchema = z.object({
  mode: z.enum(['disable', 'lower_limit', 'temporary_allow']),
  value: z.record(scalarSchema).refine(
    (value) => Object.keys(value).length <= 12,
    'value may contain at most 12 properties',
  ).default({}),
  reason: z.string().trim().min(10).max(500),
  ticketReference: z.string().trim().max(100).optional(),
  expiresAt: z.string().datetime({ offset: true }).optional(),
}).strict()

const sendValidationError = (reply: FastifyReply, error: ZodError) =>
  reply.status(400).send({ error: 'INVALID_REQUEST', issues: error.issues })

const asControl = (
  controlKey: ProtectionControlKey,
  override: ProtectionOverrideRecord | null,
  now: Date,
) => {
  const configuredEnabled = protectionOverrideService.configuredEnabled(controlKey)
  if (!configuredEnabled) {
    return {
      controlKey,
      enabled: false,
      source: 'environment_hard_disable' as const,
      effectiveAt: now.toISOString(),
    }
  }
  if (!override) {
    return {
      controlKey,
      enabled: true,
      source: 'configured_default' as const,
      effectiveAt: now.toISOString(),
    }
  }
  return {
    controlKey,
    enabled: override.mode !== 'disable',
    source: 'runtime_override' as const,
    mode: override.mode,
    value: override.value,
    reason: override.reason,
    actorUserId: override.createdByUserId,
    effectiveAt: override.createdAt.toISOString(),
    ...(override.expiresAt ? { expiresAt: override.expiresAt.toISOString() } : {}),
  }
}

const activeByControl = (records: readonly ProtectionOverrideRecord[]) => {
  const byControl = new Map<ProtectionControlKey, ProtectionOverrideRecord>()
  for (const record of records) {
    if (
      record.scopeKind === 'workload'
      && PROTECTION_CONTROL_KEYS.includes(record.controlKey as ProtectionControlKey)
      && !byControl.has(record.controlKey as ProtectionControlKey)
    ) {
      byControl.set(record.controlKey as ProtectionControlKey, record)
    }
  }
  return byControl
}

const emergencyDailyCeiling = (controlKey: ProtectionControlKey): number => ({
  k1_uploads: config.abuseProtection.quotas.k1Upload.globalFilesPerDay,
  k1_extraction: config.abuseProtection.quotas.paidExtraction.globalDocumentsPerDay,
  k1_bedrock_checkbox: config.abuseProtection.quotas.paidExtraction.checkboxCallsGlobalPerDay,
  plaid_refresh: config.abuseProtection.quotas.externalProvider.plaidRefreshesGlobalDay,
  market_data_refresh: config.abuseProtection.quotas.externalProvider.marketProviderCallsGlobalDay,
  report_exports: config.abuseProtection.quotas.reportExport.globalExportsPerDay,
  backfills: config.abuseProtection.quotas.backfill.globalRunsPerDay,
})[controlKey]

export const listProtectionControlsHandler = async (
  _request: FastifyRequest,
  reply: FastifyReply,
) => {
  const now = new Date()
  try {
    const overrides = activeByControl(await protectionOverrideRepository.list(now))
    return reply.send({
      controls: PROTECTION_CONTROL_KEYS.map((controlKey) =>
        asControl(controlKey, overrides.get(controlKey) ?? null, now)),
    })
  } catch {
    return reply.status(503).send({ error: 'PROTECTION_UNAVAILABLE' })
  }
}

export const setProtectionOverrideHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  try {
    const { controlKey } = paramsSchema.parse(request.params)
    const body = overrideSchema.parse(request.body)
    const now = new Date()
    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null
    if (expiresAt && (
      expiresAt <= now
      || expiresAt.getTime() - now.getTime()
        > config.abuseProtection.overrides.maximumDurationSeconds * 1_000
    )) {
      return reply.status(400).send({ error: 'INVALID_REQUEST', message: 'Override expiry is outside the permitted window.' })
    }
    if (body.mode === 'temporary_allow') {
      if (!expiresAt || !body.ticketReference?.startsWith('BREAKGLASS-')) {
        return reply.status(409).send({
          error: 'OVERRIDE_CONFLICT',
          message: 'Temporary allow requires an expiring BREAKGLASS ticket.',
        })
      }
      if (!protectionOverrideService.configuredEnabled(controlKey)) {
        return reply.status(409).send({
          error: 'OVERRIDE_CONFLICT',
          message: 'A runtime override cannot bypass an environment hard disable.',
        })
      }
    }
    const requestedGlobalDailyLimit = body.value.globalDailyLimit
    if (
      typeof requestedGlobalDailyLimit === 'number'
      && requestedGlobalDailyLimit > emergencyDailyCeiling(controlKey)
    ) {
      return reply.status(409).send({
        error: 'OVERRIDE_CONFLICT',
        message: 'The requested override cannot exceed the emergency ceiling.',
      })
    }
    if (
      body.mode === 'lower_limit'
      && (
        Object.keys(body.value).length === 0
        || Object.values(body.value).some((value) => typeof value !== 'number' || value < 0)
      )
    ) {
      return reply.status(400).send({ error: 'INVALID_REQUEST', message: 'Lower-limit values must be finite non-negative numbers.' })
    }

    const created = await protectionOverrideRepository.replace({
      controlKey,
      scopeKind: 'workload',
      scopeHash: protectionOverrideService.workloadScopeHash(controlKey),
      mode: body.mode,
      value: body.value,
      reason: body.reason,
      ticketReference: body.ticketReference,
      createdByUserId: request.authUser!.userId,
      expiresAt,
      now,
    })
    await auditRepository.record({
      actorUserId: request.authUser!.userId,
      eventName: 'abuse_protection.override_set',
      objectType: 'protection_control',
      objectId: controlKey,
      after: {
        overrideId: created.overrideId,
        mode: created.mode,
        reason: created.reason,
        ticketReference: created.ticketReference,
        expiresAt: created.expiresAt,
      },
    })
    return reply.send(asControl(controlKey, created, now))
  } catch (error) {
    if (error instanceof ZodError) return sendValidationError(reply, error)
    if (error instanceof ProtectionOverrideConflictError) {
      return reply.status(409).send({ error: error.code, message: error.message })
    }
    return reply.status(503).send({ error: 'PROTECTION_UNAVAILABLE' })
  }
}

export const revokeProtectionOverrideHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  try {
    const { controlKey } = paramsSchema.parse(request.params)
    const revoked = await protectionOverrideRepository.revoke(
      controlKey,
      request.authUser!.userId,
    )
    if (!revoked) return reply.status(404).send({ error: 'NOT_FOUND' })
    await auditRepository.record({
      actorUserId: request.authUser!.userId,
      eventName: 'abuse_protection.override_revoked',
      objectType: 'protection_control',
      objectId: controlKey,
      before: { overrideId: revoked.overrideId, mode: revoked.mode },
    })
    return reply.status(204).send()
  } catch (error) {
    if (error instanceof ZodError) return sendValidationError(reply, error)
    return reply.status(503).send({ error: 'PROTECTION_UNAVAILABLE' })
  }
}
