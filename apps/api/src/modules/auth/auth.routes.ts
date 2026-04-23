import type { FastifyInstance } from 'fastify'
import { loginHandler } from './login.handler.js'
import { mfaEnrollCompleteHandler } from './mfa-enroll-complete.handler.js'
import { mfaVerifyHandler } from './mfa-verify.handler.js'
import { getSessionHandler, logoutHandler } from './session.handler.js'
import { withSession } from './session.middleware.js'
import { requireAuthenticated } from './rbac.middleware.js'

export const registerAuthRoutes = async (app: FastifyInstance) => {
  app.post('/auth/login', loginHandler)
  app.post('/auth/mfa/enroll/complete', mfaEnrollCompleteHandler)
  app.post('/auth/mfa/verify', mfaVerifyHandler)

  app.get('/auth/session', { preHandler: [withSession, requireAuthenticated] }, getSessionHandler)
  app.post('/auth/logout', { preHandler: [withSession] }, logoutHandler)
}
