import 'fastify'

import type { SessionRecord } from '../modules/auth/auth.repository.js'
import type { ValidatedSubjectContext } from '../modules/abuse-protection/subjectContext.js'

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: {
      userId: string
      role: 'Admin' | 'User'
      email: string
      displayName: string
      accessLevel: 'SuperAdmin' | 'Admin' | 'User'
      status: 'Invited' | 'Active' | 'Inactive'
    }
    authSession?: SessionRecord
    abuseProtectionSubjectContext?: ValidatedSubjectContext
  }
}
