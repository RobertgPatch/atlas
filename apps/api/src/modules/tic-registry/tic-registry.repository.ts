import { pool, withTransaction } from '../../infra/db/client.js'
import type {
  CreateTicInterestRequest,
  CreateTicOwnerRequest,
  CreateTicPropertyRequest,
  Queryable,
  TicInterest,
  TicInterestRow,
  TicOwner,
  TicOwnerRow,
  TicProperty,
  TicPropertyRow,
  TicRegistryQuery,
  TicRegistryResponse,
  TicRegistryScope,
  UpdateTicInterestRequest,
  UpdateTicOwnerRequest,
  UpdateTicPropertyRequest,
} from './tic-registry.types.js'
import { TicRegistryError } from './tic-registry.types.js'

const db = (): NonNullable<typeof pool> => {
  if (!pool) throw new TicRegistryError('DATABASE_REQUIRED')
  return pool
}

const toNumber = (value: unknown): number | null => {
  if (value == null) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

const toIsoDateString = (value: unknown): string | null => {
  if (value == null) return null
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'string') return value.slice(0, 10)
  return String(value).slice(0, 10)
}

const toIsoTimestampString = (value: unknown): string => {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string') return new Date(value).toISOString()
  return new Date(value as string | number).toISOString()
}

const toNumericString = (value: number | null | undefined, scale: number): string | null => {
  if (value == null) return null
  return value.toFixed(scale)
}

const normalizeText = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

const formatPct = (value: number): string => {
  const rounded = Math.round(value * 100) / 100
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}%`
}

const allocationFor = (sum: number) => {
  const allocatedPercentage = Math.round(sum * 100) / 100
  if (Math.abs(sum - 100) < 0.01) {
    return {
      status: 'ok' as const,
      allocatedPercentage,
      message: '100% allocated',
    }
  }
  if (sum < 100) {
    return {
      status: 'under' as const,
      allocatedPercentage,
      message: `${formatPct(allocatedPercentage)} allocated; ${formatPct(100 - allocatedPercentage)} unassigned`,
    }
  }
  return {
    status: 'over' as const,
    allocatedPercentage,
    message: `${formatPct(allocatedPercentage)} allocated; over by ${formatPct(allocatedPercentage - 100)}`,
  }
}

const assertExpectedUpdatedAt = (
  expectedUpdatedAt: string | undefined,
  actualUpdatedAt: string | Date | null | undefined,
): void => {
  if (!expectedUpdatedAt) return
  const expected = new Date(expectedUpdatedAt).getTime()
  const actual = new Date(actualUpdatedAt ?? '').getTime()
  if (!Number.isFinite(expected) || !Number.isFinite(actual) || expected !== actual) {
    throw new TicRegistryError('STALE_TIC_UPDATE')
  }
}

const propertyWhere = (
  filters: TicRegistryQuery,
  params: unknown[],
): string => {
  const clauses: string[] = []

  if (filters.status) {
    params.push(filters.status)
    clauses.push(`p.status = $${params.length}`)
  }

  if (filters.propertyType) {
    params.push(filters.propertyType)
    clauses.push(`p.property_type = $${params.length}`)
  }

  if (filters.search) {
    params.push(`%${filters.search.trim()}%`)
    clauses.push(`p.name ilike $${params.length}`)
  }

  return clauses.length ? `where ${clauses.join(' and ')}` : ''
}

const scopedPropertyById = async (
  propertyId: string,
  client: Queryable = db(),
): Promise<TicPropertyRow | null> => {
  const result = await client.query<TicPropertyRow>(
    `select * from tic_properties p where p.id = $1 limit 1`,
    [propertyId],
  )
  return result.rows[0] ?? null
}

const scopedInterestById = async (
  interestId: string,
  client: Queryable = db(),
): Promise<TicInterestRow | null> => {
  const result = await client.query<TicInterestRow>(
    `
    select i.*
    from tic_interests i
    join tic_properties p on p.id = i.property_id
    where i.id = $1
    limit 1
    `,
    [interestId],
  )
  return result.rows[0] ?? null
}

const scopedOwnerById = async (
  ownerId: string,
  client: Queryable = db(),
): Promise<(TicOwnerRow & { property_percentage: string | number }) | null> => {
  const result = await client.query<TicOwnerRow & { property_percentage: string | number }>(
    `
    select o.*, i.property_percentage
    from tic_owners o
    join tic_interests i on i.id = o.tic_interest_id
    join tic_properties p on p.id = i.property_id
    where o.id = $1
    limit 1
    `,
    [ownerId],
  )
  return result.rows[0] ?? null
}

const mapOwner = (row: TicOwnerRow, interestPercentage: number): TicOwner => {
  const ticPercentage = Number(row.tic_percentage)
  return {
    id: row.id,
    ticInterestId: row.tic_interest_id,
    name: row.name,
    ownerType: row.owner_type,
    ticPercentage,
    effectivePropertyPercentage: Math.round((interestPercentage * ticPercentage) * 100) / 10000,
    createdAt: toIsoTimestampString(row.created_at),
    updatedAt: toIsoTimestampString(row.updated_at),
  }
}

const hydrateProperties = async (
  properties: TicPropertyRow[],
  client: Queryable = db(),
): Promise<TicRegistryResponse> => {
  if (properties.length === 0) {
    return {
      summary: {
        propertyCount: 0,
        ticInterestCount: 0,
        ownerCount: 0,
        estimatedHeldValueUsd: 0,
        underAllocatedPropertyCount: 0,
        overAllocatedPropertyCount: 0,
        underAllocatedInterestCount: 0,
        overAllocatedInterestCount: 0,
      },
      properties: [],
    }
  }

  const propertyIds = properties.map((property) => property.id)
  const interestsResult = await client.query<TicInterestRow>(
    `
    select *
    from tic_interests
    where property_id = any($1::uuid[])
    order by created_at asc, id asc
    `,
    [propertyIds],
  )
  const interests = interestsResult.rows

  const interestIds = interests.map((interest) => interest.id)
  const owners = interestIds.length
    ? (
        await client.query<TicOwnerRow>(
          `
          select *
          from tic_owners
          where tic_interest_id = any($1::uuid[])
          order by created_at asc, id asc
          `,
          [interestIds],
        )
      ).rows
    : []

  const ownersByInterest = new Map<string, TicOwnerRow[]>()
  for (const owner of owners) {
    const rows = ownersByInterest.get(owner.tic_interest_id) ?? []
    rows.push(owner)
    ownersByInterest.set(owner.tic_interest_id, rows)
  }

  const interestsByProperty = new Map<string, TicInterest[]>()
  for (const interestRow of interests) {
    const propertyPercentage = Number(interestRow.property_percentage)
    const interestOwners = (ownersByInterest.get(interestRow.id) ?? []).map((owner) =>
      mapOwner(owner, propertyPercentage),
    )
    const ownerSum = interestOwners.reduce((sum, owner) => sum + owner.ticPercentage, 0)
    const interest: TicInterest = {
      id: interestRow.id,
      propertyId: interestRow.property_id,
      name: interestRow.name,
      propertyPercentage,
      status: interestRow.status,
      acquisitionOrigin: interestRow.acquisition_origin,
      relinquishedInterestId: interestRow.relinquished_interest_id,
      relinquishedSourceName: interestRow.relinquished_source_name,
      relinquishedSourceLabel: interestRow.relinquished_source_label,
      acquisitionDate: toIsoDateString(interestRow.acquisition_date),
      acquisitionValueUsd: toNumber(interestRow.acquisition_value_usd),
      notes: interestRow.notes,
      allocation: allocationFor(ownerSum),
      owners: interestOwners,
      createdAt: toIsoTimestampString(interestRow.created_at),
      updatedAt: toIsoTimestampString(interestRow.updated_at),
    }

    const rows = interestsByProperty.get(interest.propertyId) ?? []
    rows.push(interest)
    interestsByProperty.set(interest.propertyId, rows)
  }

  const mappedProperties: TicProperty[] = properties.map((propertyRow) => {
    const propertyInterests = interestsByProperty.get(propertyRow.id) ?? []
    const ticSum = propertyInterests.reduce(
      (sum, interest) => sum + interest.propertyPercentage,
      0,
    )
    return {
      id: propertyRow.id,
      name: propertyRow.name,
      propertyType: propertyRow.property_type,
      status: propertyRow.status,
      acquiredDate: toIsoDateString(propertyRow.acquired_date),
      estimatedValueUsd: toNumber(propertyRow.estimated_value_usd),
      notes: propertyRow.notes,
      allocation: allocationFor(ticSum),
      interests: propertyInterests,
      createdAt: toIsoTimestampString(propertyRow.created_at),
      updatedAt: toIsoTimestampString(propertyRow.updated_at),
    }
  })

  const summary = mappedProperties.reduce(
    (acc, property) => {
      acc.propertyCount += 1
      if (property.status !== 'sold') {
        acc.estimatedHeldValueUsd += property.estimatedValueUsd ?? 0
      }
      if (property.allocation.status === 'under') acc.underAllocatedPropertyCount += 1
      if (property.allocation.status === 'over') acc.overAllocatedPropertyCount += 1
      for (const interest of property.interests) {
        acc.ticInterestCount += 1
        acc.ownerCount += interest.owners.length
        if (interest.owners.length > 0 && interest.allocation.status === 'under') {
          acc.underAllocatedInterestCount += 1
        }
        if (interest.allocation.status === 'over') acc.overAllocatedInterestCount += 1
      }
      return acc
    },
    {
      propertyCount: 0,
      ticInterestCount: 0,
      ownerCount: 0,
      estimatedHeldValueUsd: 0,
      underAllocatedPropertyCount: 0,
      overAllocatedPropertyCount: 0,
      underAllocatedInterestCount: 0,
      overAllocatedInterestCount: 0,
    },
  )

  return { summary, properties: mappedProperties }
}

const loadOneProperty = async (
  propertyId: string,
  client: Queryable = db(),
): Promise<TicProperty | null> => {
  const row = await scopedPropertyById(propertyId, client)
  if (!row) return null
  return (await hydrateProperties([row], client)).properties[0] ?? null
}

const interestToResponse = async (
  interestId: string,
  client: Queryable = db(),
): Promise<TicInterest | null> => {
  const row = await scopedInterestById(interestId, client)
  if (!row) return null
  const property = await loadOneProperty(row.property_id, client)
  return property?.interests.find((interest) => interest.id === interestId) ?? null
}

const ownerToResponse = async (
  ownerId: string,
  client: Queryable = db(),
): Promise<TicOwner | null> => {
  const row = await scopedOwnerById(ownerId, client)
  if (!row) return null
  const interest = await interestToResponse(row.tic_interest_id, client)
  return interest?.owners.find((owner) => owner.id === ownerId) ?? null
}

export const ticRegistryRepository = {
  async listProperties(
    _scope: TicRegistryScope,
    filters: TicRegistryQuery = {},
  ): Promise<TicRegistryResponse> {
    const params: unknown[] = []
    const where = propertyWhere(filters, params)
    const result = await db().query<TicPropertyRow>(
      `
      select *
      from tic_properties p
      ${where}
      order by p.created_at desc, p.id desc
      `,
      params,
    )
    return hydrateProperties(result.rows)
  },

  async getProperty(propertyId: string, _scope: TicRegistryScope): Promise<TicProperty | null> {
    return loadOneProperty(propertyId)
  },

  async createProperty(
    body: CreateTicPropertyRequest,
    actorUserId: string,
    _scope: TicRegistryScope,
  ): Promise<TicProperty> {
    const result = await db().query<TicPropertyRow>(
      `
      insert into tic_properties (
        name,
        property_type,
        status,
        acquired_date,
        estimated_value_usd,
        notes,
        created_by_user_id,
        updated_by_user_id
      )
      values ($1, $2, $3, $4, $5, $6, $7, $7)
      returning *
      `,
      [
        body.name.trim(),
        body.propertyType,
        body.status ?? 'held',
        body.acquiredDate ?? null,
        toNumericString(body.estimatedValueUsd, 2),
        normalizeText(body.notes),
        actorUserId,
      ],
    )
    return (await hydrateProperties([result.rows[0]])).properties[0]
  },

  async updateProperty(
    propertyId: string,
    body: UpdateTicPropertyRequest,
    actorUserId: string,
    _scope: TicRegistryScope,
  ): Promise<TicProperty> {
    const current = await scopedPropertyById(propertyId)
    if (!current) throw new TicRegistryError('TIC_PROPERTY_NOT_FOUND')
    assertExpectedUpdatedAt(body.expectedUpdatedAt, current.updated_at)

    const result = await db().query<TicPropertyRow>(
      `
      update tic_properties
      set
        name = coalesce($2, name),
        property_type = coalesce($3, property_type),
        status = coalesce($4, status),
        acquired_date = case when $5::boolean then $6::date else acquired_date end,
        estimated_value_usd = case when $7::boolean then $8::numeric else estimated_value_usd end,
        notes = case when $9::boolean then $10::text else notes end,
        updated_by_user_id = $11,
        updated_at = now()
      where id = $1
      returning *
      `,
      [
        propertyId,
        body.name?.trim() ?? null,
        body.propertyType ?? null,
        body.status ?? null,
        Object.prototype.hasOwnProperty.call(body, 'acquiredDate'),
        body.acquiredDate ?? null,
        Object.prototype.hasOwnProperty.call(body, 'estimatedValueUsd'),
        toNumericString(body.estimatedValueUsd, 2),
        Object.prototype.hasOwnProperty.call(body, 'notes'),
        normalizeText(body.notes),
        actorUserId,
      ],
    )
    return (await hydrateProperties([result.rows[0]])).properties[0]
  },

  async deleteProperty(
    propertyId: string,
    expectedUpdatedAt: string | undefined,
    _scope: TicRegistryScope,
  ): Promise<void> {
    const current = await scopedPropertyById(propertyId)
    if (!current) throw new TicRegistryError('TIC_PROPERTY_NOT_FOUND')
    assertExpectedUpdatedAt(expectedUpdatedAt, current.updated_at)
    await db().query('delete from tic_properties where id = $1', [propertyId])
  },

  async createInterest(
    propertyId: string,
    body: CreateTicInterestRequest,
    actorUserId: string,
    _scope: TicRegistryScope,
  ): Promise<TicInterest> {
    db()
    return withTransaction(async (client) => {
      const property = await scopedPropertyById(propertyId, client)
      if (!property) throw new TicRegistryError('TIC_PROPERTY_NOT_FOUND')

      let sourceLabel: string | null = null
      let sourceId = body.relinquishedInterestId ?? null
      let sourceName = normalizeText(body.relinquishedSourceName)

      if (body.acquisitionOrigin === 'cash') {
        sourceId = null
        sourceName = null
      } else {
        if (!sourceId && !sourceName) throw new TicRegistryError('INVALID_EXCHANGE_SOURCE')
        if (sourceId) {
          const source = await scopedInterestById(sourceId, client)
          if (!source) throw new TicRegistryError('TIC_SOURCE_NOT_FOUND')
          sourceLabel = source.name
          if (source.status === 'active') {
            await client.query(
              `update tic_interests set status = 'rolled', updated_by_user_id = $2, updated_at = now() where id = $1`,
              [sourceId, actorUserId],
            )
          }
        } else {
          sourceLabel = sourceName
        }
      }

      const result = await client.query<TicInterestRow>(
        `
        insert into tic_interests (
          property_id,
          name,
          property_percentage,
          status,
          acquisition_origin,
          relinquished_interest_id,
          relinquished_source_name,
          relinquished_source_label,
          acquisition_date,
          acquisition_value_usd,
          notes,
          created_by_user_id,
          updated_by_user_id
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)
        returning *
        `,
        [
          propertyId,
          body.name.trim(),
          body.propertyPercentage.toFixed(4),
          body.status ?? 'active',
          body.acquisitionOrigin,
          sourceId,
          sourceName,
          sourceLabel,
          body.acquisitionDate ?? null,
          toNumericString(body.acquisitionValueUsd, 2),
          normalizeText(body.notes),
          actorUserId,
        ],
      )
      return (await interestToResponse(result.rows[0].id, client))!
    })
  },

  async updateInterest(
    interestId: string,
    body: UpdateTicInterestRequest,
    actorUserId: string,
    _scope: TicRegistryScope,
  ): Promise<TicInterest> {
    db()
    return withTransaction(async (client) => {
      const current = await scopedInterestById(interestId, client)
      if (!current) throw new TicRegistryError('TIC_INTEREST_NOT_FOUND')
      assertExpectedUpdatedAt(body.expectedUpdatedAt, current.updated_at)

      const finalOrigin = body.acquisitionOrigin ?? current.acquisition_origin
      let sourceId =
        Object.prototype.hasOwnProperty.call(body, 'relinquishedInterestId')
          ? body.relinquishedInterestId ?? null
          : current.relinquished_interest_id
      let sourceName =
        Object.prototype.hasOwnProperty.call(body, 'relinquishedSourceName')
          ? normalizeText(body.relinquishedSourceName)
          : current.relinquished_source_name
      let sourceLabel = current.relinquished_source_label

      if (finalOrigin === 'cash') {
        sourceId = null
        sourceName = null
        sourceLabel = null
      } else {
        if (!sourceId && !sourceName) throw new TicRegistryError('INVALID_EXCHANGE_SOURCE')
        if (sourceId) {
          if (sourceId === interestId) throw new TicRegistryError('INVALID_EXCHANGE_SOURCE')
          const source = await scopedInterestById(sourceId, client)
          if (!source) throw new TicRegistryError('TIC_SOURCE_NOT_FOUND')
          sourceLabel = source.name
          if (source.status === 'active') {
            await client.query(
              `update tic_interests set status = 'rolled', updated_by_user_id = $2, updated_at = now() where id = $1`,
              [sourceId, actorUserId],
            )
          }
        } else {
          sourceLabel = sourceName
        }
      }

      const result = await client.query<TicInterestRow>(
        `
        update tic_interests
        set
          name = coalesce($2, name),
          property_percentage = coalesce($3, property_percentage),
          status = coalesce($4, status),
          acquisition_origin = $5,
          relinquished_interest_id = $6,
          relinquished_source_name = $7,
          relinquished_source_label = $8,
          acquisition_date = case when $9::boolean then $10::date else acquisition_date end,
          acquisition_value_usd = case when $11::boolean then $12::numeric else acquisition_value_usd end,
          notes = case when $13::boolean then $14::text else notes end,
          updated_by_user_id = $15,
          updated_at = now()
        where id = $1
        returning *
        `,
        [
          interestId,
          body.name?.trim() ?? null,
          body.propertyPercentage == null ? null : body.propertyPercentage.toFixed(4),
          body.status ?? null,
          finalOrigin,
          sourceId,
          sourceName,
          sourceLabel,
          Object.prototype.hasOwnProperty.call(body, 'acquisitionDate'),
          body.acquisitionDate ?? null,
          Object.prototype.hasOwnProperty.call(body, 'acquisitionValueUsd'),
          toNumericString(body.acquisitionValueUsd, 2),
          Object.prototype.hasOwnProperty.call(body, 'notes'),
          normalizeText(body.notes),
          actorUserId,
        ],
      )
      return (await interestToResponse(result.rows[0].id, client))!
    })
  },

  async deleteInterest(
    interestId: string,
    expectedUpdatedAt: string | undefined,
    _scope: TicRegistryScope,
  ): Promise<void> {
    const current = await scopedInterestById(interestId)
    if (!current) throw new TicRegistryError('TIC_INTEREST_NOT_FOUND')
    assertExpectedUpdatedAt(expectedUpdatedAt, current.updated_at)
    await db().query('delete from tic_interests where id = $1', [interestId])
  },

  async createOwner(
    interestId: string,
    body: CreateTicOwnerRequest,
    actorUserId: string,
    _scope: TicRegistryScope,
  ): Promise<TicOwner> {
    const interest = await scopedInterestById(interestId)
    if (!interest) throw new TicRegistryError('TIC_INTEREST_NOT_FOUND')
    const result = await db().query<TicOwnerRow>(
      `
      insert into tic_owners (
        tic_interest_id,
        name,
        owner_type,
        tic_percentage,
        created_by_user_id,
        updated_by_user_id
      )
      values ($1, $2, $3, $4, $5, $5)
      returning *
      `,
      [interestId, body.name.trim(), body.ownerType, body.ticPercentage.toFixed(4), actorUserId],
    )
    return (await ownerToResponse(result.rows[0].id))!
  },

  async updateOwner(
    ownerId: string,
    body: UpdateTicOwnerRequest,
    actorUserId: string,
    _scope: TicRegistryScope,
  ): Promise<TicOwner> {
    const current = await scopedOwnerById(ownerId)
    if (!current) throw new TicRegistryError('TIC_OWNER_NOT_FOUND')
    assertExpectedUpdatedAt(body.expectedUpdatedAt, current.updated_at)
    const result = await db().query<TicOwnerRow>(
      `
      update tic_owners
      set
        name = coalesce($2, name),
        owner_type = coalesce($3, owner_type),
        tic_percentage = coalesce($4, tic_percentage),
        updated_by_user_id = $5,
        updated_at = now()
      where id = $1
      returning *
      `,
      [
        ownerId,
        body.name?.trim() ?? null,
        body.ownerType ?? null,
        body.ticPercentage == null ? null : body.ticPercentage.toFixed(4),
        actorUserId,
      ],
    )
    return (await ownerToResponse(result.rows[0].id))!
  },

  async deleteOwner(
    ownerId: string,
    expectedUpdatedAt: string | undefined,
    _scope: TicRegistryScope,
  ): Promise<void> {
    const current = await scopedOwnerById(ownerId)
    if (!current) throw new TicRegistryError('TIC_OWNER_NOT_FOUND')
    assertExpectedUpdatedAt(expectedUpdatedAt, current.updated_at)
    await db().query('delete from tic_owners where id = $1', [ownerId])
  },
}
