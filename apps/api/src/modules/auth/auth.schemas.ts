import { z } from 'zod'
import { config } from '../../config.js'

export const loginSchema = z.object({
  email: z.string().email().max(config.abuseProtection.payloadLimits.maximumEmailCharacters),
  password: z.string().min(8).max(config.abuseProtection.payloadLimits.maximumPasswordCharacters),
})

export const mfaVerifySchema = z.object({
  challengeId: z.string().uuid(),
  code: z.string().max(config.abuseProtection.payloadLimits.maximumMfaCodeCharacters).regex(/^[0-9]{6}$/),
})

export const mfaEnrollmentCompleteSchema = z.object({
  enrollmentToken: z.string().uuid(),
  code: z.string().max(config.abuseProtection.payloadLimits.maximumMfaCodeCharacters).regex(/^[0-9]{6}$/),
})

export const passwordChangeSchema = z.object({
  changeToken: z.string().min(40).max(128).regex(/^[A-Za-z0-9_-]+$/),
  newPassword: z.string()
    .min(1)
    .max(config.passwordPolicy.maximumCharacters),
})

export const authErrorResponse = { error: 'SIGN_IN_FAILED' as const }
