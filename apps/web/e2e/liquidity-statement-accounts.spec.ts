import { buildCsvBytes,merrillHeaders } from '../../api/tests/liquidity-statements/adapter-conformance/fixture-builders.js'
import type { CsvDetail } from '../../../packages/types/src/liquidity-statements.js'
import type { ConsolidatedHoldingsResponse } from '../../../packages/types/src/reports.js'
import { test,expect } from './fixtures/liquidity.js'

test('selects account A, then reprocesses the same source to apply account B without changing A',async({adminPage:page,syntheticRun})=>{
  test.setTimeout(120_000)
  const headers={Origin:new URL(page.url()).origin},suffix=syntheticRun.id.replaceAll('-','').slice(0,8).toUpperCase()
  const entityResponse=await page.request.post('/v1/entities',{headers,data:{name:syntheticRun.entityName,kind:'trust',jurisdiction:'Synthetic test jurisdiction',taxId:'',formedOn:''}})
  expect(entityResponse.status()).toBe(201);const {id:entityId}=await entityResponse.json() as {id:string}
  const createAccount=async(name:string,mask:string)=>{
    const response=await page.request.post('/v1/liquidity-source-accounts',{headers,data:{entityId,custodian:syntheticRun.custodian,name,accountMask:mask,currency:'USD',cadence:'ON_DEMAND'}})
    expect(response.status()).toBe(201);return (await response.json() as {id:string}).id
  }
  const accountAName=`Account A ${suffix}`,accountBName=`Account B ${suffix}`
  const accountA=await createAccount(accountAName,'1001'),accountB=await createAccount(accountBName,'2002')
  const symbolA=`A${suffix}`,symbolB=`B${suffix}`
  const bytes=buildCsvBytes([
    [...merrillHeaders],
    ['09/21/2026',`A${suffix}`,symbolA,'',`Synthetic A ${suffix}`,accountAName,'Trust','0000001001','10','10','100','20','25','80','0'],
    ['09/21/2026',`B${suffix}`,symbolB,'',`Synthetic B ${suffix}`,accountBName,'Trust','0000002002','20','10','200','40','25','160','0'],
  ])

  await page.goto('/liquidity');await page.getByRole('button',{name:/Upload statements/i}).click()
  let dialog=page.getByRole('dialog')
  await dialog.getByRole('combobox',{name:'Entity',exact:true}).selectOption(entityId)
  await dialog.getByRole('combobox',{name:'Custodian',exact:true}).selectOption(syntheticRun.custodian)
  await dialog.locator('input[type=file]').setInputFiles({name:`multi-${syntheticRun.id}.csv`,mimeType:'text/csv',buffer:bytes})
  const capability=page.waitForResponse(response=>response.url().endsWith('/upload-capability')&&response.request().method()==='POST')
  await dialog.getByRole('button',{name:'Upload statement',exact:true}).click()
  const {statementId}=await (await capability).json() as {statementId:string}
  await expect(dialog.getByRole('heading',{name:new RegExp(accountAName)})).toBeVisible({timeout:45_000})

  const sectionFor=(name:string)=>dialog.getByRole('heading',{name:new RegExp(name)}).locator('xpath=..')
  await sectionFor(accountAName).getByRole('combobox',{name:'Replace holdings in account'}).selectOption(accountA)
  await sectionFor(accountBName).getByRole('radio',{name:'Exclude this account from this application'}).check()
  await sectionFor(accountBName).getByRole('textbox',{name:'Exclusion reason'}).fill('Apply this complete account from the next reviewed run')
  const acknowledge=dialog.getByRole('checkbox',{name:/acknowledge all warnings/i});if(await acknowledge.isVisible())await acknowledge.check()
  await dialog.getByRole('button',{name:'Save review',exact:true}).click()
  await expect(dialog.getByRole('button',{name:'Preview changes',exact:true})).toBeEnabled()
  await dialog.getByRole('button',{name:'Preview changes',exact:true}).click()
  await expect(dialog.getByText(/Excluded account snapshots/)).toBeVisible()
  await expect(dialog.getByText(new RegExp(`${accountBName}: 1 holdings unchanged`))).toBeVisible()
  await dialog.getByRole('button',{name:'Apply snapshot',exact:true}).click()
  await expect(dialog.getByRole('heading',{name:/applied$/i})).toBeVisible()

  const report=async(accountId:string)=>{
    const response=await page.request.get(`/v1/reports/consolidated-holdings?accountId=${accountId}&pricingMode=saved&pageSize=1000`)
    expect(response.ok()).toBe(true);return response.json() as Promise<ConsolidatedHoldingsResponse>
  }
  expect((await report(accountA)).rows.map(row=>row.symbol)).toEqual([symbolA])
  expect((await report(accountB)).rows).toHaveLength(0)
  let detail=await (await page.request.get(`/v1/liquidity-statements/${statementId}`)).json() as CsvDetail
  const reprocess=await page.request.post(`/v1/liquidity-statements/${statementId}/reprocess`,{headers,data:{expectedVersion:detail.summary.version,reason:'Apply the formerly excluded complete account snapshot'}})
  expect(reprocess.status()).toBe(202)
  await expect.poll(async()=>{
    detail=await (await page.request.get(`/v1/liquidity-statements/${statementId}`)).json() as CsvDetail
    return detail.summary.status
  },{timeout:45_000}).toMatch(/NEEDS_REVIEW|READY_TO_APPLY/)

  await dialog.getByRole('button',{name:'Close',exact:true}).click();await page.getByRole('button',{name:/Upload statements/i}).click();dialog=page.getByRole('dialog')
  await dialog.getByRole('button',{name:new RegExp(syntheticRun.custodian)}).first().click()
  await expect(dialog.getByRole('heading',{name:new RegExp(accountBName)})).toBeVisible()
  await sectionFor(accountAName).getByRole('radio',{name:'Exclude this account from this application'}).check()
  await sectionFor(accountAName).getByRole('textbox',{name:'Exclusion reason'}).fill('Already applied from the prior reviewed run')
  await sectionFor(accountBName).getByRole('combobox',{name:'Replace holdings in account'}).selectOption(accountB)
  const acknowledgeAgain=dialog.getByRole('checkbox',{name:/acknowledge all warnings/i});if(await acknowledgeAgain.isVisible())await acknowledgeAgain.check()
  await dialog.getByRole('button',{name:'Save review',exact:true}).click();await expect(dialog.getByRole('button',{name:'Preview changes',exact:true})).toBeEnabled()
  detail=await (await page.request.get(`/v1/liquidity-statements/${statementId}`)).json() as CsvDetail
  const [sourceA,sourceB]=detail.canonicalDraft!.accounts
  const changedSelection=await page.request.post(`/v1/liquidity-statements/${statementId}/application-preview`,{headers,data:{expectedVersion:detail.summary.version,accountBindings:[{occurrenceId:sourceA!.occurrenceId,accountId:accountA,expectedAccountVersion:2,completeAccount:true,emptyAccountConfirmed:false}],excludedAccounts:[{occurrenceId:sourceB!.occurrenceId,reason:'Changed after review'}]}})
  expect(changedSelection.status()).toBe(409)
  await dialog.getByRole('button',{name:'Preview changes',exact:true}).click()
  await expect(dialog.getByRole('heading',{name:'Review the changes before applying',exact:true})).toBeVisible()
  const accountUpdate=await page.request.patch(`/v1/liquidity-source-accounts/${accountB}`,{headers,data:{expectedVersion:1,name:`${accountBName} updated`}});expect(accountUpdate.status()).toBe(200)
  const staleApply=page.waitForResponse(response=>response.url().endsWith(`/${statementId}/apply`)&&response.request().method()==='POST')
  await dialog.getByRole('button',{name:'Apply snapshot',exact:true}).click();expect((await staleApply).status()).toBe(409)
  await expect(dialog.getByRole('alert')).toContainText(/changed.*reload and review/i)
  detail=await (await page.request.get(`/v1/liquidity-statements/${statementId}`)).json() as CsvDetail
  const refreshedReview=await page.request.patch(`/v1/liquidity-statements/${statementId}/review`,{headers,data:{expectedVersion:detail.summary.version,changes:[],accountBindings:[{occurrenceId:sourceB!.occurrenceId,accountId:accountB,expectedAccountVersion:2,completeAccount:true,emptyAccountConfirmed:false,acknowledgedIssueIds:detail.issues.filter(issue=>issue.severity==='WARNING'&&(issue.accountOccurrenceId===null||issue.accountOccurrenceId===sourceB!.occurrenceId)).map(issue=>issue.id)}],excludedAccounts:[{occurrenceId:sourceA!.occurrenceId,reason:'Already applied from the prior reviewed run'}]}})
  expect(refreshedReview.status()).toBe(200)
  await dialog.getByRole('button',{name:'Close',exact:true}).click();await page.getByRole('button',{name:/Upload statements/i}).click();dialog=page.getByRole('dialog')
  await dialog.getByRole('button',{name:new RegExp(syntheticRun.custodian)}).first().click()
  await expect(dialog.getByRole('button',{name:'Preview changes',exact:true})).toBeEnabled();await dialog.getByRole('button',{name:'Preview changes',exact:true}).click();await dialog.getByRole('button',{name:'Apply snapshot',exact:true}).click()
  await expect(dialog.getByRole('heading',{name:/applied$/i})).toBeVisible()
  expect((await report(accountA)).rows.map(row=>row.symbol)).toEqual([symbolA])
  expect((await report(accountB)).rows.map(row=>row.symbol)).toEqual([symbolB])
  detail=await (await page.request.get(`/v1/liquidity-statements/${statementId}`)).json() as CsvDetail
  expect(detail.priorApplications?.filter(application=>application.status==='APPLIED')).toHaveLength(2)
})
