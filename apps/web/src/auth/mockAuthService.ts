/**
 * MOCK AUTH SERVICE — replace this file with real API calls when backend auth is ready.
 *
 * To swap: delete this file and create a real `authService.ts` with the same
 * exported interface. Nothing outside this file knows credentials are hardcoded.
 */

import type { SessionResponse } from './authClient'

// ─── Types ────────────────────────────────────────────────────────────────────

export class AuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthError'
  }
}

// ─── Mock credentials ─────────────────────────────────────────────────────────

const MOCK_EMAIL = 'test@atlas.com'
const MOCK_PASSWORD = 'Password123!'
const MOCK_OTP = '123456'
const MOCK_DELAY_MS = 600

// ─── Public interface ─────────────────────────────────────────────────────────

export async function signIn(
  email: string,
  password: string,
): Promise<{ challengeId: string }> {
  await new Promise((r) => setTimeout(r, MOCK_DELAY_MS))
  if (email.trim().toLowerCase() !== MOCK_EMAIL || password !== MOCK_PASSWORD) {
    throw new AuthError('Invalid email or password. Please try again.')
  }
  return { challengeId: 'mock-challenge' }
}

export async function verifyMfa(
  _challengeId: string,
  code: string,
): Promise<SessionResponse> {
  await new Promise((r) => setTimeout(r, MOCK_DELAY_MS))
  if (code !== MOCK_OTP) {
    throw new AuthError('Invalid verification code. Please try again.')
  }
  const now = new Date().toISOString()
  return {
    user: {
      id: 'mock-user-1',
      email: MOCK_EMAIL,
      role: 'Admin',
      status: 'Active',
    },
    role: 'Admin',
    session: {
      issuedAt: now,
      idleTimeoutSeconds: 900,
      absoluteTimeoutSeconds: 28800,
    },
  }
}
