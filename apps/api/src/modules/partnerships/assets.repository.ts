import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import { pool } from '../../infra/db/client.js'
import { authRepository } from '../auth/auth.repository.js'
import { auditRepository } from '../audit/audit.repository.js'
import { PARTNERSHIP_AUDIT_EVENTS } from '../audit/audit.events.js'
import type {
  CreatePartnershipAssetRequest,
  PartnershipAssetDetail,
  PartnershipAssetRow,
  PartnershipAssetsResponse,
} from '../../../../../packages/types/src/partnership-management.js'
import {
  buildAssetsResponse,
  createInMemoryAsset,
  createInMemoryAssetSnapshot,
  findInMemoryDuplicateAsset,
  getInMemoryAssetDetail,
  listInMemoryAssetRows,
  resetInMemoryAssets,
} from './assets.store.js'

export const assetsRepository = {
  async listPartnershipAssets(_partnershipId: string): Promise<PartnershipAssetsResponse> {
    if (!pool) {
      return buildAssetsResponse(listInMemoryAssetRows(_partnershipId))
    }

    const result = await pool.query(
      `
      select
        asset.id,
        asset.partnership_id,
        asset.name,
        asset.asset_type,
        asset.source_type,
        asset.status,
        asset.description,
        asset.notes,
        asset.created_at,
        asset.updated_at,
        latest.fmv_amount as latest_amount_usd,
        latest.valuation_date as latest_valuation_date,
        latest.source_type as latest_source,
        latest.confidence_label as latest_confidence_label,
        latest.created_at as latest_created_at
      from partnership_assets asset
      left join lateral (
        select fmv.fmv_amount, fmv.valuation_date, fmv.source_type, fmv.confidence_label, fmv.created_at
        from partnership_asset_fmv_snapshots fmv
        where fmv.asset_id = asset.id
        order by fmv.created_at desc, fmv.valuation_date desc, fmv.id desc
        limit 1
      ) latest on true
      where asset.partnership_id = $1
      order by asset.created_at desc, asset.id desc
      `,
      [_partnershipId],
    )

    const rows: PartnershipAssetRow[] = result.rows.map((row) => ({
      id: row.id,
      partnershipId: row.partnership_id,
      name: row.name,
      assetType: row.asset_type,
      sourceType: row.source_type,
      status: row.status,
      description: row.description ?? null,
      notes: row.notes ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      latestFmv: row.latest_amount_usd != null
        ? {
            amountUsd: Number(row.latest_amount_usd),
            valuationDate: row.latest_valuation_date,
            source: row.latest_source,
            confidenceLabel: row.latest_confidence_label ?? null,
            createdAt: row.latest_created_at,
          }
        : null,
    }))

    return buildAssetsResponse(rows)
  },

  async getPartnershipAsset(_partnershipId: string, _assetId: string): Promise<PartnershipAssetDetail | null> {
    if (!pool) {
      return getInMemoryAssetDetail(_partnershipId, _assetId)
    }

    const result = await pool.query(
      `
      select
        asset.id,
        asset.partnership_id,
        asset.name,
        asset.asset_type,
        asset.source_type,
        asset.status,
        asset.description,
        asset.notes,
        asset.created_at,
        asset.updated_at,
        latest.id as latest_id,
        latest.valuation_date as latest_valuation_date,
        latest.fmv_amount as latest_amount_usd,
        latest.source_type as latest_source,
        latest.confidence_label as latest_confidence_label,
        latest.notes as latest_note,
        latest.recorded_by_user_id,
        latest.created_at as latest_created_at,
        user_record.email as latest_recorded_by_email
      from partnership_assets asset
      left join lateral (
        select fmv.id, fmv.valuation_date, fmv.fmv_amount, fmv.source_type, fmv.confidence_label, fmv.notes, fmv.recorded_by_user_id, fmv.created_at
        from partnership_asset_fmv_snapshots fmv
        where fmv.asset_id = asset.id
        order by fmv.created_at desc, fmv.valuation_date desc, fmv.id desc
        limit 1
      ) latest on true
      left join users user_record on user_record.id = latest.recorded_by_user_id
      where asset.partnership_id = $1 and asset.id = $2
      limit 1
      `,
      [_partnershipId, _assetId],
    )

    const row = result.rows[0]
    if (!row) return null

    return {
      asset: {
        id: row.id,
        partnershipId: row.partnership_id,
        name: row.name,
        assetType: row.asset_type,
        sourceType: row.source_type,
        status: row.status,
        description: row.description ?? null,
        notes: row.notes ?? null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        latestFmv: row.latest_amount_usd != null
          ? {
              amountUsd: Number(row.latest_amount_usd),
              valuationDate: row.latest_valuation_date,
              source: row.latest_source,
              confidenceLabel: row.latest_confidence_label ?? null,
              createdAt: row.latest_created_at,
            }
          : null,
      },
      latestFmv: row.latest_id
        ? {
            id: row.latest_id,
            assetId: row.id,
            valuationDate: row.latest_valuation_date,
            amountUsd: Number(row.latest_amount_usd),
            source: row.latest_source,
            confidenceLabel: row.latest_confidence_label ?? null,
            note: row.latest_note ?? null,
            recordedByUserId: row.recorded_by_user_id ?? null,
            recordedByEmail: row.latest_recorded_by_email ?? null,
            createdAt: row.latest_created_at,
          }
        : null,
    }
  },

  async findDuplicateAsset(
    _partnershipId: string,
    _name: string,
    _assetType: string,
  ): Promise<PartnershipAssetRow | null> {
    if (!pool) {
      return findInMemoryDuplicateAsset(_partnershipId, _name, _assetType)
    }

    const result = await pool.query(
      `
      select id
      from partnership_assets
      where partnership_id = $1
        and lower(trim(name)) = lower(trim($2))
        and lower(trim(asset_type)) = lower(trim($3))
      limit 1
      `,
      [_partnershipId, _name, _assetType],
    )

    const existing = result.rows[0]
    if (!existing) return null
    const detail = await this.getPartnershipAsset(_partnershipId, existing.id)
    return detail?.asset ?? null
  },

  async createPartnershipAsset(
    _partnershipId: string,
    _body: CreatePartnershipAssetRequest,
    _actorUserId: string,
    client?: PoolClient | null,
  ): Promise<PartnershipAssetDetail> {
    if (!pool || !client) {
      const asset = createInMemoryAsset(_partnershipId, _body)
      const actorEmail = authRepository.getUserById(_actorUserId)?.email ?? null

      await auditRepository.record({
        actorUserId: _actorUserId,
        eventName: PARTNERSHIP_AUDIT_EVENTS.ASSET_CREATED,
        objectType: 'partnership_asset',
        objectId: asset.id,
        before: null,
        after: asset,
      })

      if (_body.initialValuation) {
        const snapshot = createInMemoryAssetSnapshot(asset.id, _body.initialValuation, _actorUserId, actorEmail)
        await auditRepository.record({
          actorUserId: _actorUserId,
          eventName: PARTNERSHIP_AUDIT_EVENTS.ASSET_FMV_RECORDED,
          objectType: 'partnership_asset',
          objectId: asset.id,
          before: null,
          after: {
            partnershipId: _partnershipId,
            assetId: asset.id,
            snapshot,
          },
        })
      }

      return getInMemoryAssetDetail(_partnershipId, asset.id)!
    }

    const assetId = randomUUID()
    const createdAssetResult = await client.query(
      `
      insert into partnership_assets
        (id, partnership_id, name, asset_type, source_type, status, description, notes, created_at, updated_at)
      values
        ($1, $2, $3, $4, 'manual', 'ACTIVE', $5, $6, now(), now())
      returning *
      `,
      [
        assetId,
        _partnershipId,
        _body.name.trim(),
        _body.assetType.trim(),
        _body.description?.trim() || null,
        _body.notes?.trim() || null,
      ],
    )
    const asset = createdAssetResult.rows[0]

    await auditRepository.record(
      {
        actorUserId: _actorUserId,
        eventName: PARTNERSHIP_AUDIT_EVENTS.ASSET_CREATED,
        objectType: 'partnership_asset',
        objectId: assetId,
        before: null,
        after: asset,
      },
      client,
    )

    if (_body.initialValuation) {
      const snapshotId = randomUUID()
      const snapshotResult = await client.query(
        `
        insert into partnership_asset_fmv_snapshots
          (id, asset_id, valuation_date, fmv_amount, source_type, confidence_label, notes, recorded_by_user_id, created_at, updated_at)
        values
          ($1, $2, $3, $4, $5, $6, $7, $8, now(), now())
        returning *
        `,
        [
          snapshotId,
          assetId,
          _body.initialValuation.valuationDate,
          _body.initialValuation.amountUsd,
          _body.initialValuation.source,
          _body.initialValuation.confidenceLabel ?? null,
          _body.initialValuation.note ?? null,
          _actorUserId,
        ],
      )

      await auditRepository.record(
        {
          actorUserId: _actorUserId,
          eventName: PARTNERSHIP_AUDIT_EVENTS.ASSET_FMV_RECORDED,
          objectType: 'partnership_asset',
          objectId: assetId,
          before: null,
          after: {
            partnershipId: _partnershipId,
            assetId,
            snapshot: snapshotResult.rows[0],
          },
        },
        client,
      )
    }

    return (await this.getPartnershipAsset(_partnershipId, assetId))!
  },

  _debugReset(): void {
    resetInMemoryAssets()
  },
}