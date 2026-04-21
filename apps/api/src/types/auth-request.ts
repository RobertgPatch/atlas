import 'fastify'

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: {
      userId: string
      role: 'Admin' | 'User'
      email: string
      status: 'Invited' | 'Active' | 'Inactive'
    }
  }
}
