import type { FastifyReply, FastifyRequest } from 'fastify'
import { config } from '../../config.js'

// Cookie plugin secrets are registered once while the application is built.
// Capture the matching decision once as well so later diagnostic-test config
// mutations cannot make readers expect signatures the plugin cannot verify.
const signingEnabled = Boolean(config.sessionSecret)

const cookieOptions = () => ({
  httpOnly: true,
  secure: config.sessionCookieSecure,
  sameSite: config.sessionCookieSameSite,
  path: '/',
  maxAge: config.sessionAbsoluteTimeoutSeconds,
  signed: signingEnabled,
})

export const readSessionToken = (request: FastifyRequest): string | undefined => {
  const cookie = request.cookies[config.sessionCookieName]
  if (!cookie) return undefined
  if (!signingEnabled) return cookie

  const unsigned = request.unsignCookie(cookie)
  return unsigned.valid ? unsigned.value : undefined
}

export const setSessionCookie = (reply: FastifyReply, token: string): void => {
  reply.setCookie(config.sessionCookieName, token, cookieOptions())
}

export const clearSessionCookie = (reply: FastifyReply): void => {
  reply.clearCookie(config.sessionCookieName, {
    path: '/',
    secure: config.sessionCookieSecure,
    sameSite: config.sessionCookieSameSite,
  })
}
