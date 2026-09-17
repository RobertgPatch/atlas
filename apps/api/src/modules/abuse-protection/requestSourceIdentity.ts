import { BlockList, isIP } from 'node:net'
import type { FastifyInstance } from 'fastify'

import { config } from '../../config.js'
import { buildProtectionUnavailableResponse } from './protection.errors.js'
import { normalizeSourcePrefix } from './subjectFingerprint.js'

declare module 'fastify' {
  interface FastifyRequest {
    abuseProtectionSourcePrefix?: string
  }
}

export interface RequestSourceIdentity {
  readonly normalizedPrefix: string
  readonly source: 'cloudfront_viewer_address'
}

const invalidViewerSource = (): never => {
  throw new Error('INVALID_VIEWER_SOURCE')
}

export const parseCloudFrontViewerAddress = (
  header: string | readonly string[] | undefined,
  ipv6PrefixLength: number,
): string => {
  if (typeof header !== 'string' || header.length === 0 || header.length > 256) {
    return invalidViewerSource()
  }
  if (/[\u0000-\u001f\u007f,]/.test(header) || header !== header.trim()) {
    return invalidViewerSource()
  }

  let address: string
  let portText: string
  if (header.startsWith('[')) {
    const bracketed = /^\[([^\]]+)\]:(\d{1,5})$/.exec(header)
    if (!bracketed) return invalidViewerSource()
    address = bracketed[1]!
    portText = bracketed[2]!
    if (address.includes('%') || isIP(address) !== 6) return invalidViewerSource()
  } else {
    const ipv4 = /^([^:]+):(\d{1,5})$/.exec(header)
    if (!ipv4) return invalidViewerSource()
    address = ipv4[1]!
    portText = ipv4[2]!
    if (isIP(address) !== 4) return invalidViewerSource()
  }

  const port = Number(portText)
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    return invalidViewerSource()
  }
  try {
    return normalizeSourcePrefix(address, ipv6PrefixLength)
  } catch {
    return invalidViewerSource()
  }
}

export const resolveRequestSourceIdentity = (input: {
  readonly header: string | readonly string[] | undefined
  readonly trustedPath: boolean
  readonly production: boolean
  readonly ipv6PrefixLength: number
}): RequestSourceIdentity | null => {
  if (input.header === undefined && !input.production) return null
  if (!input.trustedPath) throw new Error('UNTRUSTED_VIEWER_SOURCE_PATH')
  return {
    normalizedPrefix: parseCloudFrontViewerAddress(input.header, input.ipv6PrefixLength),
    source: 'cloudfront_viewer_address',
  }
}

const splitCidr = (cidr: string): { address: string; prefix: number; family: 'ipv4' | 'ipv6' } | null => {
  const match = /^(.+)\/(\d{1,3})$/.exec(cidr.trim())
  if (!match) return null
  const address = match[1]!
  const kind = isIP(address)
  const prefix = Number(match[2])
  if (kind === 4 && prefix >= 0 && prefix <= 32) return { address, prefix, family: 'ipv4' }
  if (kind === 6 && prefix >= 0 && prefix <= 128) return { address, prefix, family: 'ipv6' }
  return null
}

export const isTrustedProxyAddress = (
  address: string | undefined,
  cidrs: readonly string[],
): boolean => {
  if (!address) return false
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(address)?.[1]
  const candidate = mapped ?? address
  const kind = isIP(candidate)
  if (kind === 0) return false
  const blockList = new BlockList()
  for (const cidr of cidrs) {
    const parsed = splitCidr(cidr)
    if (!parsed) return false
    blockList.addSubnet(parsed.address, parsed.prefix, parsed.family)
  }
  return blockList.check(candidate, kind === 4 ? 'ipv4' : 'ipv6')
}

export const registerRequestSourceIdentity = (app: FastifyInstance): void => {
  app.addHook('onRequest', async (request, reply) => {
    const policy = request.routeOptions.config?.abuseProtection
    if (!policy || !config.abuseProtection.sourceIdentity.requireGeneratedHeader) return

    try {
      const identity = resolveRequestSourceIdentity({
        header: request.headers[config.abuseProtection.sourceIdentity.generatedHeaderName],
        trustedPath: isTrustedProxyAddress(request.socket.remoteAddress, config.trustedProxyCidrs),
        production: config.nodeEnv === 'production',
        ipv6PrefixLength: config.abuseProtection.localRates.ipv6PrefixLength,
      })
      if (!identity) throw new Error('VIEWER_SOURCE_REQUIRED')
      request.abuseProtectionSourcePrefix = identity.normalizedPrefix
    } catch {
      const response = buildProtectionUnavailableResponse({
        code: 'PROTECTION_UNAVAILABLE',
        requestId: request.id,
        retryAfterSeconds: 30,
      })
      reply.status(response.statusCode)
      for (const [name, value] of Object.entries(response.headers)) reply.header(name, value)
      await reply.send(response.body)
    }
  })
}
