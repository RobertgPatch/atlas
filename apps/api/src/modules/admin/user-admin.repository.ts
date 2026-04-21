import { authRepository } from '../auth/auth.repository.js'

export const userAdminRepository = {
  listUsers() {
    return authRepository.listUsers()
  },

  updateRole(userId: string, role: 'Admin' | 'User') {
    const user = authRepository.updateUserRole(userId, role)
    if (!user) return undefined
    authRepository.revokeAllUserSessions(userId, 'role-change')
    return user
  },

  deactivate(userId: string) {
    const user = authRepository.updateUserStatus(userId, 'Inactive')
    if (!user) return undefined
    authRepository.revokeAllUserSessions(userId, 'deactivated')
    return user
  },

  reactivate(userId: string) {
    const user = authRepository.updateUserStatus(userId, 'Active')
    if (!user) return undefined
    return user
  },

  resetMfa(userId: string) {
    const user = authRepository.resetUserMfa(userId)
    if (!user) return undefined
    authRepository.revokeAllUserSessions(userId, 'mfa-reset')
    return user
  },
}
