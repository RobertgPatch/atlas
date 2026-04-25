import { randomUUID } from 'node:crypto'
import type {
  CapitalActivityEvent,
  CreateCapitalActivityEventRequest,
  CreatePartnershipCommitmentRequest,
  PartnershipCommitment,
  UpdateCapitalActivityEventRequest,
  UpdatePartnershipCommitmentRequest,
} from '../../../../../packages/types/src/partnership-management.js'

interface InMemoryCommitmentRecord extends PartnershipCommitment {}
interface InMemoryCapitalActivityRecord extends CapitalActivityEvent {}

const commitmentStore = new Map<string, InMemoryCommitmentRecord[]>()
const capitalActivityStore = new Map<string, InMemoryCapitalActivityRecord[]>()

function sortCommitmentsDesc(left: InMemoryCommitmentRecord, right: InMemoryCommitmentRecord): number {
  return (
    right.createdAt.localeCompare(left.createdAt) ||
    right.updatedAt.localeCompare(left.updatedAt) ||
    right.id.localeCompare(left.id)
  )
}

function sortActivityDesc(left: InMemoryCapitalActivityRecord, right: InMemoryCapitalActivityRecord): number {
  return (
    right.activityDate.localeCompare(left.activityDate) ||
    right.createdAt.localeCompare(left.createdAt) ||
    right.id.localeCompare(left.id)
  )
}

function ensureCommitments(partnershipId: string): InMemoryCommitmentRecord[] {
  const existing = commitmentStore.get(partnershipId)
  if (existing) return existing
  const seeded: InMemoryCommitmentRecord[] = []
  commitmentStore.set(partnershipId, seeded)
  return seeded
}

function ensureCapitalActivity(partnershipId: string): InMemoryCapitalActivityRecord[] {
  const existing = capitalActivityStore.get(partnershipId)
  if (existing) return existing
  const seeded: InMemoryCapitalActivityRecord[] = []
  capitalActivityStore.set(partnershipId, seeded)
  return seeded
}

export function listInMemoryCommitments(partnershipId: string): PartnershipCommitment[] {
  return [...(commitmentStore.get(partnershipId) ?? [])].sort(sortCommitmentsDesc)
}

export function getInMemoryCommitment(
  partnershipId: string,
  commitmentId: string,
): PartnershipCommitment | null {
  return (
    (commitmentStore.get(partnershipId) ?? []).find((item) => item.id === commitmentId) ?? null
  )
}

export function getInMemoryActiveCommitment(partnershipId: string): PartnershipCommitment | null {
  const rows = listInMemoryCommitments(partnershipId)
  return rows.find((row) => row.status === 'ACTIVE') ?? null
}

export function createInMemoryCommitment(args: {
  partnershipId: string
  entityId: string
  actorUserId: string
  actorEmail: string | null
  body: CreatePartnershipCommitmentRequest
}): PartnershipCommitment {
  const now = new Date().toISOString()
  const rows = ensureCommitments(args.partnershipId)

  if ((args.body.status ?? 'ACTIVE') === 'ACTIVE') {
    for (const existing of rows) {
      if (existing.status === 'ACTIVE') {
        existing.status = 'INACTIVE'
        existing.updatedAt = now
      }
    }
  }

  const created: InMemoryCommitmentRecord = {
    id: randomUUID(),
    entityId: args.entityId,
    partnershipId: args.partnershipId,
    commitmentAmountUsd: args.body.commitmentAmountUsd,
    commitmentDate: args.body.commitmentDate ?? null,
    commitmentStartDate: args.body.commitmentStartDate ?? null,
    commitmentEndDate: args.body.commitmentEndDate ?? null,
    status: args.body.status ?? 'ACTIVE',
    sourceType: args.body.sourceType ?? 'manual',
    notes: args.body.notes ?? null,
    createdByUserId: args.actorUserId,
    createdByEmail: args.actorEmail,
    createdAt: now,
    updatedAt: now,
  }

  rows.push(created)
  commitmentStore.set(args.partnershipId, rows)
  return created
}

export function updateInMemoryCommitment(args: {
  partnershipId: string
  commitmentId: string
  patch: UpdatePartnershipCommitmentRequest
}): PartnershipCommitment | null {
  const rows = ensureCommitments(args.partnershipId)
  const row = rows.find((item) => item.id === args.commitmentId)
  if (!row) return null

  const nextStatus = args.patch.status ?? row.status
  const now = new Date().toISOString()

  if (nextStatus === 'ACTIVE') {
    for (const existing of rows) {
      if (existing.id !== row.id && existing.status === 'ACTIVE') {
        existing.status = 'INACTIVE'
        existing.updatedAt = now
      }
    }
  }

  if (args.patch.commitmentAmountUsd !== undefined) row.commitmentAmountUsd = args.patch.commitmentAmountUsd
  if ('commitmentDate' in args.patch) row.commitmentDate = args.patch.commitmentDate ?? null
  if ('commitmentStartDate' in args.patch) row.commitmentStartDate = args.patch.commitmentStartDate ?? null
  if ('commitmentEndDate' in args.patch) row.commitmentEndDate = args.patch.commitmentEndDate ?? null
  if (args.patch.status !== undefined) row.status = args.patch.status
  if (args.patch.sourceType !== undefined) row.sourceType = args.patch.sourceType
  if ('notes' in args.patch) row.notes = args.patch.notes ?? null
  row.updatedAt = now

  return row
}

export function listInMemoryCapitalActivity(partnershipId: string): CapitalActivityEvent[] {
  return [...(capitalActivityStore.get(partnershipId) ?? [])].sort(sortActivityDesc)
}

export function getInMemoryCapitalActivityEvent(
  partnershipId: string,
  eventId: string,
): CapitalActivityEvent | null {
  return (
    (capitalActivityStore.get(partnershipId) ?? []).find((item) => item.id === eventId) ?? null
  )
}

export function createInMemoryCapitalActivity(args: {
  partnershipId: string
  entityId: string
  actorUserId: string
  actorEmail: string | null
  body: CreateCapitalActivityEventRequest
}): CapitalActivityEvent {
  const rows = ensureCapitalActivity(args.partnershipId)
  const now = new Date().toISOString()
  const created: InMemoryCapitalActivityRecord = {
    id: randomUUID(),
    entityId: args.entityId,
    partnershipId: args.partnershipId,
    activityDate: args.body.activityDate,
    eventType: args.body.eventType,
    amountUsd: args.body.amountUsd,
    sourceType: args.body.sourceType ?? 'manual',
    notes: args.body.notes ?? null,
    createdByUserId: args.actorUserId,
    createdByEmail: args.actorEmail,
    createdAt: now,
    updatedAt: now,
  }
  rows.push(created)
  capitalActivityStore.set(args.partnershipId, rows)
  return created
}

export function updateInMemoryCapitalActivity(args: {
  partnershipId: string
  eventId: string
  patch: UpdateCapitalActivityEventRequest
}): CapitalActivityEvent | null {
  const rows = ensureCapitalActivity(args.partnershipId)
  const row = rows.find((item) => item.id === args.eventId)
  if (!row) return null

  if (args.patch.activityDate !== undefined) row.activityDate = args.patch.activityDate
  if (args.patch.eventType !== undefined) row.eventType = args.patch.eventType
  if (args.patch.amountUsd !== undefined) row.amountUsd = args.patch.amountUsd
  if (args.patch.sourceType !== undefined) row.sourceType = args.patch.sourceType
  if ('notes' in args.patch) row.notes = args.patch.notes ?? null
  row.updatedAt = new Date().toISOString()

  return row
}

export function listInMemorySourceYears(partnershipId: string): Set<number> {
  const years = new Set<number>()
  for (const commitment of listInMemoryCommitments(partnershipId)) {
    const date = commitment.commitmentDate ?? commitment.commitmentStartDate ?? commitment.commitmentEndDate
    if (date) years.add(Number(date.slice(0, 4)))
  }
  for (const event of listInMemoryCapitalActivity(partnershipId)) {
    years.add(Number(event.activityDate.slice(0, 4)))
  }
  return years
}

export function resetInMemoryCapitalStore(): void {
  commitmentStore.clear()
  capitalActivityStore.clear()
}
