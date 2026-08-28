import type { FastifyInstance } from 'fastify'
import {
  defaultRouteProtectionPolicy,
  type HttpMethod,
} from '../abuse-protection/index.js'
import { loginHandler } from './login.handler.js'
import { mfaEnrollCompleteHandler } from './mfa-enroll-complete.handler.js'
import { mfaVerifyHandler } from './mfa-verify.handler.js'
import { getSessionHandler, logoutHandler } from './session.handler.js'
import { withSession } from './session.middleware.js'
import { requireAuthenticated } from './rbac.middleware.js'

const abuseProtection = (method: HttpMethod, routePattern: string) => ({
  abuseProtection: defaultRouteProtectionPolicy(method, routePattern),
})

export const registerAuthRoutes = async (app: FastifyInstance) => {
  app.post('/auth/login', {
    config: abuseProtection('POST', '/v1/auth/login'),
  }, loginHandler)
  app.post('/auth/mfa/enroll/complete', {
    config: abuseProtection('POST', '/v1/auth/mfa/enroll/complete'),
  }, mfaEnrollCompleteHandler)
  app.post('/auth/mfa/verify', {
    config: abuseProtection('POST', '/v1/auth/mfa/verify'),
  }, mfaVerifyHandler)

  app.get('/auth/session', {
    config: abuseProtection('GET', '/v1/auth/session'),
    preHandler: [withSession, requireAuthenticated],
  }, getSessionHandler)
  app.post('/auth/session/extend', {
    config: abuseProtection('POST', '/v1/auth/session/extend'),
    preHandler: [withSession, requireAuthenticated],
  }, getSessionHandler)
  app.post('/auth/logout', {
    config: abuseProtection('POST', '/v1/auth/logout'),
    preHandler: [withSession],
  }, logoutHandler)
}
