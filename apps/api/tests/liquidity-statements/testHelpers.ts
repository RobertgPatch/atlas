import { randomUUID } from 'node:crypto'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pool } from '../../src/infra/db/client.js'
import { runMigrations } from '../../src/infra/db/migrate.js'
import { CsvObjectStore } from '../../src/modules/liquidity-statements/csv-object-store.js'
import { CsvStatementService } from '../../src/modules/liquidity-statements/liquidity-statement.service.js'
import { buildLiquidityCsvConfig } from '../../src/modules/liquidity-statements/liquidity-statement.config.js'
import { byteHash } from '../../src/modules/liquidity-statements/liquidity-statement.repository.js'
import type { LiquidityScope } from '../../src/modules/liquidity-sources/liquidity-source.repository.js'

type TestEnvironment = Readonly<Record<string, string | undefined>>

const isLoopbackPostgres = (value: string): boolean => {
  try {
    const url = new URL(value)
    if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') return false
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
    return host === 'localhost' || host === '::1' || /^127(?:\.\d{1,3}){3}$/.test(host)
  } catch {
    return false
  }
}

/**
 * Acceptance runs opt in to a hard database prerequisite so Vitest's
 * database-aware skip guards cannot accidentally turn missing evidence into
 * a passing run. Ordinary unit-test runs remain database-independent.
 */
export function assertLiquidityDatabaseTestEnvironment(
  env: TestEnvironment = process.env,
  databaseConfigured = Boolean(pool),
): void {
  if (env.ATLAS_REQUIRE_LIQUIDITY_DB_TESTS !== 'true') return
  const databaseUrl = env.ATLAS_TEST_DATABASE_URL ?? ''
  if (!databaseUrl || !databaseConfigured) {
    throw new Error('ATLAS_TEST_DATABASE_URL is required for the liquidity statement acceptance suite')
  }
  if (!isLoopbackPostgres(databaseUrl)) {
    throw new Error('Liquidity statement acceptance tests require a dedicated loopback PostgreSQL database')
  }
}

export async function csvFixture(){
  assertLiquidityDatabaseTestEnvironment()
  if(!pool)throw new Error('Local ATLAS_TEST_DATABASE_URL required')
  await runMigrations()
  const entityId=randomUUID(),otherEntityId=randomUUID(),userId=randomUUID()
  for(const id of [entityId,otherEntityId])await pool.query("insert into entities(id,name,entity_type,tax_id,status) values($1,'Synthetic CSV fixture','TRUST','000-00-0000','ACTIVE')",[id])
  const root=await mkdtemp(join(tmpdir(),'atlas-csv-service-test-'))
  const store=new CsvObjectStore(buildLiquidityCsvConfig({}),root),service=new CsvStatementService(store)
  const scope:LiquidityScope={userId,isAdmin:true,entityIds:[entityId]}
  async function upload(text:string){
    const body=Buffer.from(text),sha256=byteHash(body)
    const cap=await service.upload({entityId,custodian:'Synthetic Broker',fileName:'synthetic.csv',sizeBytes:body.length,sha256,contentType:'text/csv'},scope)
    const token=new URL(cap.url,'http://localhost').searchParams.get('token')!
    const result=await service.putLocal(cap.statementId,token,body,scope)
    const completed=await service.complete(cap.statementId,{expectedVersion:cap.version,storageVersionId:result.storageVersionId,sha256},scope)
    return {id:cap.statementId,cap,body,result,completed,sha256}
  }
  return {entityId,otherEntityId,scope,root,store,service,upload}
}
