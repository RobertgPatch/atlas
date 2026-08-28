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

export const inviteSchema = z.object({
  email: z.string().email().max(config.abuseProtection.payloadLimits.maximumEmailCharacters),
  role: z.enum(['Admin', 'User']),
})

export const roleChangeSchema = z.object({
  role: z.enum(['Admin', 'User']),
})

export const authErrorResponse = { error: 'SIGN_IN_FAILED' as const }
