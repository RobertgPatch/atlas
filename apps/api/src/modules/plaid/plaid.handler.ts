import type { FastifyReply, FastifyRequest } from 'fastify'
import { ZodError } from 'zod'
import { randomUUID } from 'node:crypto'
import { plaidApi, plaidClientConfig, isPlaidConfigured } from './plaid.client.js'
import { plaidRepository } from './plaid.repository.js'
import {
  plaidExchangePublicTokenBodySchema,
  plaidLinkTokenBodySchema,
  updatePlaidInvestmentAccountsBodySchema,
} from './plaid.zod.js'

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
    client_name: 'Atlas',
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
