import { randomUUID } from 'node:crypto'
import type {
  AssetFmvSnapshot,
  AssetFmvSnapshotPreview,
  CreateAssetFmvSnapshotRequest,
  CreatePartnershipAssetRequest,
  PartnershipAssetDetail,
  PartnershipAssetRow,
  PartnershipAssetsResponse,
  PartnershipAssetSource,
} from '../../../../../packages/types/src/partnership-management.js'

interface InMemoryAssetRecord {
  id: string
  partnershipId: string
  name: string
  assetType: string
  sourceType: PartnershipAssetSource
  status: string
  description: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

interface InMemoryAssetSnapshotRecord extends AssetFmvSnapshot {}

const assetRecords = new Map<string, InMemoryAssetRecord>()
const assetSnapshots = new Map<string, InMemoryAssetSnapshotRecord[]>()

function compareSnapshotsDesc(left: { createdAt: string; valuationDate: string; id: string }, right: { createdAt: string; valuationDate: string; id: string }) {
  return (
    right.createdAt.localeCompare(left.createdAt) ||
    right.valuationDate.localeCompare(left.valuationDate) ||
    right.id.localeCompare(left.id)
  )
}

function toPreview(snapshot: InMemoryAssetSnapshotRecord | null): AssetFmvSnapshotPreview | null {
  if (!snapshot) return null
  return {
    amountUsd: snapshot.amountUsd,
    valuationDate: snapshot.valuationDate,
    source: snapshot.source,
    confidenceLabel: snapshot.confidenceLabel,
    createdAt: snapshot.createdAt,
  }
}

export function buildPartnershipAssetRow(record: InMemoryAssetRecord): PartnershipAssetRow {
  const latestSnapshot = [...(assetSnapshots.get(record.id) ?? [])].sort(compareSnapshotsDesc)[0] ?? null
  return {
    ...record,
    latestFmv: toPreview(latestSnapshot),
  }
}

export function listInMemoryAssetRows(partnershipId: string): PartnershipAssetRow[] {
  return [...assetRecords.values()]
    .filter((asset) => asset.partnershipId === partnershipId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id))
    .map(buildPartnershipAssetRow)
}

export function buildAssetsResponse(rows: PartnershipAssetRow[]): PartnershipAssetsResponse {
  const valuedRows = rows.filter((row) => row.latestFmv)
  return {
    summary: {
      assetCount: rows.length,
      valuedAssetCount: valuedRows.length,
      totalLatestAssetFmvUsd: valuedRows.length
        ? valuedRows.reduce((sum, row) => sum + (row.latestFmv?.amountUsd ?? 0), 0)
        : null,
    },
    rows,
  }
}

export function getInMemoryAssetDetail(partnershipId: string, assetId: string): PartnershipAssetDetail | null {
  const asset = assetRecords.get(assetId)
  if (!asset || asset.partnershipId !== partnershipId) return null
  const snapshots = [...(assetSnapshots.get(assetId) ?? [])].sort(compareSnapshotsDesc)
  return {
    asset: buildPartnershipAssetRow(asset),
    latestFmv: snapshots[0] ?? null,
  }
}

export function listInMemoryAssetSnapshots(assetId: string): AssetFmvSnapshot[] {
  return [...(assetSnapshots.get(assetId) ?? [])].sort(compareSnapshotsDesc)
}

export function findInMemoryDuplicateAsset(partnershipId: string, name: string, assetType: string): PartnershipAssetRow | null {
  const normalizedName = name.trim().toLowerCase()
  const normalizedType = assetType.trim().toLowerCase()
  const asset = [...assetRecords.values()].find(
    (candidate) =>
      candidate.partnershipId === partnershipId &&
      candidate.name.trim().toLowerCase() === normalizedName &&
      candidate.assetType.trim().toLowerCase() === normalizedType,
  )
  return asset ? buildPartnershipAssetRow(asset) : null
}

export function createInMemoryAsset(partnershipId: string, body: CreatePartnershipAssetRequest): InMemoryAssetRecord {
  const timestamp = new Date().toISOString()
  const record: InMemoryAssetRecord = {
    id: randomUUID(),
    partnershipId,
    name: body.name.trim(),
    assetType: body.assetType.trim(),
    sourceType: 'manual',
    status: 'ACTIVE',
    description: body.description?.trim() || null,
    notes: body.notes?.trim() || null,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  assetRecords.set(record.id, record)
  return record
}

export function createInMemoryAssetSnapshot(
  assetId: string,
  body: CreateAssetFmvSnapshotRequest,
  actorUserId: string,
  actorEmail: string | null,
): InMemoryAssetSnapshotRecord {
  const snapshot: InMemoryAssetSnapshotRecord = {
    id: randomUUID(),
    assetId,
    valuationDate: body.valuationDate,
    amountUsd: body.amountUsd,
    source: body.source,
    confidenceLabel: body.confidenceLabel ?? null,
    note: body.note ?? null,
    recordedByUserId: actorUserId,
    recordedByEmail: actorEmail,
    createdAt: new Date().toISOString(),
  }
  const existing = assetSnapshots.get(assetId) ?? []
  existing.push(snapshot)
  assetSnapshots.set(assetId, existing)
  return snapshot
}

export function resetInMemoryAssets(): void {
  assetRecords.clear()
  assetSnapshots.clear()
}