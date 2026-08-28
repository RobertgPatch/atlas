import type { FastifyReply, FastifyRequest } from 'fastify'
import { ZodError, type ZodType } from 'zod'
import { K1TrackerError } from './k1-tracker.types.js'
import { k1TrackerRepository } from './k1-tracker.repository.js'
import {
  calculateTrackerYearBodySchema, createTrackerYearBodySchema, deleteTrackerYearQuerySchema,
  importCommitBodySchema, signoffBodySchema, trackerImportParamsSchema, trackerListQuerySchema,
  trackerPartnershipParamsSchema, trackerYearParamsSchema, updateTrackerYearBodySchema,
} from './k1-tracker.zod.js'
import { config } from '../../config.js'
import { admitCostWorkload } from '../abuse-protection/costWorkloadAdmission.js'

const parse = <T>(schema: ZodType<T>, value: unknown, reply: FastifyReply): T | null => {
  try { return schema.parse(value) } catch (error) {
    if (error instanceof ZodError) { void reply.code(400).send({ error: 'VALIDATION_ERROR', issues: error.issues }); return null }
    throw error
  }
}
const requireAdmin = (request: FastifyRequest, reply: FastifyReply): boolean => {
  if (request.authUser?.role === 'Admin') return true
  void reply.code(403).send({ error: 'FORBIDDEN_ROLE' }); return false
}
const handleError = (reply: FastifyReply, error: unknown): boolean => {
  if (!(error instanceof K1TrackerError)) return false
  const code = error.code
  const status = code === 'DATABASE_REQUIRED' ? 503 : code === 'TRACKER_NOT_FOUND' || code === 'IMPORT_NOT_FOUND' ? 404 : code === 'FORBIDDEN_TRACKER_ENTITY' ? 403 : code === 'IMPORT_EXPIRED' ? 410 : code === 'STALE_TRACKER_REVISION' || code === 'SOURCE_CONFLICT' ? 409 : 400
  void reply.code(status).send({ error: code, message: error.message }); return true
}
const run = async (reply: FastifyReply, fn: () => Promise<unknown>) => { try { return await fn() } catch (error) { if (!handleError(reply, error)) throw error; return undefined } }

export const listK1TrackerPartnershipsHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const query = parse(trackerListQuerySchema, request.query, reply); if (!query) return
  await run(reply, async () => reply.send(await k1TrackerRepository.listPartnerships(request.partnershipScope!, { ...query, limit: query.limit ?? 25 })))
}
export const getK1TrackerPartnershipHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const params = parse(trackerPartnershipParamsSchema, request.params, reply); if (!params) return
  await run(reply, async () => reply.send(await k1TrackerRepository.getPartnership(params.partnershipId, request.partnershipScope!)))
}
export const getK1TrackerYearHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const params = parse(trackerYearParamsSchema, request.params, reply); if (!params) return
  await run(reply, async () => reply.send(await k1TrackerRepository.getYear(params.partnershipId, params.taxYear, request.partnershipScope!)))
}
export const createK1TrackerYearHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  if (!requireAdmin(request, reply)) return; const params = parse(trackerPartnershipParamsSchema, request.params, reply); const body = parse(createTrackerYearBodySchema, request.body, reply); if (!params || !body) return
  await run(reply, async () => reply.code(201).send(await k1TrackerRepository.createYear(params.partnershipId, body.taxYear, body.values ?? [], request.authUser!.userId, request.partnershipScope!)))
}
export const updateK1TrackerYearHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  if (!requireAdmin(request, reply)) return; const params = parse(trackerYearParamsSchema, request.params, reply); const body = parse(updateTrackerYearBodySchema, request.body, reply); if (!params || !body) return
  await run(reply, async () => reply.send(await k1TrackerRepository.updateYear(params.partnershipId, params.taxYear, body.expectedRevision, body.changes ?? [], request.authUser!.userId, request.partnershipScope!, body.officialFormData)))
}
export const deleteK1TrackerYearHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  if (!requireAdmin(request, reply)) return; const params = parse(trackerYearParamsSchema, request.params, reply); const query = parse(deleteTrackerYearQuerySchema, request.query, reply); if (!params || !query) return
  await run(reply, async () => { await k1TrackerRepository.deleteYear(params.partnershipId, params.taxYear, query.expectedRevision, request.authUser!.userId, request.partnershipScope!); return reply.code(204).send() })
}
export const calculateK1TrackerYearHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const params = parse(trackerYearParamsSchema, request.params, reply); const body = parse(calculateTrackerYearBodySchema, request.body, reply); if (!params || !body) return
  await run(reply, async () => reply.send(await k1TrackerRepository.calculateDraft(params.partnershipId, params.taxYear, body.expectedRevision, body.changes ?? [], request.partnershipScope!)))
}
export const signoffK1TrackerYearHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  if (!requireAdmin(request, reply)) return; const params = parse(trackerYearParamsSchema, request.params, reply); const body = parse(signoffBodySchema, request.body, reply); if (!params || !body) return
  await run(reply, async () => reply.send(await k1TrackerRepository.signoff(params.partnershipId, params.taxYear, body.expectedRevision, body.action, body.reason, request.authUser!.userId, request.partnershipScope!)))
}
export const previewK1TrackerImportHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  if (!requireAdmin(request, reply)) return
  await admitCostWorkload({
    workloadKey: 'k1_workbook_import_preview',
    method: 'POST',
    routePattern: '/v1/k1-tracker/imports/preview',
    principal: request.authUser!.userId,
    canonicalInputs: { contentLength: request.headers['content-length'] ?? null },
    globalDailyLimit: config.abuseProtection.quotas.workbookImport.globalPerDay,
    quotas: [
      { scopeKind: 'user', scopeValue: request.authUser!.userId, limit: config.abuseProtection.quotas.workbookImport.userPerDay },
      { scopeKind: 'global', scopeValue: 'atlas', limit: config.abuseProtection.quotas.workbookImport.globalPerDay },
    ],
    leaseTtlSeconds: Math.ceil(config.abuseProtection.timeouts.workbookImportMs / 1_000),
  })
  await run(reply, async () => { const file = await request.file(); if (!file) return reply.code(400).send({ error: 'VALIDATION_ERROR', message: 'A workbook file is required.' }); if (!file.mimetype.includes('spreadsheet') && !file.filename.endsWith('.xlsx')) return reply.code(400).send({ error: 'VALIDATION_ERROR', message: 'Upload an .xlsx workbook.' }); const buffer = await file.toBuffer(); const targetField = file.fields.targetPartnershipId; const target = (Array.isArray(targetField) ? targetField[0] : targetField) as { value?: string } | undefined; return reply.send(await k1TrackerRepository.previewImport(buffer, file.filename, target?.value ?? null, request.authUser!.userId, request.partnershipScope!)) })
}
export const commitK1TrackerImportHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  if (!requireAdmin(request, reply)) return; const params = parse(trackerImportParamsSchema, request.params, reply); const body = parse(importCommitBodySchema, request.body, reply); if (!params || !body) return
  await run(reply, async () => reply.send(await k1TrackerRepository.commitImport(params.importBatchId, body.targetPartnershipId, body.decisions, request.authUser!.userId, request.partnershipScope!)))
}
