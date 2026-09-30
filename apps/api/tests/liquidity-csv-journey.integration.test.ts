import { randomUUID } from 'node:crypto'
import { afterAll,beforeAll,describe,expect,it,vi } from 'vitest'
import { pool } from '../src/infra/db/client.js'
import { createTestFixture } from './helpers/testApp.js'
import { assertLiquidityDatabaseTestEnvironment,csvFixture } from './liquidity-statements/testHelpers.js'
import { buildCsvFixture } from './liquidity-statements/fixtures/buildCsvFixture.js'
import { byteHash } from '../src/modules/liquidity-statements/liquidity-statement.repository.js'
import { csvProcessingService } from '../src/modules/liquidity-statements/csv-processing.service.js'
import { config } from '../src/config.js'
import { buildCsvBytes,buildXlsxFixture,type XlsxFixtureCell } from './liquidity-statements/adapter-conformance/fixture-builders.js'
import { merrillHeaders } from './liquidity-statements/fixtures/buildCsvFixture.js'
import { liquiditySourceHistory } from '../src/modules/liquidity-sources/liquidity-source-history.js'
import { liquiditySourceRepository } from '../src/modules/liquidity-sources/liquidity-source.repository.js'

assertLiquidityDatabaseTestEnvironment()

// These are publication/report tests, not burst-admission tests. Keep the real
// admission path, but give the synthetic multi-month sequence room to run in
// seconds. Existing export cases additionally require REPORT_EXPORTS_ENABLED
// before module initialization because protection controls snapshot that flag.
const originalJourneySettings={
  adminUser:config.abuseProtection.exactRates.adminWriteUser.requests,
  adminSession:config.abuseProtection.exactRates.adminWriteSessionRequests,
  adminTenant:config.abuseProtection.exactRates.adminWriteTenantRequests,
  capabilities:config.liquidityCsv.capabilitiesPerHour,
}
beforeAll(()=>{
  if(!pool)return
  config.abuseProtection.exactRates.adminWriteUser.requests=1000
  config.abuseProtection.exactRates.adminWriteSessionRequests=1000
  config.abuseProtection.exactRates.adminWriteTenantRequests=1000
  config.liquidityCsv.capabilitiesPerHour=100
})
afterAll(()=>{
  config.abuseProtection.exactRates.adminWriteUser.requests=originalJourneySettings.adminUser
  config.abuseProtection.exactRates.adminWriteSessionRequests=originalJourneySettings.adminSession
  config.abuseProtection.exactRates.adminWriteTenantRequests=originalJourneySettings.adminTenant
  config.liquidityCsv.capabilitiesPerHour=originalJourneySettings.capabilities
})

describe.skipIf(!pool)('CSV HTTP publication journey', () => {
  it.each(['positions', 'merrill'] as const)('publishes %s through review and exports the same signed gain', async format => {
    const fixture = await createTestFixture(), f = await csvFixture()
    const headers = { cookie: fixture.cookie }
    const call = async (method: 'GET' | 'POST' | 'PATCH', path: string, payload?: unknown) => {
      const response = await fixture.app.inject({ method, url: `/v1${path}`, headers, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) })
      expect(response.statusCode, response.body).toBeLessThan(300)
      return response.json()
    }
    try {
      const account = await call('POST', '/liquidity-source-accounts', { entityId: f.entityId, custodian: 'Synthetic Broker', name: 'Journey', currency: 'USD' })
      const body = Buffer.from(buildCsvFixture({ format, ...(format === 'positions' ? { total: '800' } : {}) }))
      const sha256 = byteHash(body)
      const cap = await call('POST', '/liquidity-statements/upload-capability', { entityId: f.entityId, custodian: 'Synthetic Broker', fileName: 'synthetic.csv', sizeBytes: body.length, sha256, contentType: 'text/csv' })
      const put = await fixture.app.inject({ method: 'PUT', url: cap.url, headers: { ...headers, ...cap.requiredHeaders }, payload: body })
      expect(put.statusCode, put.body).toBe(201)
      await call('POST', `/liquidity-statements/${cap.statementId}/complete`, { expectedVersion: cap.version, storageVersionId: put.json().storageVersionId, sha256 })
      await csvProcessingService.processOne(cap.statementId)
      let draft = await call('GET', `/liquidity-statements/${cap.statementId}`)
      const bindings = [{ occurrenceId: draft.canonicalDraft.accounts[0].occurrenceId, accountId: account.id, expectedAccountVersion: 1, completeAccount: true, emptyAccountConfirmed: false, acknowledgedIssueIds: draft.issues.filter((i: { severity: string }) => i.severity === 'WARNING').map((i: { id: string }) => i.id) }]
      draft = await call('PATCH', `/liquidity-statements/${cap.statementId}/review`, { expectedVersion: draft.summary.version, changes: [{ fieldPath: 'accounts.0.currency', value: 'USD', reason: 'Confirmed account currency' }], accountBindings: bindings })
      expect(draft.summary.status).toBe('READY_TO_APPLY')
      const preview = await call('POST', `/liquidity-statements/${cap.statementId}/application-preview`, { expectedVersion: draft.summary.version, accountBindings: bindings })
      const apply = { previewId: preview.id, expectedVersion: preview.expectedVersion, summaryHash: preview.summaryHash, idempotencyKey: randomUUID() }
      const result = await call('POST', `/liquidity-statements/${cap.statementId}/apply`, apply)
      expect(await call('POST', `/liquidity-statements/${cap.statementId}/apply`, apply)).toEqual(result)
      const report = await call('GET', `/reports/consolidated-holdings?accountId=${account.id}&pricingMode=saved`)
      expect(report.kpis).toMatchObject({ totalMarketValue: 800, totalCostBasis: 1000, totalUnrealizedGainLoss: -200 })
      expect(report.pricingCapability.realTimeEquitiesEnabled).toBe(false)
      const exported = await fixture.app.inject({ method: 'GET', url: `/v1/reports/consolidated-holdings/export?format=csv&accountId=${account.id}`, headers })
      expect(exported.statusCode, exported.body).toBe(200)
      expect(exported.body).toContain('-200')
      expect(exported.body).toContain('CSV_ONLY')
    } finally { await fixture.app.close() }
  })
})

type StatementFormat = 'merrill'|'schwab'|'morgan'
type SyntheticPosition = {symbol:string;description:string;quantity:string;price:string;value:string;basis:string;gain:string}
const firstMonth:SyntheticPosition[]=[
  {symbol:'SPCX',description:'Synthetic first custodian description',quantity:'100',price:'10',value:'1000',basis:'800',gain:'200'},
  {symbol:'OLD',description:'Synthetic holding removed next month',quantity:'5',price:'50',value:'250',basis:'200',gain:'50'},
]
const secondMonth:SyntheticPosition[]=[
  {symbol:'SPCX',description:'Synthetic revised statement description',quantity:'80',price:'12',value:'960',basis:'720',gain:'240'},
  {symbol:'NEW',description:'Synthetic newly reported holding',quantity:'2',price:'70',value:'140',basis:'100',gain:'40'},
]
const historicalMonth:SyntheticPosition[]=[
  {symbol:'SPCX',description:'Synthetic earlier evidence',quantity:'90',price:'10',value:'900',basis:'700',gain:'200'},
]
const formatDetails={
  merrill:{custodian:'Merrill Lynch',adapterId:'merrill_holdings_csv',fileKind:'CSV',extension:'csv',contentType:'text/csv'},
  schwab:{custodian:'Charles Schwab',adapterId:'charles_schwab_positions_csv',fileKind:'CSV',extension:'csv',contentType:'text/csv'},
  morgan:{custodian:'Morgan Stanley',adapterId:'morgan_stanley_holdings_xlsx',fileKind:'XLSX',extension:'xlsx',contentType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'},
} as const

// Independent, wholly synthetic monthly observations. These serialize supplied
// values; expectations below are hand-authored, not parser-derived goldens.
function monthlyStatement(format:StatementFormat,date:string,positions:SyntheticPosition[],total:string,basisTotal:string,gainTotal:string):Buffer{
  if(format==='schwab')return buildCsvBytes([
    [`Positions for account Synthetic Monthly Trust ...9001 as of ${date} 04:00 PM ET`],[''],
    ['Symbol','Description','Qty (Quantity)','Price','Mkt Val (Market Value)','Cost Basis','Gain $ (Gain/Loss $)','Gain % (Gain/Loss %)','Day Chng $ (Day Change $)','Asset Type'],
    ...positions.map(p=>[p.symbol,p.description,p.quantity,p.price,p.value,p.basis,p.gain,'','','Equity']),
    ['Positions Total','','','',total,basisTotal,gainTotal,'','',''],
  ])
  if(format==='merrill')return buildCsvBytes([
    [...merrillHeaders,'Cost Basis ($)','Asset Type','Currency'],
    ...positions.map((p,index)=>[date,`0000${index+1}`,p.symbol,'',p.description,'Synthetic Monthly Trust','Trust','00990001',p.quantity,p.price,p.value,p.gain,'','','0',p.basis,'Equity','USD']),
  ])
  const labels=['Name','Product Type','Open Order','Symbol','CUSIP','Last ($)','As of','Quantity','Market Value ($)',"Today's Change (%)","Today's Change ($)",'Total Cost ($)','Adjusted Cost ($)','Unrealized Gain/Loss (%)','Unrealized Gain/Loss ($)','Accrued Interest']
  const letters=(column:number)=>column<26?String.fromCharCode(65+column):`A${String.fromCharCode(65+column-26)}`
  const row=(index:number,values:string[])=>({index,cells:values.map((value,column):XlsxFixtureCell=>({address:`${letters(column)}${index}`,...(/^-?\d+(?:\.\d+)?$/u.test(value)?{kind:'number' as const,value}:{kind:'inlineString' as const,value})}))})
  return buildXlsxFixture({sheets:[{name:'Holdings',rows:[
    row(1,['All Product Type By Security']),row(2,[`Holdings for Account Synthetic Monthly Trust - 9001 as of ${date} 4:00 PM ET`]),
    row(4,['Holding Summary']),row(5,['Total Market Value:',total,'Accrued Interest*:','0','Total Cost:',basisTotal,'Adjusted Cost:',basisTotal]),
    row(7,labels),...positions.map((p,index)=>row(index+8,[p.description,'Stocks / Options','No',p.symbol,'-',p.price,date,p.quantity,p.value,'-','-',p.basis,p.basis,'-',p.gain,'0'])),
    row(8+positions.length,['Total','-','-','-','-','-','-','-',total,'-','-',basisTotal,basisTotal,'-',gainTotal,'0']),
  ]}]})
}

describe.skipIf(!pool)('three-format monthly complete snapshots and durable report history',()=>{
  it.each(['merrill','schwab','morgan'] as const)('publishes, replaces, reloads and preserves historical %s snapshots',async format=>{
    let fixture=await createTestFixture()
    const f=await csvFixture(),details=formatDetails[format]
    const originalXlsxEnabled=config.liquidityCsv.xlsxEnabled
    config.liquidityCsv.xlsxEnabled=true // Test-local opt-in; restored even on red failures.
    const call=async(method:'GET'|'POST'|'PATCH',path:string,payload?:unknown)=>{
      const response=await fixture.app.inject({method,url:`/v1${path}`,headers:{cookie:fixture.cookie},...(payload===undefined?{}:{payload:payload as Record<string,unknown>})})
      expect(response.statusCode,response.body).toBeLessThan(300)
      return response.json()
    }
    try{
      const account=await call('POST','/liquidity-source-accounts',{entityId:f.entityId,custodian:details.custodian,name:`Synthetic ${format} monthly`,accountMask:'9001',currency:'USD'})
      const publish=async(date:string,positions:SyntheticPosition[],total:string,basisTotal:string,gainTotal:string)=>{
        const body=monthlyStatement(format,date,positions,total,basisTotal,gainTotal),sha256=byteHash(body)
        const capability=await call('POST','/liquidity-statements/upload-capability',{entityId:f.entityId,custodian:details.custodian,fileKind:details.fileKind,fileName:`synthetic-monthly.${details.extension}`,sizeBytes:body.length,sha256,contentType:details.contentType})
        const uploaded=await fixture.app.inject({method:'PUT',url:capability.url,headers:{cookie:fixture.cookie,...capability.requiredHeaders},payload:body})
        expect(uploaded.statusCode,uploaded.body).toBe(201)
        await call('POST',`/liquidity-statements/${capability.statementId}/complete`,{expectedVersion:capability.version,storageVersionId:uploaded.json().storageVersionId,sha256})
        await csvProcessingService.processOne(capability.statementId)
        let draft=await call('GET',`/liquidity-statements/${capability.statementId}`)
        expect(draft.canonicalDraft,draft.summary.safeErrorCode).not.toBeNull()
        expect(draft.canonicalDraft.schemaVersion).toBe('3.0.0')
        expect(draft.canonicalDraft.adapter.id).toBe(details.adapterId)
        const current=await liquiditySourceRepository.get(account.id,f.scope)
        const bindings=[{occurrenceId:draft.canonicalDraft.accounts[0].occurrenceId,accountId:account.id,expectedAccountVersion:current.version,completeAccount:true,emptyAccountConfirmed:false,acknowledgedIssueIds:draft.issues.filter((issue:{severity:string})=>issue.severity==='WARNING').map((issue:{id:string})=>issue.id)}]
        draft=await call('PATCH',`/liquidity-statements/${capability.statementId}/review`,{expectedVersion:draft.summary.version,changes:[],accountBindings:bindings})
        expect(draft.summary.status).toBe('READY_TO_APPLY')
        const preview=await call('POST',`/liquidity-statements/${capability.statementId}/application-preview`,{expectedVersion:draft.summary.version,accountBindings:bindings})
        const input={previewId:preview.id,expectedVersion:preview.expectedVersion,summaryHash:preview.summaryHash,idempotencyKey:randomUUID()}
        const applied=await call('POST',`/liquidity-statements/${capability.statementId}/apply`,input)
        expect(await call('POST',`/liquidity-statements/${capability.statementId}/apply`,input)).toEqual(applied)
        const stored=await pool!.query('select s.source_kind,i.file_kind,s.position_total::text from liquidity_holdings_snapshots s join liquidity_csv_imports i on i.id=s.import_id where s.id=$1',[applied.snapshotIds[0]])
        expect(stored.rows[0]).toMatchObject({source_kind:'STATEMENT',file_kind:details.fileKind})
        expect(Number(stored.rows[0].position_total)).toBe(Number(total))
        return {preview,applied,importId:capability.statementId}
      }
      const first=await publish('08/01/2026',firstMonth,'1250','1000','250')
      const firstPositions=(await pool!.query('select id,source_record,quantity::text,market_value::text,cost_basis::text,unrealized_gain_loss::text,canonical from liquidity_source_positions where snapshot_id=$1 order by source_record',[first.applied.snapshotIds[0]])).rows
      expect(firstPositions).toHaveLength(2)
      const before=await call('GET',`/reports/consolidated-holdings?accountId=${account.id}&pricingMode=saved`)
      expect(before.kpis).toMatchObject({totalMarketValue:1250,totalCostBasis:1000,totalUnrealizedGainLoss:250})

      const second=await publish('09/01/2026',secondMonth,'1100','820','280')
      expect(second.preview.accounts[0]).toMatchObject({removed:1,added:1,changed:1,previousValue:'1250',nextValue:'1100',willBecomeCurrent:true})
      const after=await call('GET',`/reports/consolidated-holdings?accountId=${account.id}&pricingMode=saved`)
      expect(after.kpis).toMatchObject({totalMarketValue:1100,totalCostBasis:820,totalUnrealizedGainLoss:280,uniqueAssetCount:2})
      expect(after.rows.map((row:{symbol:string})=>row.symbol).sort()).toEqual(['NEW','SPCX'])
      expect(after.rows.find((row:{symbol:string})=>row.symbol==='SPCX')).toMatchObject({quantity:80,marketValue:960,costBasis:720,exact:{quantity:'80',marketValue:'960',costBasis:'720'}})
      expect((await pool!.query('select id,source_record,quantity::text,market_value::text,cost_basis::text,unrealized_gain_loss::text,canonical from liquidity_source_positions where snapshot_id=$1 order by source_record',[first.applied.snapshotIds[0]])).rows).toEqual(firstPositions)

      const older=await publish('07/01/2026',historicalMonth,'900','700','200')
      expect(older.preview.accounts[0].willBecomeCurrent).toBe(false)
      expect((await liquiditySourceRepository.get(account.id,f.scope)).current_snapshot_id).toBe(second.applied.snapshotIds[0])
      const history=await liquiditySourceHistory({...f.scope,isAdmin:false},{})
      expect(history!.points.map(point=>[point.date,point.totalMarketValue,point.totalCostBasis,point.totalUnrealizedGainLoss])).toEqual([
        ['2026-07-01',900,700,200],['2026-08-01',1250,1000,250],['2026-09-01',1100,820,280],
      ])
      expect(history!.points.every(point=>point.valuationMode==='CSV_FALLBACK'&&!point.returnAvailable)).toBe(true)
      expect((await pool!.query('select id from liquidity_holdings_snapshots where source_account_id=$1',[account.id])).rows).toHaveLength(3)
      const stable=await call('GET',`/reports/consolidated-holdings?accountId=${account.id}&pricingMode=saved`)
      expect(stable.kpis).toEqual(after.kpis)
      expect(stable.rows).toEqual(after.rows)

      // A new application instance exercises persisted reads, not a previous
      // response or the upload dialog's cache. Reading cannot invoke parsing.
      await fixture.app.close()
      fixture=await createTestFixture()
      const parseOnRead=vi.spyOn(csvProcessingService,'processOne').mockRejectedValue(new Error('A report read must not parse source files'))
      try{
        const reloaded=await call('GET',`/reports/consolidated-holdings?accountId=${account.id}&pricingMode=saved`)
        expect(reloaded.kpis).toEqual(after.kpis)
        expect(reloaded.rows).toEqual(after.rows)
        expect(reloaded.sourceRevision).toBe(stable.sourceRevision)
        expect(reloaded.pricingCapability.realTimeEquitiesEnabled).toBe(false)
        expect(parseOnRead).not.toHaveBeenCalled()
      }finally{parseOnRead.mockRestore()}
    }finally{
      config.liquidityCsv.xlsxEnabled=originalXlsxEnabled
      await fixture.app.close()
    }
  },30_000)
})
