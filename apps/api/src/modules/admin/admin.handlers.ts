import type { FastifyReply, FastifyRequest } from 'fastify'
import { inviteSchema, roleChangeSchema } from '../auth/auth.schemas.js'
import { userAdminRepository } from './user-admin.repository.js'
import { invitationRepository } from './invitation.repository.js'
import { authRepository } from '../auth/auth.repository.js'
import { auditRepository } from '../audit/audit.repository.js'

const asSummary = (user: ReturnType<typeof authRepository.getUserById>) => {
  if (!user) return null
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    status: user.status,
  }
}

export const listUsersHandler = async (
  _request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  const users = userAdminRepository.listUsers().map((user) => asSummary(user))
  reply.send({ items: users })
}

export const inviteUserHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  const payload = inviteSchema.safeParse(request.body)
  if (!payload.success) {
    reply.status(400).send({ error: 'INVALID_REQUEST' })
    return
  }

  const invite = invitationRepository.create(payload.data.email, payload.data.role)
  const invitedUser = authRepository.upsertInvitedUser(payload.data.email, payload.data.role)

  await auditRepository.record({
    actorUserId: request.authUser?.userId,
    eventName: 'user.invited',
    objectType: 'user',
    objectId: invitedUser.id,
    after: {
      email: invitedUser.email,
      role: invitedUser.role,
      status: invitedUser.status,
      invitationId: invite.id,
    },
  })

  reply.status(201).send({
    id: invite.id,
    email: invite.email,
    role: invite.role,
    expiresAt: invite.expiresAt.toISOString(),
    status: invite.status,
  })
}

export const changeRoleHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  const { userId } = request.params as { userId: string }
  const payload = roleChangeSchema.safeParse(request.body)
  if (!payload.success) {
    reply.status(400).send({ error: 'INVALID_REQUEST' })
    return
  }

  const before = authRepository.getUserById(userId)
  const updated = userAdminRepository.updateRole(userId, payload.data.role)
  if (!updated) {
    reply.status(404).send({ error: 'NOT_FOUND' })
    return
  }

  await auditRepository.record({
    actorUserId: request.authUser?.userId,
    eventName: 'user.role_changed',
    objectType: 'user',
    objectId: updated.id,
    before,
    after: updated,
  })

  reply.send(asSummary(updated))
}

export const deactivateUserHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  const { userId } = request.params as { userId: string }
  const before = authRepository.getUserById(userId)
  const updated = userAdminRepository.deactivate(userId)
  if (!updated) {
    reply.status(404).send({ error: 'NOT_FOUND' })
    return
  }

  await auditRepository.record({
    actorUserId: request.authUser?.userId,
    eventName: 'user.deactivated',
    objectType: 'user',
    objectId: updated.id,
    before,
    after: updated,
  })

  reply.send(asSummary(updated))
}

export const reactivateUserHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  const { userId } = request.params as { userId: string }
  const before = authRepository.getUserById(userId)
  const updated = userAdminRepository.reactivate(userId)
  if (!updated) {
    reply.status(404).send({ error: 'NOT_FOUND' })
    return
  }

  await auditRepository.record({
    actorUserId: request.authUser?.userId,
    eventName: 'user.reactivated',
    objectType: 'user',
    objectId: updated.id,
    before,
    after: updated,
  })

  reply.send(asSummary(updated))
}

export const resetMfaHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  const { userId } = request.params as { userId: string }
  const before = authRepository.getUserById(userId)
  const updated = userAdminRepository.resetMfa(userId)
  if (!updated) {
    reply.status(404).send({ error: 'NOT_FOUND' })
    return
  }

  await auditRepository.record({
    actorUserId: request.authUser?.userId,
    eventName: 'user.mfa_reset',
    objectType: 'user',
    objectId: updated.id,
    before,
    after: updated,
  })

  reply.send(asSummary(updated))
}
