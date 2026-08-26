import type { FastifyReply, FastifyRequest } from 'fastify'
import { ZodError } from 'zod'
import { randomUUID } from 'node:crypto'
import { auditRepository } from '../audit/audit.repository.js'
import { PARTNERSHIP_AUDIT_EVENTS } from '../audit/audit.events.js'
import {
  callPlaidWithRetry,
  plaidApi,
  plaidClientConfig,
  isPlaidConfigured,
} from './plaid.client.js'
import { plaidRepository } from './plaid.repository.js'
import {
  plaidExchangePublicTokenBodySchema,
  plaidLinkTokenBodySchema,
  updatePlaidInvestmentAccountsBodySchema,
} from './plaid.zod.js'
import { config } from '../../config.js'
import { admitCostWorkload } from '../abuse-protection/costWorkloadAdmission.js'

const sendValidationError = (reply: FastifyReply, error: ZodError) =>
  reply.status(400).send({ error: 'VALIDATION_ERROR', issues: error.issues })

export const createPlaidLinkTokenHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  if (!request.authUser) {
    reply.status(401).send({ error: 'UNAUTHORIZED' })
    return
  }

  let body: ReturnType<typeof plaidLinkTokenBodySchema.parse>
  try {
    body = plaidLinkTokenBodySchema.parse(request.body ?? {})
  } catch (error) {
    if (error instanceof ZodError) {
      sendValidationError(reply, error)
      return
    }
    throw error
  }

  const operation = await admitCostWorkload({
    workloadKey: 'plaid_link_token',
    method: 'POST',
    routePattern: '/v1/plaid/link-token',
    principal: request.authUser.userId,
    canonicalInputs: {
      mode: body.mode,
      connectionId: body.connectionId ?? null,
      // Do not reuse an expired token from an earlier Link session. Clients can
      // still supply a bounded key when they need transport-level retry safety.
      attemptId: body.idempotencyKey ?? randomUUID(),
    },
    globalDailyLimit: config.abuseProtection.quotas.externalProvider.marketProviderCallsGlobalDay,
    quotas: [
      { scopeKind: 'user', scopeValue: request.authUser.userId, limit: config.abuseProtection.quotas.externalProvider.plaidLinkTokensPerUserDay },
      { scopeKind: 'global', scopeValue: 'atlas', limit: config.abuseProtection.quotas.externalProvider.marketProviderCallsGlobalDay },
    ],
    leaseTtlSeconds: Math.ceil(config.abuseProtection.timeouts.plaidProviderMs / 1_000),
  })

  try {
    if (!isPlaidConfigured()) {
      const linkToken = `link-sandbox-${randomUUID()}`
      await operation.succeed()
      reply.send({
        linkToken,
        expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      })
      return
    }

    const response = await callPlaidWithRetry((signal) => plaidApi.linkTokenCreate({
      user: { client_user_id: request.authUser!.userId },
      client_name: 'Jackson',
      language: 'en',
      products: plaidClientConfig.products,
      country_codes: plaidClientConfig.countryCodes,
      redirect_uri: plaidClientConfig.redirectUri,
    }, { signal }))

    await operation.succeed()
    reply.send({
      linkToken: response.data.link_token,
      expiration: response.data.expiration,
    })
  } catch (error) {
    await operation.fail()
    throw error
  }
}

export const exchangePlaidPublicTokenHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  if (!request.authUser) {
    reply.status(401).send({ error: 'UNAUTHORIZED' })
    return
  }

  let body: ReturnType<typeof plaidExchangePublicTokenBodySchema.parse>
  try {
    body = plaidExchangePublicTokenBodySchema.parse(request.body)
  } catch (error) {
    if (error instanceof ZodError) {
      sendValidationError(reply, error)
      return
    }
    throw error
  }

  await admitCostWorkload({
    workloadKey: 'plaid_public_token_exchange',
    method: 'POST',
    routePattern: '/v1/plaid/exchange-public-token',
    principal: request.authUser.userId,
    canonicalInputs: { publicToken: body.publicToken },
    globalDailyLimit: config.abuseProtection.quotas.externalProvider.marketProviderCallsGlobalDay,
    quotas: [
      { scopeKind: 'user', scopeValue: request.authUser.userId, limit: config.abuseProtection.quotas.externalProvider.plaidExchangesPerUserDay },
      { scopeKind: 'global', scopeValue: 'atlas', limit: config.abuseProtection.quotas.externalProvider.marketProviderCallsGlobalDay },
    ],
    leaseTtlSeconds: Math.ceil(config.abuseProtection.timeouts.plaidProviderMs / 1_000),
  })

  const exchange = isPlaidConfigured()
    ? await callPlaidWithRetry((signal) => plaidApi.itemPublicTokenExchange(
        { public_token: body.publicToken },
        { signal },
      ))
    : {
        data: {
          access_token: `access-sandbox-${randomUUID()}`,
          item_id: `item-sandbox-${randomUUID()}`,
        },
      }

  const metadata = body.metadata ?? {}
  const institution =
    metadata.institution && typeof metadata.institution === 'object'
      ? (metadata.institution as Record<string, unknown>)
      : {}

  const result = plaidRepository.createConnectionFromPublicToken({
    ownerUserId: request.authUser.userId,
    plaidItemId: exchange.data.item_id,
    accessToken: exchange.data.access_token,
    institutionId:
      typeof institution.institution_id === 'string'
        ? institution.institution_id
        : null,
    institutionName:
      typeof institution.name === 'string' ? institution.name : 'Plaid Institution',
    metadataAccounts: Array.isArray(metadata.accounts)
      ? (metadata.accounts as Array<Record<string, unknown>>)
      : [],
  })

  reply.send(result)
}

export const listPlaidInvestmentAccountsHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  if (!request.authUser) {
    reply.status(401).send({ error: 'UNAUTHORIZED' })
    return
  }

  reply.send({ accounts: plaidRepository.listInvestmentAccounts() })
}

export const updatePlaidInvestmentAccountsHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  if (!request.authUser) {
    reply.status(401).send({ error: 'UNAUTHORIZED' })
    return
  }

  let body: ReturnType<typeof updatePlaidInvestmentAccountsBodySchema.parse>
  try {
    body = updatePlaidInvestmentAccountsBodySchema.parse(request.body)
  } catch (error) {
    if (error instanceof ZodError) {
      sendValidationError(reply, error)
      return
    }
    throw error
  }

  reply.send({
    accounts: plaidRepository.updateSelectedInvestmentAccounts(body.selectedAccountIds),
  })
}

export const clearPlaidInvestmentAccountsHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  if (!request.authUser) {
    reply.status(401).send({ error: 'UNAUTHORIZED' })
    return
  }

  const cleared = await plaidRepository.clearConnectedAccounts()

  await auditRepository.record({
    actorUserId: request.authUser.userId,
    eventName: PARTNERSHIP_AUDIT_EVENTS.PLAID_ACCOUNTS_CLEARED,
    objectType: 'plaid_connection',
    after: cleared,
  })

  reply.send({ accounts: [] })
}
