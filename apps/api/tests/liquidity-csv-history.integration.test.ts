import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { pool } from '../src/infra/db/client.js'
import { csvFixture } from './liquidity-statements/testHelpers.js'
import { buildCsvFixture } from './liquidity-statements/fixtures/buildCsvFixture.js'
import { CsvProcessingService } from '../src/modules/liquidity-statements/csv-processing.service.js'
import { csvRepository } from '../src/modules/liquidity-statements/liquidity-statement.repository.js'
import { csvReviewService } from '../src/modules/liquidity-statements/csv-review.service.js'
import { csvApplicationPreviewService } from '../src/modules/liquidity-statements/csv-application-preview.service.js'
import { csvApplicationService } from '../src/modules/liquidity-statements/csv-application.service.js'
import { liquiditySourceRepository } from '../src/modules/liquidity-sources/liquidity-source.repository.js'
import { liquiditySourceHistory } from '../src/modules/liquidity-sources/liquidity-source-history.js'
import { buildConsolidatedHoldingsResponse } from '../src/modules/reports/consolidatedHoldings.service.js'

describe.skipIf(!pool)('independent account composition and coverage', () => {
  it('uses effective dates, publishes unknown basis, isolates account filters and withholds mixed-currency totals', async () => {
    const f=await csvFixture(), processor=new CsvProcessingService(f.store),scope={...f.scope,isAdmin:false}
    const create=(name:string,currency='USD')=>liquiditySourceRepository.create({entityId:f.entityId,custodian:'Synthetic Broker',name,currency,cadence:'ON_DEMAND'},f.scope)
    const a=await create('A'),b=await create('B')
    async function publish(accountId:string,date:string,value:string,basis:string,currency='USD'){
      const u=await f.upload(buildCsvFixture({date,total:value,rows:[['DEMO','Synthetic','1',value,value,basis,'','','','Equity']]}))
      await processor.processOne(u.id)
      const d=await csvRepository.detail(u.id,f.scope),account=await liquiditySourceRepository.get(accountId,f.scope)
      const binding={occurrenceId:'account-1',accountId,expectedAccountVersion:account.version,completeAccount:true as const,emptyAccountConfirmed:false,acknowledgedIssueIds:d.issues.filter(i=>i.severity==='WARNING').map(i=>i.id)}
      const r=await csvReviewService.review(u.id,{expectedVersion:d.summary.version,changes:[{fieldPath:'accounts.0.currency',value:currency,reason:'Confirmed native account currency'}],accountBindings:[binding]},f.scope)
      const p=await csvApplicationPreviewService.preview(u.id,{expectedVersion:r.summary.version,accountBindings:[binding]},f.scope)
      await csvApplicationService.apply(u.id,{previewId:p.id,expectedVersion:p.expectedVersion,summaryHash:p.summaryHash,idempotencyKey:randomUUID()},f.scope)
    }
    await publish(a.id,'09/01/2026','800','Incomplete')
    await publish(b.id,'09/10/2026','200','100')
    await publish(a.id,'09/15/2026','900','Incomplete')
    const history=(await liquiditySourceHistory(scope,{}))!
    expect(history.points.map(p=>[p.date,p.totalMarketValue,p.coverage.missingAccounts])).toEqual([['2026-09-01',800,1],['2026-09-10',1000,0],['2026-09-15',1100,0]])
    expect(history.points.every(p=>!p.returnAvailable)).toBe(true)
    const context={actorUserId:f.scope.userId,scope:{isAdmin:false,entityIds:[f.entityId]}}
    const report=await buildConsolidatedHoldingsResponse({pricingMode:'saved'},context)
    expect(report.kpis).toMatchObject({totalMarketValue:1100,totalCostBasis:null,totalUnrealizedGainLoss:null})
    expect(report.coverage.gain).toMatchObject({knownSubtotal:'100',total:null,unknownRows:1})
    const selected=await buildConsolidatedHoldingsResponse({pricingMode:'saved',accountId:b.id},context)
    expect(selected.kpis).toMatchObject({selectedAccountCount:1,totalMarketValue:200,totalCostBasis:100,totalUnrealizedGainLoss:100})
    await create('Awaiting first CSV')
    const partial=await buildConsolidatedHoldingsResponse({pricingMode:'saved'},context)
    expect(partial.kpis.totalMarketValue).toBe(1100)
    expect(partial.sync.warnings).toContain('1 included account has no saved snapshot; totals include accounts with approved snapshots only.')
    const eur=await create('EUR','EUR');await publish(eur.id,'09/15/2026','50','40','EUR')
    const mixed=await buildConsolidatedHoldingsResponse({pricingMode:'saved'},context)
    expect(mixed.kpis.totalMarketValue).toBeNull()
    expect(mixed.coverage.gain.knownSubtotal).toBeNull()
    expect(mixed.rows).toHaveLength(2)
  })
})
