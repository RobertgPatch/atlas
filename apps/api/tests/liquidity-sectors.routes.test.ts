import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { registerLiquiditySectorRoutes } from '../src/modules/liquidity-sectors/liquidity-sector.routes.js'
import { liquiditySectorRepository, SectorAssignmentError } from '../src/modules/liquidity-sectors/liquidity-sector.repository.js'

vi.mock('../src/modules/auth/session.middleware.js', () => ({ withSession: async () => undefined }))
const apps: ReturnType<typeof Fastify>[] = []
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(apps.splice(0).map((app) => app.close())) })
async function appFor(role?: 'Admin' | 'User') {
  const app = Fastify()
  apps.push(app)
  await app.register(cookie)
  app.addHook('onRequest', async (request) => {
    if (role) request.authUser = { userId: '00000000-0000-4000-8000-000000000001', role } as NonNullable<typeof request.authUser>
  })
  await registerLiquiditySectorRoutes(app)
  return app
}
describe('sector administration routes', () => {
  it.each([undefined, 'User'] as const)('denies list and mutation for %s', async (role) => {
    const list = vi.spyOn(liquiditySectorRepository, 'list')
    const save = vi.spyOn(liquiditySectorRepository, 'save')
    const app = await appFor(role)
    expect((await app.inject({ method: 'GET', url: '/liquidity-sectors' })).statusCode).toBe(role ? 403 : 401)
    expect((await app.inject({ method: 'PUT', url: '/liquidity-sectors/AAPL', payload: { sector: 'Energy', expectedVersion: 0 } })).statusCode).toBe(role ? 403 : 401)
    expect(list).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled()
  })
  it('normalizes share classes and validates sectors and optimistic versions', async () => {
    const save = vi.spyOn(liquiditySectorRepository, 'save').mockResolvedValue({ symbol: 'BRK.B', sector: 'Financials', version: 1, updatedAt: '2026-09-30T10:00:00Z' })
    const app = await appFor('Admin')
    const valid = await app.inject({ method: 'PUT', url: '/liquidity-sectors/brk-b', payload: { sector: 'Financials', expectedVersion: 0 } })
    expect(valid.statusCode).toBe(200)
    expect(save).toHaveBeenCalledWith('BRK.B', { sector: 'Financials', expectedVersion: 0 }, expect.objectContaining({ isAdmin: true }))
    for (const payload of [{ sector: 'Made up', expectedVersion: 0 }, { sector: 'Technology' }, { sector: null, expectedVersion: -1 }, { sector: 'Energy', expectedVersion: 0, entityId: 'bad' }]) {
      expect((await app.inject({ method: 'PUT', url: '/liquidity-sectors/AAPL', payload })).statusCode).toBe(400)
    }
    expect((await app.inject({ method: 'PUT', url: '/liquidity-sectors/%3Cscript%3E', payload: { sector: 'Energy', expectedVersion: 0 } })).statusCode).toBe(400)
  })
  it('allows reset and reports concurrent changes as a conflict', async () => {
    const save = vi.spyOn(liquiditySectorRepository, 'save').mockRejectedValue(new SectorAssignmentError('STALE_VERSION'))
    const app = await appFor('Admin')
    const response = await app.inject({ method: 'PUT', url: '/liquidity-sectors/AAPL', payload: { sector: null, expectedVersion: 2 } })
    expect(response.statusCode).toBe(409)
    expect(response.json().message).toContain('another session')
    expect(save).toHaveBeenCalledWith('AAPL', { sector: null, expectedVersion: 2 }, expect.anything())
  })
})
