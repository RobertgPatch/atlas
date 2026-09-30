import { randomUUID } from 'node:crypto'
import { describe,expect,it } from 'vitest'
import { pool } from '../../src/infra/db/client.js'
import { liquiditySourceRepository } from '../../src/modules/liquidity-sources/liquidity-source.repository.js'
import { CsvError } from '../../src/modules/liquidity-statements/liquidity-statement.errors.js'
import { csvRepository } from '../../src/modules/liquidity-statements/liquidity-statement.repository.js'
import { buildCsvFixture } from './fixtures/buildCsvFixture.js'
import { csvFixture } from './testHelpers.js'

describe.skipIf(!pool)('custodian and statement management',()=>{
  it('updates account display metadata without replacing its protected identity fingerprint',async()=>{
    const fixture=await csvFixture()
    const account=await liquiditySourceRepository.create({entityId:fixture.entityId,custodian:'Merrill Lynch',name:'Merrill Lynch account',accountMask:'3432',currency:'USD',cadence:'ON_DEMAND'},fixture.scope)
    await pool!.query('update liquidity_source_accounts set identifier_fingerprint=$2 where id=$1',[account.id,'protected-fingerprint'])
    const updated=await liquiditySourceRepository.update(account.id,{expectedVersion:account.version,accountMask:'7794'},fixture.scope)
    expect(updated).toMatchObject({accountMask:'7794',version:account.version+1})
    expect((await pool!.query('select identifier_fingerprint from liquidity_source_accounts where id=$1',[account.id])).rows[0].identifier_fingerprint).toBe('protected-fingerprint')
  })

  it('collapses casing variants to one custodian and archives empty variants together',async()=>{
    const fixture=await csvFixture()
    const first=await liquiditySourceRepository.create({entityId:fixture.entityId,custodian:'Merrill Lynch',name:'Primary',currency:'USD',cadence:'ON_DEMAND'},fixture.scope)
    const secondId=randomUUID()
    await pool!.query(`insert into liquidity_source_accounts(id,entity_id,custodian,name,currency,cadence) values($1,$2,'merrill lynch','Legacy casing','USD','ON_DEMAND')`,[secondId,fixture.entityId])
    const accounts=await liquiditySourceRepository.list(fixture.scope,fixture.entityId)
    expect(accounts.filter(account=>account.id===first.id||account.id===secondId).map(account=>account.custodian)).toEqual(['Merrill Lynch','Merrill Lynch'])
    expect((await liquiditySourceRepository.custodians(fixture.scope,fixture.entityId)).filter(item=>item.name.toLocaleLowerCase()==='merrill lynch')).toEqual([expect.objectContaining({name:'Merrill Lynch',accountCount:2,deletable:true})])
    await liquiditySourceRepository.archiveCustodian(fixture.entityId,'Merrill Lynch',fixture.scope)
    expect((await pool!.query('select count(*)::int as count from liquidity_source_accounts where id=any($1::uuid[]) and archived_at is null',[[first.id,secondId]])).rows[0].count).toBe(0)
  })

  it('archives an empty typo custodian and removes it from active account and custodian reads',async()=>{
    const fixture=await csvFixture()
    const account=await liquiditySourceRepository.create({entityId:fixture.entityId,custodian:'Morgan Stanely',name:'Unused setup',currency:'USD',cadence:'ON_DEMAND'},fixture.scope)
    expect(await liquiditySourceRepository.custodians(fixture.scope,fixture.entityId)).toEqual(expect.arrayContaining([expect.objectContaining({name:'Morgan Stanely',deletable:true,accountCount:1})]))
    await liquiditySourceRepository.archiveCustodian(fixture.entityId,'Morgan Stanely',fixture.scope)
    expect(await liquiditySourceRepository.custodians(fixture.scope,fixture.entityId)).not.toEqual(expect.arrayContaining([expect.objectContaining({name:'Morgan Stanely'})]))
    await expect(liquiditySourceRepository.get(account.id,fixture.scope)).rejects.toMatchObject({code:'NOT_FOUND'})
    expect((await pool!.query('select status,included,archived_at is not null as archived from liquidity_source_accounts where id=$1',[account.id])).rows[0]).toEqual({status:'INACTIVE',included:false,archived:true})
  })

  it('archives a non-applied statement, fences its parse run and excludes it from the paged ledger',async()=>{
    const fixture=await csvFixture(),upload=await fixture.upload(buildCsvFixture())
    await csvRepository.archive(upload.id,upload.completed.version,fixture.scope)
    expect((await csvRepository.list(fixture.scope,fixture.entityId,undefined,25)).items).not.toEqual(expect.arrayContaining([expect.objectContaining({id:upload.id})]))
    expect((await pool!.query('select status,archived_at is not null as archived from liquidity_csv_imports where id=$1',[upload.id])).rows[0]).toEqual({status:'CANCELLED',archived:true})
    expect((await pool!.query('select status from liquidity_csv_parse_runs where import_id=$1',[upload.id])).rows).toEqual([expect.objectContaining({status:'CANCELLED'})])
  })

  it('rejects deletion when a statement has been marked as retained financial history',async()=>{
    const fixture=await csvFixture(),upload=await fixture.upload(buildCsvFixture())
    await pool!.query("update liquidity_csv_imports set status='APPLIED',source_identity_retained=true where id=$1",[upload.id])
    await expect(csvRepository.archive(upload.id,upload.completed.version,fixture.scope)).rejects.toEqual(expect.objectContaining<Partial<CsvError>>({code:'FINANCIAL_HISTORY_RETAINED',statusCode:409}))
    await expect(liquiditySourceRepository.archiveCustodian(fixture.entityId,'Synthetic Broker',fixture.scope)).rejects.toEqual(expect.objectContaining<Partial<CsvError>>({code:'FINANCIAL_HISTORY_RETAINED',statusCode:409}))
  })

  it('filters the server-side ledger to selected custodians',async()=>{
    const fixture=await csvFixture(),first=await fixture.upload(buildCsvFixture())
    const account=await liquiditySourceRepository.create({entityId:fixture.entityId,custodian:'Other Broker',name:'Other',currency:'USD',cadence:'ON_DEMAND'},fixture.scope)
    expect(account.custodian).toBe('Other Broker')
    const filtered=await csvRepository.list(fixture.scope,fixture.entityId,undefined,10,['Other Broker'])
    expect(filtered.items).toEqual([])
    const matching=await csvRepository.list(fixture.scope,fixture.entityId,undefined,10,['Synthetic Broker'])
    expect(matching.items.map(item=>item.id)).toContain(first.id)
  })
})
