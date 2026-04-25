import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import { pool } from '../../infra/db/client.js'
import { authRepository } from '../auth/auth.repository.js'
import { auditRepository } from '../audit/audit.repository.js'
import { PARTNERSHIP_AUDIT_EVENTS } from '../audit/audit.events.js'
import type {
  AssetFmvSnapshot,
  CreateAssetFmvSnapshotRequest,
} from '../../../../../packages/types/src/partnership-management.js'
import {
  createInMemoryAssetSnapshot,
  getInMemoryAssetDetail,
  listInMemoryAssetSnapshots,
} from './assets.store.js'

export const assetFmvRepository = {
  async listAssetFmvSnapshots(_partnershipId: string, _assetId: string): Promise<AssetFmvSnapshot[]> {
    if (!pool) {
      return listInMemoryAssetSnapshots(_assetId)
    }

    const result = await pool.query(
      `
      select
        snapshot.id,
        snapshot.asset_id,
        snapshot.valuation_date,
        snapshot.fmv_amount as amount_usd,
        snapshot.source_type,
        snapshot.confidence_label,
        snapshot.notes,
        snapshot.recorded_by_user_id,
        snapshot.created_at,
        user_record.email as recorded_by_email
      from partnership_asset_fmv_snapshots snapshot
      join partnership_assets asset on asset.id = snapshot.asset_id
      left join users user_record on user_record.id = snapshot.recorded_by_user_id
      where asset.partnership_id = $1 and snapshot.asset_id = $2
      order by snapshot.created_at desc, snapshot.valuation_date desc, snapshot.id desc
      `,
      [_partnershipId, _assetId],
    )

    return result.rows.map((row) => ({
      id: row.id,
      assetId: row.asset_id,
      valuationDate: row.valuation_date,
      amountUsd: Number(row.amount_usd),
      source: row.source_type,
      confidenceLabel: row.confidence_label ?? null,
      note: row.notes ?? null,
      recordedByUserId: row.recorded_by_user_id ?? null,
      recordedByEmail: row.recorded_by_email ?? null,
      createdAt: row.created_at,
    }))
  },

  async getLatestAssetFmv(_partnershipId: string, _assetId: string): Promise<AssetFmvSnapshot | null> {
    const snapshots = await this.listAssetFmvSnapshots(_partnershipId, _assetId)
    return snapshots[0] ?? null
  },

  async createAssetFmvSnapshot(
    _partnershipId: string,
    _assetId: string,
    _body: CreateAssetFmvSnapshotRequest,
    _actorUserId: string,
    client?: PoolClient | null,
  ): Promise<AssetFmvSnapshot> {
    if (!pool || !client) {
      const actorEmail = authRepository.getUserById(_actorUserId)?.email ?? null
      const before = await this.getLatestAssetFmv(_partnershipId, _assetId)
      const snapshot = createInMemoryAssetSnapshot(_assetId, _body, _actorUserId, actorEmail)
      await auditRepository.record({
        actorUserId: _actorUserId,
        eventName: PARTNERSHIP_AUDIT_EVENTS.ASSET_FMV_RECORDED,
        objectType: 'partnership_asset',
        objectId: _assetId,
        before,
        after: {
          partnershipId: _partnershipId,
          assetId: _assetId,
          snapshot,
        },
      })
      return snapshot
    }

    const prior = await this.getLatestAssetFmv(_partnershipId, _assetId)
    const result = await client.query(
      `
      insert into partnership_asset_fmv_snapshots
        (id, asset_id, valuation_date, fmv_amount, source_type, confidence_label, notes, recorded_by_user_id, created_at, updated_at)
      values
        ($1, $2, $3, $4, $5, $6, $7, $8, now(), now())
      returning *
      `,
      [
        randomUUID(),
        _assetId,
        _body.valuationDate,
        _body.amountUsd,
        _body.source,
        _body.confidenceLabel ?? null,
        _body.note ?? null,
        _actorUserId,
      ],
    )
    const row = result.rows[0]
    const actorEmail = authRepository.getUserById(_actorUserId)?.email ?? null
    const snapshot: AssetFmvSnapshot = {
      id: row.id,
      assetId: row.asset_id,
      valuationDate: row.valuation_date,
      amountUsd: Number(row.fmv_amount),
      source: row.source_type,
      confidenceLabel: row.confidence_label ?? null,
      note: row.notes ?? null,
      recordedByUserId: row.recorded_by_user_id ?? null,
      recordedByEmail: actorEmail,
      createdAt: row.created_at,
    }

    await auditRepository.record(
      {
        actorUserId: _actorUserId,
        eventName: PARTNERSHIP_AUDIT_EVENTS.ASSET_FMV_RECORDED,
        objectType: 'partnership_asset',
        objectId: _assetId,
        before: prior,
        after: {
          partnershipId: _partnershipId,
          assetId: _assetId,
          snapshot,
        },
      },
      client,
    )

    return snapshot
  },
}