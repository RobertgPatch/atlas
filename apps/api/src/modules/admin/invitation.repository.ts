import { createHash, randomUUID } from 'node:crypto'

export interface InvitationRecord {
  id: string
  email: string
  role: 'Admin' | 'User'
  tokenHash: string
  expiresAt: Date
  status: 'Invited'
}

const invitations = new Map<string, InvitationRecord>()

const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex')

export const invitationRepository = {
  create(email: string, role: 'Admin' | 'User'): InvitationRecord {
    const token = randomUUID() + randomUUID()
    const record: InvitationRecord = {
      id: randomUUID(),
      email,
      role,
      tokenHash: hash(token),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: 'Invited',
    }
    invitations.set(record.id, record)
    return record
  },
}
