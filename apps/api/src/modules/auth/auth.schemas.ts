import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})

export const mfaVerifySchema = z.object({
  challengeId: z.string().uuid(),
  code: z.string().regex(/^[0-9]{6}$/),
})

export const mfaEnrollmentCompleteSchema = z.object({
  enrollmentToken: z.string().uuid(),
  code: z.string().regex(/^[0-9]{6}$/),
})

export const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['Admin', 'User']),
})

export const roleChangeSchema = z.object({
  role: z.enum(['Admin', 'User']),
})

export const authErrorResponse = { error: 'SIGN_IN_FAILED' as const }
