import type { FastifyReply, FastifyRequest } from 'fastify'
import { ZodError } from 'zod'
import { randomUUID } from 'node:crypto'
import { auditRepository } from '../audit/audit.repository.js'
import { PARTNERSHIP_AUDIT_EVENTS } from '../audit/audit.events.js'
import { plaidApi, plaidClientConfig, isPlaidConfigured } from './plaid.client.js'
import {
  PlaidConnectionOwnershipError,
  plaidRepository,
} from './plaid.repository.js'
import {
  plaidExchangePublicTokenBodySchema,
  plaidLinkTokenBodySchema,
  updatePlaidInvestmentAccountsBodySchema,
} from './plaid.zod.js'

const sendValidationError = (reply: FastifyReply, error: ZodError) =>
  reply.status(400).send({ error: 'VALIDATION_ERROR', issues: error.issues })

const accountVisibilityFor = (request: FastifyRequest) => ({
  actorUserId: request.authUser!.userId,
  isAdmin: request.authUser!.role === 'Admin',
})

export const createPlaidLinkTokenHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  if (!request.authUser) {
    reply.status(401).send({ error: 'UNAUTHORIZED' })
    return
  }

  try {
    plaidLinkTokenBodySchema.parse(request.body ?? {})
  } catch (error) {
    if (error instanceof ZodError) {
      sendValidationError(reply, error)
      return
    }
    throw error
  }

  if (!isPlaidConfigured()) {
    reply.send({
      linkToken: `link-sandbox-${randomUUID()}`,
      expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    })
    return
  }

  const response = await plaidApi.linkTokenCreate({
    user: { client_user_id: request.authUser.userId },
    client_name: 'Jackson',
    language: 'en',
    products: plaidClientConfig.products,
    country_codes: plaidClientConfig.countryCodes,
    redirect_uri: plaidClientConfig.redirectUri,
  })

  reply.send({
    linkToken: response.data.link_token,
    expiration: response.data.expiration,
  })
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

  const exchange = isPlaidConfigured()
    ? await plaidApi.itemPublicTokenExchange({ public_token: body.publicToken })
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

  let result: ReturnType<typeof plaidRepository.createConnectionFromPublicToken>
  try {
    result = plaidRepository.createConnectionFromPublicToken({
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
  } catch (error) {
    if (error instanceof PlaidConnectionOwnershipError) {
      reply.status(409).send({ error: 'PLAID_CONNECTION_OWNERSHIP_CONFLICT' })
      return
    }
    throw error
  }

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

  reply.send({
    accounts: plaidRepository.listInvestmentAccounts(accountVisibilityFor(request)),
  })
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
    accounts: plaidRepository.updateSelectedInvestmentAccounts(
      body.selectedAccountIds,
      accountVisibilityFor(request),
    ),
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

  const cleared = await plaidRepository.clearConnectedAccounts(
    accountVisibilityFor(request),
  )

  await auditRepository.record({
    actorUserId: request.authUser.userId,
    eventName: PARTNERSHIP_AUDIT_EVENTS.PLAID_ACCOUNTS_CLEARED,
    objectType: 'plaid_connection',
    after: cleared,
  })

  reply.send({ accounts: [] })
}
