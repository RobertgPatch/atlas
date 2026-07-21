import type { FastifyReply, FastifyRequest } from 'fastify'
import { ZodError, type ZodType, type ZodTypeDef } from 'zod'
import { K1TrackerError } from '../k1-tracker/k1-tracker.types.js'
import { partnershipTrackerRepository } from './partnership-tracker.repository.js'
import { PartnershipTrackerError } from './partnership-tracker.types.js'
import {
  calculateManualYearBodySchema,
  commitmentListQuerySchema,
  managementFeeQuerySchema,
  createCommitmentBodySchema,
  createPartnershipCashFlowBodySchema,
  createPartnershipCashFlowsBodySchema,
  createManualYearBodySchema,
  createNavBodySchema,
  createTrackedPartnershipBodySchema,
  deleteManualYearQuerySchema,
  expectedUpdatedAtQuerySchema,
  partnershipTrackerCommitmentParamsSchema,
  partnershipTrackerCashFlowParamsSchema,
  partnershipAggregationQuerySchema,
  partnershipTrackerListQuerySchema,
  partnershipTrackerNavParamsSchema,
  partnershipTrackerPartnershipParamsSchema,
  partnershipTrackerSignoffBodySchema,
  partnershipTrackerYearParamsSchema,
  updateCommitmentBodySchema,
  updateManualYearBodySchema,
  updateNavBodySchema,
  updateTrackedPartnershipBodySchema,
} from './partnership-tracker.zod.js'

const parse = <T>(schema: ZodType<T, ZodTypeDef, unknown>, value: unknown, reply: FastifyReply): T | null => {
  try { return schema.parse(value) } catch (error) {
    if (error instanceof ZodError) {
      void reply.code(400).send({ error: 'VALIDATION_ERROR', message: 'Request validation failed.', details: error.issues })
      return null
    }
    throw error
  }
}
const requireAdmin = (request: FastifyRequest, reply: FastifyReply) => {
  if (request.authUser?.role === 'Admin') return true
  void reply.code(403).send({ error: 'FORBIDDEN', message: 'Admin access is required.' })
  return false
}
const statusForK1Error = (code: string) => {
  if (code === 'DATABASE_REQUIRED') return 503
  if (code === 'TRACKER_NOT_FOUND') return 404
  if (code === 'FORBIDDEN_TRACKER_ENTITY') return 403
  if (code === 'STALE_TRACKER_REVISION' || code === 'SOURCE_CONFLICT') return 409
  return 400
}
const run = async (reply: FastifyReply, operation: () => Promise<unknown>) => {
  try { return await operation() } catch (error) {
    if (error instanceof PartnershipTrackerError) {
      return reply.code(error.statusCode).send({ error: error.code, message: error.message, details: error.details })
    }
    if (error instanceof K1TrackerError) {
      return reply.code(statusForK1Error(error.code)).send({ error: error.code, message: error.message })
    }
    throw error
  }
}

export const listPartnershipTrackerHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const query = parse(partnershipTrackerListQuerySchema, request.query, reply); if (!query) return
  return run(reply, async () => reply.send(await partnershipTrackerRepository.listPartnerships(request.partnershipScope!, { ...query, limit: query.limit ?? 50 })))
}
export const getPartnershipAggregationHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const query = parse(partnershipAggregationQuerySchema, request.query, reply); if (!query) return
  return run(reply, async () => reply.send(await partnershipTrackerRepository.getAggregation(request.partnershipScope!, query)))
}
export const getPartnershipTrackerHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const params = parse(partnershipTrackerPartnershipParamsSchema, request.params, reply); if (!params) return
  return run(reply, async () => reply.send(await partnershipTrackerRepository.getPartnership(params.partnershipId, request.partnershipScope!)))
}
export const getManagementFeesHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const params = parse(partnershipTrackerPartnershipParamsSchema, request.params, reply)
  const query = parse(managementFeeQuerySchema, request.query, reply); if (!params || !query) return
  return run(reply, async () => reply.send(await partnershipTrackerRepository.getManagementFees(params.partnershipId, request.partnershipScope!, query.asOfDate)))
}
export const createPartnershipTrackerHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  if (!requireAdmin(request, reply)) return
  const body = parse(createTrackedPartnershipBodySchema, request.body, reply); if (!body) return
  return run(reply, async () => reply.code(201).send(await partnershipTrackerRepository.createPartnership(body, request.authUser!.userId, request.partnershipScope!)))
}
export const updatePartnershipTrackerHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  if (!requireAdmin(request, reply)) return
  const params = parse(partnershipTrackerPartnershipParamsSchema, request.params, reply)
  const body = parse(updateTrackedPartnershipBodySchema, request.body, reply); if (!params || !body) return
  return run(reply, async () => reply.send(await partnershipTrackerRepository.updatePartnership(params.partnershipId, body, request.authUser!.userId, request.partnershipScope!)))
}

export const listCommitmentsHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const params = parse(partnershipTrackerPartnershipParamsSchema, request.params, reply)
  const query = parse(commitmentListQuerySchema, request.query, reply); if (!params || !query) return
  return run(reply, async () => reply.send(await partnershipTrackerRepository.listCommitments(params.partnershipId, request.partnershipScope!, query.asOfDate)))
}
export const createCommitmentHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  if (!requireAdmin(request, reply)) return
  const params = parse(partnershipTrackerPartnershipParamsSchema, request.params, reply)
  const body = parse(createCommitmentBodySchema, request.body, reply); if (!params || !body) return
  return run(reply, async () => reply.code(201).send(await partnershipTrackerRepository.createCommitment(params.partnershipId, body, request.authUser!.userId, request.partnershipScope!)))
}
export const updateCommitmentHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  if (!requireAdmin(request, reply)) return
  const params = parse(partnershipTrackerCommitmentParamsSchema, request.params, reply)
  const body = parse(updateCommitmentBodySchema, request.body, reply); if (!params || !body) return
  return run(reply, async () => reply.send(await partnershipTrackerRepository.updateCommitment(params.partnershipId, params.commitmentId, body, request.authUser!.userId, request.partnershipScope!)))
}
export const deleteCommitmentHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  if (!requireAdmin(request, reply)) return
  const params = parse(partnershipTrackerCommitmentParamsSchema, request.params, reply)
  const query = parse(expectedUpdatedAtQuerySchema, request.query, reply); if (!params || !query) return
  return run(reply, async () => { await partnershipTrackerRepository.deleteCommitment(params.partnershipId, params.commitmentId, query.expectedUpdatedAt, request.authUser!.userId, request.partnershipScope!); return reply.code(204).send() })
}

export const listNavHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const params = parse(partnershipTrackerPartnershipParamsSchema, request.params, reply); if (!params) return
  return run(reply, async () => reply.send(await partnershipTrackerRepository.listNav(params.partnershipId, request.partnershipScope!)))
}
export const createNavHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  if (!requireAdmin(request, reply)) return
  const params = parse(partnershipTrackerPartnershipParamsSchema, request.params, reply)
  const body = parse(createNavBodySchema, request.body, reply); if (!params || !body) return
  return run(reply, async () => reply.code(201).send(await partnershipTrackerRepository.createNav(params.partnershipId, body, request.authUser!.userId, request.partnershipScope!)))
}
export const updateNavHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  if (!requireAdmin(request, reply)) return
  const params = parse(partnershipTrackerNavParamsSchema, request.params, reply)
  const body = parse(updateNavBodySchema, request.body, reply); if (!params || !body) return
  return run(reply, async () => reply.send(await partnershipTrackerRepository.updateNav(params.partnershipId, params.navEntryId, body, request.authUser!.userId, request.partnershipScope!)))
}
export const deleteNavHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  if (!requireAdmin(request, reply)) return
  const params = parse(partnershipTrackerNavParamsSchema, request.params, reply)
  const query = parse(expectedUpdatedAtQuerySchema, request.query, reply); if (!params || !query) return
  return run(reply, async () => { await partnershipTrackerRepository.deleteNav(params.partnershipId, params.navEntryId, query.expectedUpdatedAt, request.authUser!.userId, request.partnershipScope!); return reply.code(204).send() })
}

export const getManualYearHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const params = parse(partnershipTrackerYearParamsSchema, request.params, reply); if (!params) return
  return run(reply, async () => reply.send(await partnershipTrackerRepository.getYear(params.partnershipId, params.taxYear, request.partnershipScope!)))
}
export const createManualYearHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  if (!requireAdmin(request, reply)) return
  const params = parse(partnershipTrackerPartnershipParamsSchema, request.params, reply)
  const body = parse(createManualYearBodySchema, request.body, reply); if (!params || !body) return
  return run(reply, async () => reply.code(201).send(await partnershipTrackerRepository.createYear(params.partnershipId, body.taxYear, request.authUser!.userId, request.partnershipScope!)))
}
export const updateManualYearHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  if (!requireAdmin(request, reply)) return
  const params = parse(partnershipTrackerYearParamsSchema, request.params, reply)
  const body = parse(updateManualYearBodySchema, request.body, reply); if (!params || !body) return
  return run(reply, async () => {
    const result = await partnershipTrackerRepository.updateYear(params.partnershipId, params.taxYear, body.expectedRevision, body.changes, request.authUser!.userId, request.partnershipScope!, body.officialFormData)
    return reply.send(result.year)
  })
}
export const calculateManualYearHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const params = parse(partnershipTrackerYearParamsSchema, request.params, reply)
  const body = parse(calculateManualYearBodySchema, request.body, reply); if (!params || !body) return
  return run(reply, async () => reply.send(await partnershipTrackerRepository.calculateYear(params.partnershipId, params.taxYear, body.expectedRevision, body.changes ?? [], request.partnershipScope!)))
}
export const createPartnershipCashFlowHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  if (!requireAdmin(request, reply)) return
  const params = parse(partnershipTrackerYearParamsSchema, request.params, reply)
  const body = parse(createPartnershipCashFlowBodySchema, request.body, reply); if (!params || !body) return
  return run(reply, async () => reply.code(201).send(await partnershipTrackerRepository.createCashFlow(params.partnershipId, params.taxYear, body, request.authUser!.userId, request.partnershipScope!)))
}
export const createPartnershipCashFlowsHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  if (!requireAdmin(request, reply)) return
  const params = parse(partnershipTrackerYearParamsSchema, request.params, reply)
  const body = parse(createPartnershipCashFlowsBodySchema, request.body, reply); if (!params || !body) return
  return run(reply, async () => reply.code(201).send(await partnershipTrackerRepository.createCashFlows(params.partnershipId, params.taxYear, body.entries, request.authUser!.userId, request.partnershipScope!)))
}
export const deletePartnershipCashFlowHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  if (!requireAdmin(request, reply)) return
  const params = parse(partnershipTrackerCashFlowParamsSchema, request.params, reply)
  const query = parse(expectedUpdatedAtQuerySchema, request.query, reply); if (!params || !query) return
  return run(reply, async () => {
    await partnershipTrackerRepository.deleteCashFlow(params.partnershipId, params.taxYear, params.cashFlowId, query.expectedUpdatedAt, request.authUser!.userId, request.partnershipScope!)
    return reply.code(204).send()
  })
}
export const deleteManualYearHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  if (!requireAdmin(request, reply)) return
  const params = parse(partnershipTrackerYearParamsSchema, request.params, reply)
  const query = parse(deleteManualYearQuerySchema, request.query, reply); if (!params || !query) return
  return run(reply, async () => { await partnershipTrackerRepository.deleteYear(params.partnershipId, params.taxYear, query.expectedRevision, request.authUser!.userId, request.partnershipScope!); return reply.code(204).send() })
}
export const signoffManualYearHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  if (!requireAdmin(request, reply)) return
  const params = parse(partnershipTrackerYearParamsSchema, request.params, reply)
  const body = parse(partnershipTrackerSignoffBodySchema, request.body, reply); if (!params || !body) return
  return run(reply, async () => reply.send(await partnershipTrackerRepository.signoff(params.partnershipId, params.taxYear, body.expectedRevision, body.action, body.reason, request.authUser!.userId, request.partnershipScope!)))
}
