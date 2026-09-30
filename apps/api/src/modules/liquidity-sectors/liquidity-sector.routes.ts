import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z, ZodError } from 'zod'
import { normalizeSectorSymbol, SECTOR_FILTER_OPTIONS } from '@jackson/types/liquidity-sectors'
import { withSession } from '../auth/session.middleware.js'
import { requireAdmin } from '../auth/rbac.middleware.js'
import { defaultRouteProtectionPolicy } from '../abuse-protection/policy.defaults.js'
import { liquiditySectorRepository, SectorAssignmentError } from './liquidity-sector.repository.js'

export const sectorSymbolSchema = z.string().max(64).transform(normalizeSectorSymbol)
  .pipe(z.string().regex(/^[A-Z0-9][A-Z0-9.]{0,31}$/))
export const saveSectorSchema = z.object({
  sector: z.enum(SECTOR_FILTER_OPTIONS).nullable(),
  expectedVersion: z.number().int().min(0).max(2147483646),
}).strict()

const handle = (fn: (request: FastifyRequest) => Promise<unknown>) =>
  async (request: FastifyRequest, reply: FastifyReply) => {
    try { return await fn(request) } catch (error) {
      if (error instanceof ZodError) return reply.status(400).send({ error: 'INVALID_REQUEST', message: 'Choose a valid stock symbol and sector.' })
      if (error instanceof SectorAssignmentError) {
        const status = { FORBIDDEN: 403, STALE_VERSION: 409, STORAGE_UNAVAILABLE: 503 }[error.code]
        return reply.status(status).send({ error: error.code, message: error.code === 'STALE_VERSION'
          ? 'This assignment changed in another session. Reload the list and try again.'
          : error.code === 'FORBIDDEN' ? 'Only administrators can manage sectors.' : 'Sector assignments are temporarily unavailable.' })
      }
      throw error
    }
  }

export async function registerLiquiditySectorRoutes(app: FastifyInstance) {
  app.get('/liquidity-sectors', {
    preHandler: [withSession, requireAdmin],
    config: { abuseProtection: defaultRouteProtectionPolicy('GET', '/v1/liquidity-sectors') },
  }, handle(async () => ({ items: await liquiditySectorRepository.list() })))
  app.put('/liquidity-sectors/:symbol', {
    preHandler: [withSession, requireAdmin],
    config: { abuseProtection: defaultRouteProtectionPolicy('PUT', '/v1/liquidity-sectors/:symbol') },
  }, handle(async (request) => {
    const { symbol } = z.object({ symbol: sectorSymbolSchema }).parse(request.params)
    return liquiditySectorRepository.save(symbol, saveSectorSchema.parse(request.body), {
      userId: request.authUser!.userId, isAdmin: request.authUser!.role === 'Admin',
    })
  }))
}
