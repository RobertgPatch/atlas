import 'fastify'

import type { SessionRecord } from '../modules/auth/auth.repository.js'

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: {
      userId: string
      role: 'Admin' | 'User'
      email: string
      status: 'Invited' | 'Active' | 'Inactive'
    }
    authSession?: SessionRecord
  }
}
