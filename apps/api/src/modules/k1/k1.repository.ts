import { randomUUID } from 'node:crypto'
import { authRepository } from '../auth/auth.repository.js'
import type {
  K1DocumentSummary,
  K1Kpis,
  K1Status,
} from './k1.types.js'

// ---------------------------------------------------------------------------
// Domain records (in-memory; mirrors the Postgres shape in 002_k1_ingestion.sql)
// ---------------------------------------------------------------------------

export interface EntityRecord {
  id: string
  name: string
}

export interface PartnershipRecord {
  id: string
  name: string
  entityId: string
}

export interface DocumentRecord {
  id: string
  storagePath: string
  mimeType: string
  sizeBytes: number
  uploadedAt: Date
  uploadedBy: string
}

export interface K1DocumentRecord {
  id: string
  documentId: string
  partnershipId: string | null
  entityId: string
  taxYear: number | null
  partnershipNameRaw: string | null
  processingStatus: K1Status
  parseErrorCode: string | null
  parseErrorMessage: string | null
  parseLastAttemptAt: Date | null
  parseAttempts: number
  supersededByDocumentId: string | null
  uploaderUserId: string
  uploadedAt: Date
  // --- Feature 003 additions ---
  version: number
  approvedByUserId: string | null
  finalizedByUserId: string | null
}

export interface K1IssueRecord {
  id: string
  k1DocumentId: string
  issueType: string
  severity: 'LOW' | 'MEDIUM' | 'HIGH'
  status: 'OPEN' | 'RESOLVED'
  message: string
  // --- Feature 003 additions ---
  k1FieldValueId: string | null
  resolvedAt: Date | null
  resolvedByUserId: string | null
  createdAt: Date
}

export interface EntityMembershipRecord {
  userId: string
  entityId: string
}

export interface DocumentVersionRecord {
  id: string
  originalDocumentId: string
  supersededById: string
  partnershipId: string
  entityId: string
  taxYear: number
  supersededAt: Date
  supersededByUserId: string
}

// ---------------------------------------------------------------------------
// Stores
// ---------------------------------------------------------------------------

const entities = new Map<string, EntityRecord>()
const partnerships = new Map<string, PartnershipRecord>()
const documents = new Map<string, DocumentRecord>()
const k1Documents = new Map<string, K1DocumentRecord>()
const k1Issues = new Map<string, K1IssueRecord>()
const memberships: EntityMembershipRecord[] = []
const documentVersions = new Map<string, DocumentVersionRecord>()

// ---------------------------------------------------------------------------
// Seed — creates demo entities/partnerships and grants both seeded users
// entitlement. Every seeded admin + user from auth.repository is added to
// every entity; real provisioning is out of scope for V1 of this feature.
// ---------------------------------------------------------------------------

let seeded = false
const seed = () => {
  if (seeded) return
  seeded = true

  const makeEntity = (name: string): EntityRecord => {
    const e: EntityRecord = { id: randomUUID(), name }
    entities.set(e.id, e)
    return e
  }
  const makePartnership = (name: string, entityId: string): PartnershipRecord => {
    const p: PartnershipRecord = { id: randomUUID(), name, entityId }
    partnerships.set(p.id, p)
    return p
  }

  const trust = makeEntity('Whitfield Family Trust')
  const holdings = makeEntity('Whitfield Holdings LLC')
  const realty = makeEntity('Whitfield Realty LLC')

  makePartnership('Blackstone Capital Partners VII', trust.id)
  makePartnership('Sequoia Heritage Fund', holdings.id)
  makePartnership('KKR Americas Fund XII', trust.id)
  makePartnership('Carlyle Realty Partners IX', realty.id)
  makePartnership('Apollo Investment Fund IX', holdings.id)

  for (const user of authRepository.listUsers()) {
    for (const entity of entities.values()) {
      memberships.push({ userId: user.id, entityId: entity.id })
    }
  }

  // Demo K-1 docs — one per status so the dashboard/KPIs light up on a fresh instance.
  const firstUser = authRepository.listUsers()[0]
  if (firstUser) {
    const demos: Array<{
      partnership: string
      status: K1Status
      issues?: number
      err?: { code: string; message: string }
    }> = [
      { partnership: 'Blackstone Capital Partners VII', status: 'FINALIZED' },
      { partnership: 'Sequoia Heritage Fund', status: 'READY_FOR_APPROVAL' },
      { partnership: 'KKR Americas Fund XII', status: 'NEEDS_REVIEW', issues: 2 },
      { partnership: 'Carlyle Realty Partners IX', status: 'PROCESSING' },
      {
        partnership: 'Apollo Investment Fund IX',
        status: 'PROCESSING',
        err: {
          code: 'PARSE_LOW_CONFIDENCE',
          message: 'Low confidence on multiple fields — extraction aborted.',
        },
      },
    ]

    for (const d of demos) {
      const p = [...partnerships.values()].find((x) => x.name === d.partnership)
      if (!p) continue
      const doc: DocumentRecord = {
        id: randomUUID(),
        storagePath: `seed/${randomUUID()}.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        uploadedAt: new Date(),
        uploadedBy: firstUser.id,
      }
      documents.set(doc.id, doc)
      const k: K1DocumentRecord = {
        id: randomUUID(),
        documentId: doc.id,
        partnershipId: p.id,
        entityId: p.entityId,
        taxYear: 2024,
        partnershipNameRaw: p.name,
        processingStatus: d.status,
        parseErrorCode: d.err?.code ?? null,
        parseErrorMessage: d.err?.message ?? null,
        parseLastAttemptAt: d.err ? new Date() : null,
        parseAttempts: d.err ? 1 : 0,
        supersededByDocumentId: null,
        uploaderUserId: firstUser.id,
        uploadedAt: new Date(Date.now() - Math.random() * 1_000_000_00),
        version: 0,
        approvedByUserId: null,
        finalizedByUserId: null,
      }
      k1Documents.set(k.id, k)
      for (let i = 0; i < (d.issues ?? 0); i++) {
        const iss: K1IssueRecord = {
          id: randomUUID(),
          k1DocumentId: k.id,
          issueType: 'MISSING_FIELD',
          severity: 'MEDIUM',
          status: 'OPEN',
          message: `Seeded issue ${i + 1}`,
          k1FieldValueId: null,
          resolvedAt: null,
          resolvedByUserId: null,
          createdAt: new Date(),
        }
        k1Issues.set(iss.id, iss)
      }
    }
  }
}

/** Always create empty entity/membership skeleton so users can log in and upload K-1s. */
const seedMinimal = () => {
  if (entities.size > 0) return
  const makeEntity = (name: string): EntityRecord => {
    const e: EntityRecord = { id: randomUUID(), name }
    entities.set(e.id, e)
    return e
  }
  const trust = makeEntity('Whitfield Family Trust')
  const holdings = makeEntity('Whitfield Holdings LLC')
  const realty = makeEntity('Whitfield Realty LLC')
  for (const user of authRepository.listUsers()) {
    for (const entity of [trust, holdings, realty]) {
      memberships.push({ userId: user.id, entityId: entity.id })
    }
  }
}

// Auto-seed is opt-in only.
// - SEED_DEMO_DATA=true: full demo entities/partnerships/K-1 rows.
// - SEED_MINIMAL_DATA=true: minimal entities + memberships only.
// Default behavior: start with no entities so Admins can create their own.
if ((process.env.SEED_DEMO_DATA ?? 'false') === 'true') {
  seed()
} else if ((process.env.SEED_MINIMAL_DATA ?? 'false') === 'true') {
  seedMinimal()
}

export interface ListFilters {
  taxYear?: number
  entityId?: string
  status?: K1Status
  q?: string
  sort: 'uploaded_at' | 'partnership' | 'entity' | 'tax_year' | 'status' | 'issues'
  direction: 'asc' | 'desc'
  limit: number
  cursor?: string
}

const scopeEntityIds = (userId: string, explicit?: string): string[] => {
  const allowed = memberships
    .filter((m) => m.userId === userId)
    .map((m) => m.entityId)
  if (!explicit) return allowed
  if (!allowed.includes(explicit)) return []
  return [explicit]
}

const statusOrder: K1Status[] = [
  'UPLOADED',
  'PROCESSING',
  'NEEDS_REVIEW',
  'READY_FOR_APPROVAL',
  'FINALIZED',
]

const countOpenIssues = (k1Id: string) =>
  [...k1Issues.values()].filter(
    (i) => i.k1DocumentId === k1Id && i.status === 'OPEN',
  ).length

const toSummary = (k: K1DocumentRecord): K1DocumentSummary => {
  const partnership = k.partnershipId ? partnerships.get(k.partnershipId) : undefined
  const entity = entities.get(k.entityId)
  if (!entity) {
    throw new Error(
      `K-1 ${k.id} references missing partnership/entity`,
    )
  }
  const partnershipName = partnership?.name ?? k.partnershipNameRaw ?? null
  return {
    id: k.id,
    documentId: k.documentId,
    documentName: partnershipName ? `K-1 — ${partnershipName}` : 'K-1 — Pending partnership resolution',
    partnership: { id: partnership?.id ?? null, name: partnershipName },
    entity: { id: entity.id, name: entity.name },
    taxYear: k.taxYear,
    status: k.processingStatus,
    issuesOpenCount: countOpenIssues(k.id),
    uploadedAt: k.uploadedAt.toISOString(),
    uploaderUserId: k.uploaderUserId,
    parseError: k.parseErrorCode
      ? {
          code: k.parseErrorCode,
          message: k.parseErrorMessage ?? 'Parsing failed.',
          lastAttemptAt: (k.parseLastAttemptAt ?? k.uploadedAt).toISOString(),
        }
      : null,
    supersededByDocumentId: k.supersededByDocumentId,
  }
}

const compareSummaries = (
  a: K1DocumentSummary,
  b: K1DocumentSummary,
  sort: ListFilters['sort'],
  direction: ListFilters['direction'],
): number => {
  const dir = direction === 'asc' ? 1 : -1
  switch (sort) {
    case 'uploaded_at':
      return dir * (new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime())
    case 'partnership':
      return dir * (a.partnership.name ?? '').localeCompare(b.partnership.name ?? '')
    case 'entity':
      return dir * a.entity.name.localeCompare(b.entity.name)
    case 'tax_year':
      return dir * ((a.taxYear ?? -1) - (b.taxYear ?? -1))
    case 'status':
      return dir * (statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status))
    case 'issues':
      return dir * (a.issuesOpenCount - b.issuesOpenCount)
  }
}

export const k1Repository = {
  // --------- reads ---------

  getUserEntityIds(userId: string): string[] {
    return memberships.filter((m) => m.userId === userId).map((m) => m.entityId)
  },

  userCanAccessEntity(userId: string, entityId: string): boolean {
    return memberships.some((m) => m.userId === userId && m.entityId === entityId)
  },

  listEntities(): EntityRecord[] {
    return [...entities.values()]
  },

  /** Returns the entity IDs that userId is a member of. */
  listEntitiesForUser(userId: string): string[] {
    return memberships.filter((m) => m.userId === userId).map((m) => m.entityId)
  },

  listPartnerships(): PartnershipRecord[] {
    return [...partnerships.values()]
  },

  getPartnership(id: string): PartnershipRecord | undefined {
    return partnerships.get(id)
  },

  findPartnershipByEntityAndName(entityId: string, name: string): PartnershipRecord | undefined {
    const needle = name.trim().toLowerCase()
    return [...partnerships.values()].find(
      (partnership) => partnership.entityId === entityId && partnership.name.trim().toLowerCase() === needle,
    )
  },

  createPartnership(args: { entityId: string; name: string }): PartnershipRecord {
    const partnership: PartnershipRecord = {
      id: randomUUID(),
      entityId: args.entityId,
      name: args.name.trim(),
    }
    partnerships.set(partnership.id, partnership)
    return partnership
  },

  /** Create a new entity. Grants membership to every existing user so the entity is visible. */
  createEntity(args: { name: string }): EntityRecord {
    const entity: EntityRecord = { id: randomUUID(), name: args.name.trim() }
    entities.set(entity.id, entity)
    for (const user of authRepository.listUsers()) {
      if (!memberships.some((m) => m.userId === user.id && m.entityId === entity.id)) {
        memberships.push({ userId: user.id, entityId: entity.id })
      }
    }
    return entity
  },

  updateEntity(id: string, patch: { name?: string }): EntityRecord | undefined {
    const e = entities.get(id)
    if (!e) return undefined
    if (patch.name !== undefined) e.name = patch.name.trim()
    entities.set(id, e)
    return e
  },

  /** Remove an entity. Caller MUST check there are no partnerships attached first. */
  deleteEntity(id: string): boolean {
    if (!entities.has(id)) return false
    entities.delete(id)
    // Drop memberships for the removed entity.
    for (let i = memberships.length - 1; i >= 0; i--) {
      if (memberships[i].entityId === id) memberships.splice(i, 1)
    }
    return true
  },

  countPartnershipsForEntity(entityId: string): number {
    let n = 0
    for (const p of partnerships.values()) if (p.entityId === entityId) n++
    return n
  },

  /** List all non-superseded K-1 documents for a partnership (unscoped — caller enforces scope). */
  listK1sForPartnership(partnershipId: string): K1DocumentRecord[] {
    return [...k1Documents.values()].filter(
      (k) => !k.supersededByDocumentId && k.partnershipId === partnershipId,
    )
  },

  getK1Document(id: string): K1DocumentRecord | undefined {
    return k1Documents.get(id)
  },

  /** Returns the storage-relative path of the PDF for a given K-1 document. */
  getDocumentStoragePath(k1DocumentId: string): string | undefined {
    const k1 = k1Documents.get(k1DocumentId)
    if (!k1) return undefined
    return documents.get(k1.documentId)?.storagePath
  },

  getK1Summary(userId: string, id: string): K1DocumentSummary | undefined {
    const k = k1Documents.get(id)
    if (!k || k.supersededByDocumentId) return undefined
    if (!this.userCanAccessEntity(userId, k.entityId)) return undefined
    return toSummary(k)
  },

  listK1s(
    userId: string,
    filters: ListFilters,
  ): { items: K1DocumentSummary[]; nextCursor: string | null } {
    const allowed = scopeEntityIds(userId, filters.entityId)
    if (allowed.length === 0) return { items: [], nextCursor: null }

    const q = filters.q?.trim().toLowerCase() ?? ''

    const all = [...k1Documents.values()]
      .filter((k) => !k.supersededByDocumentId)
      .filter((k) => allowed.includes(k.entityId))
      // Always show docs whose tax year hasn't been resolved yet (null) so they
      // remain visible immediately after upload until async parse fills it in.
      .filter((k) => !filters.taxYear || k.taxYear === filters.taxYear || k.taxYear === null)
      .filter((k) => !filters.status || k.processingStatus === filters.status)
      .map(toSummary)
      .filter((s) =>
        !q ||
        s.documentName.toLowerCase().includes(q) ||
        (s.partnership.name ?? '').toLowerCase().includes(q),
      )
      .sort((a, b) => compareSummaries(a, b, filters.sort, filters.direction))

    let startIdx = 0
    if (filters.cursor) {
      const decoded = Number.parseInt(
        Buffer.from(filters.cursor, 'base64').toString('utf8'),
        10,
      )
      if (Number.isFinite(decoded)) startIdx = decoded
    }

    const slice = all.slice(startIdx, startIdx + filters.limit)
    const nextIdx = startIdx + filters.limit
    const nextCursor =
      nextIdx < all.length
        ? Buffer.from(String(nextIdx), 'utf8').toString('base64')
        : null

    return { items: slice, nextCursor }
  },

  getKpis(
    userId: string,
    scope: { taxYear?: number; entityId?: string },
  ): K1Kpis {
    const allowed = scopeEntityIds(userId, scope.entityId)
    const counts: Record<K1Status, number> = {
      UPLOADED: 0,
      PROCESSING: 0,
      NEEDS_REVIEW: 0,
      READY_FOR_APPROVAL: 0,
      FINALIZED: 0,
    }
    let processingWithErrors = 0

    if (allowed.length !== 0) {
      for (const k of k1Documents.values()) {
        if (k.supersededByDocumentId) continue
        if (!allowed.includes(k.entityId)) continue
        // Pending docs (taxYear === null) count toward all year scopes so the
        // KPI tiles update immediately after upload.
        if (scope.taxYear && k.taxYear !== null && k.taxYear !== scope.taxYear) continue
        counts[k.processingStatus] += 1
        if (k.processingStatus === 'PROCESSING' && k.parseErrorCode) {
          processingWithErrors += 1
        }
      }
    }

    return {
      scope: {
        taxYear: scope.taxYear ?? null,
        entityId: scope.entityId ?? null,
      },
      counts,
      processingWithErrors,
    }
  },

  findDuplicate(
    partnershipId: string,
    entityId: string,
    taxYear: number,
    excludeK1DocumentId?: string,
  ): K1DocumentRecord | undefined {
    return [...k1Documents.values()].find(
      (k) =>
        !k.supersededByDocumentId &&
        k.id !== excludeK1DocumentId &&
        k.partnershipId === partnershipId &&
        k.entityId === entityId &&
        k.taxYear === taxYear,
    )
  },

  // --------- writes ---------

  insertUpload(args: {
    uploaderUserId: string
    entityId: string
    storagePath: string
    mimeType: string
    sizeBytes: number
  }): { document: DocumentRecord; k1: K1DocumentRecord } {
    const now = new Date()
    const document: DocumentRecord = {
      id: randomUUID(),
      storagePath: args.storagePath,
      mimeType: args.mimeType,
      sizeBytes: args.sizeBytes,
      uploadedAt: now,
      uploadedBy: args.uploaderUserId,
    }
    documents.set(document.id, document)

    const k1: K1DocumentRecord = {
      id: randomUUID(),
      documentId: document.id,
      partnershipId: null,
      entityId: args.entityId,
      taxYear: null,
      partnershipNameRaw: null,
      processingStatus: 'UPLOADED',
      parseErrorCode: null,
      parseErrorMessage: null,
      parseLastAttemptAt: null,
      parseAttempts: 0,
      supersededByDocumentId: null,
      uploaderUserId: args.uploaderUserId,
      uploadedAt: now,
      version: 0,
      approvedByUserId: null,
      finalizedByUserId: null,
    }
    k1Documents.set(k1.id, k1)
    return { document, k1 }
  },

  resolveUploadMetadata(args: {
    k1DocumentId: string
    partnershipId: string
    partnershipNameRaw: string
    taxYear: number
  }): K1DocumentRecord | undefined {
    const k1 = k1Documents.get(args.k1DocumentId)
    if (!k1) return undefined
    const next: K1DocumentRecord = {
      ...k1,
      partnershipId: args.partnershipId,
      partnershipNameRaw: args.partnershipNameRaw,
      taxYear: args.taxYear,
    }
    k1Documents.set(next.id, next)
    return next
  },

  supersede(args: {
    existing: K1DocumentRecord
    newDocumentId: string
    supersededByUserId: string
  }): DocumentVersionRecord {
    args.existing.supersededByDocumentId = args.newDocumentId
    k1Documents.set(args.existing.id, args.existing)

    const version: DocumentVersionRecord = {
      id: randomUUID(),
      originalDocumentId: args.existing.documentId,
      supersededById: args.newDocumentId,
      partnershipId: args.existing.partnershipId,
      entityId: args.existing.entityId,
      taxYear: args.existing.taxYear,
      supersededAt: new Date(),
      supersededByUserId: args.supersededByUserId,
    }
    documentVersions.set(version.id, version)
    return version
  },

  setStatus(id: string, status: K1Status): void {
    const k = k1Documents.get(id)
    if (!k) return
    k.processingStatus = status
    k1Documents.set(id, k)
  },

  beginParse(id: string): void {
    const k = k1Documents.get(id)
    if (!k) return
    k.processingStatus = 'PROCESSING'
    k.parseAttempts += 1
    k.parseLastAttemptAt = new Date()
    k.parseErrorCode = null
    k.parseErrorMessage = null
    k1Documents.set(id, k)
  },

  completeParse(
    id: string,
    nextStatus: Exclude<K1Status, 'UPLOADED' | 'PROCESSING'>,
  ): void {
    const k = k1Documents.get(id)
    if (!k) return
    k.processingStatus = nextStatus
    k.parseErrorCode = null
    k.parseErrorMessage = null
    k1Documents.set(id, k)
  },

  failParse(id: string, code: string, message: string): void {
    const k = k1Documents.get(id)
    if (!k) return
    k.processingStatus = 'PROCESSING'
    k.parseErrorCode = code
    k.parseErrorMessage = message
    k1Documents.set(id, k)
  },

  addIssue(args: {
    k1DocumentId: string
    issueType: string
    severity: 'LOW' | 'MEDIUM' | 'HIGH'
    message: string
    k1FieldValueId?: string | null
  }): K1IssueRecord {
    const issue: K1IssueRecord = {
      id: randomUUID(),
      k1DocumentId: args.k1DocumentId,
      issueType: args.issueType,
      severity: args.severity,
      status: 'OPEN',
      message: args.message,
      k1FieldValueId: args.k1FieldValueId ?? null,
      resolvedAt: null,
      resolvedByUserId: null,
      createdAt: new Date(),
    }
    k1Issues.set(issue.id, issue)
    return issue
  },

  listIssues(): K1IssueRecord[] {
    return [...k1Issues.values()]
  },

  // ---- Feature 003: review helpers ----

  listIssuesForK1(k1DocumentId: string): K1IssueRecord[] {
    return [...k1Issues.values()].filter((i) => i.k1DocumentId === k1DocumentId)
  },

  getIssue(id: string): K1IssueRecord | undefined {
    return k1Issues.get(id)
  },

  findOpenIssuesForField(k1FieldValueId: string): K1IssueRecord[] {
    return [...k1Issues.values()].filter(
      (i) => i.k1FieldValueId === k1FieldValueId && i.status === 'OPEN',
    )
  },

  resolveIssue(
    id: string,
    args: { resolvedByUserId: string | null },
  ): K1IssueRecord | undefined {
    const i = k1Issues.get(id)
    if (!i) return undefined
    i.status = 'RESOLVED'
    i.resolvedAt = new Date()
    i.resolvedByUserId = args.resolvedByUserId
    k1Issues.set(id, i)
    return i
  },

  /**
   * Optimistic-concurrency compare-and-swap on `k1_documents.version`.
   * Returns the updated record on success, or null when the provided
   * `expectedVersion` does not match the current row.
   */
  casUpdateK1(
    id: string,
    expectedVersion: number,
    patch: Partial<Omit<K1DocumentRecord, 'id' | 'version'>>,
  ): K1DocumentRecord | null {
    const k = k1Documents.get(id)
    if (!k) return null
    if (k.version !== expectedVersion) return null
    const next: K1DocumentRecord = {
      ...k,
      ...patch,
      version: expectedVersion + 1,
    }
    k1Documents.set(id, next)
    return next
  },

  _debugSetK1(patch: Partial<K1DocumentRecord> & { id: string }): K1DocumentRecord {
    const k = k1Documents.get(patch.id)
    if (!k) throw new Error(`Unknown k1 ${patch.id}`)
    const next = { ...k, ...patch }
    k1Documents.set(next.id, next)
    return next
  },

  // --------- helpers (testing / seeding demo rows) ---------

  _debugReset(): void {
    entities.clear()
    partnerships.clear()
    documents.clear()
    k1Documents.clear()
    k1Issues.clear()
    memberships.length = 0
    documentVersions.clear()
    seeded = false
    seed()
  },

  /** Wipe all K-1/partnership/document data but keep entities + memberships (so users can log in). */
  _debugClearAll(): void {
    partnerships.clear()
    documents.clear()
    k1Documents.clear()
    k1Issues.clear()
    documentVersions.clear()
    seeded = false
    // Re-seed empty entities so users still have scope.
    entities.clear()
    memberships.length = 0
    seedMinimal()
  },

  /** Force-run the full demo seed (wipes + re-seeds everything). */
  _debugSeedAll(): void {
    this._debugReset()
  },

  _debugSeedK1(args: {
    partnershipName: string
    status: K1Status
    taxYear: number
    uploaderUserId: string
    issues?: number
    parseError?: { code: string; message: string }
  }): K1DocumentRecord {
    const p = [...partnerships.values()].find((x) => x.name === args.partnershipName)
    if (!p) throw new Error(`Partnership not found: ${args.partnershipName}`)
    const doc: DocumentRecord = {
      id: randomUUID(),
      storagePath: `seed/${randomUUID()}.pdf`,
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      uploadedAt: new Date(),
      uploadedBy: args.uploaderUserId,
    }
    documents.set(doc.id, doc)
    const k: K1DocumentRecord = {
      id: randomUUID(),
      documentId: doc.id,
      partnershipId: p.id,
      entityId: p.entityId,
      taxYear: args.taxYear,
      partnershipNameRaw: p.name,
      processingStatus: args.status,
      parseErrorCode: args.parseError?.code ?? null,
      parseErrorMessage: args.parseError?.message ?? null,
      parseLastAttemptAt: args.parseError ? new Date() : null,
      parseAttempts: args.parseError ? 1 : 0,
      supersededByDocumentId: null,
      uploaderUserId: args.uploaderUserId,
      uploadedAt: new Date(),
      version: 0,
      approvedByUserId: null,
      finalizedByUserId: null,
    }
    k1Documents.set(k.id, k)
    for (let i = 0; i < (args.issues ?? 0); i++) {
      this.addIssue({
        k1DocumentId: k.id,
        issueType: 'MISSING_FIELD',
        severity: 'MEDIUM',
        message: `Seeded issue ${i + 1}`,
      })
    }
    return k
  },

  _debugSetMemberships(userId: string, entityIds: string[]): void {
    for (let i = memberships.length - 1; i >= 0; i--) {
      if (memberships[i]!.userId === userId) memberships.splice(i, 1)
    }
    for (const entityId of entityIds) memberships.push({ userId, entityId })
  },

  _debugListDocumentVersions(): DocumentVersionRecord[] {
    return [...documentVersions.values()]
  },
}
