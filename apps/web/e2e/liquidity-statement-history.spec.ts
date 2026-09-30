import { buildCsvBytes,merrillHeaders } from '../../api/tests/liquidity-statements/adapter-conformance/fixture-builders.js'
import type { CsvDetail,UploadCapability } from '../../../packages/types/src/liquidity-statements.js'
import type { ConsolidatedHoldingsResponse } from '../../../packages/types/src/reports.js'
import { test,expect } from './fixtures/liquidity.js'

test('preserves approval history across reprocess, abandonment, duplicate reopen and metadata-only apply',async({adminPage:page,syntheticRun})=>{
  test.setTimeout(120_000)
  const headers={Origin:new URL(page.url()).origin},suffix=syntheticRun.id.replaceAll('-','').slice(0,8).toUpperCase(),symbol=`H${suffix}`
  const entityResponse=await page.request.post('/v1/entities',{headers,data:{name:syntheticRun.entityName,kind:'trust',jurisdiction:'Synthetic test jurisdiction',taxId:'',formedOn:''}})
  expect(entityResponse.status()).toBe(201);const {id:entityId}=await entityResponse.json() as {id:string}
  const accountResponse=await page.request.post('/v1/liquidity-source-accounts',{headers,data:{entityId,custodian:syntheticRun.custodian,name:syntheticRun.accountName,accountMask:'7007',currency:'USD',cadence:'ON_DEMAND'}})
  expect(accountResponse.status()).toBe(201);const {id:accountId}=await accountResponse.json() as {id:string}
  const bytes=buildCsvBytes([[...merrillHeaders],['09/21/2026',`H${suffix}`,symbol,'',`Synthetic history ${suffix}`,syntheticRun.accountName,'Trust','0000007007','10','80','800','-200','-20','1000','0']])

  const openUpload=async()=>{await page.goto('/liquidity');await page.getByRole('button',{name:/Upload statements/i}).click();return page.getByRole('dialog')}
  let dialog=await openUpload();await dialog.getByRole('combobox',{name:'Entity',exact:true}).selectOption(entityId);await dialog.getByRole('combobox',{name:'Custodian',exact:true}).selectOption(syntheticRun.custodian)
  await dialog.locator('input[type=file]').setInputFiles({name:`history-${syntheticRun.id}.csv`,mimeType:'text/csv',buffer:bytes})
  const capabilityResponse=page.waitForResponse(response=>response.url().endsWith('/upload-capability')&&response.request().method()==='POST');await dialog.getByRole('button',{name:'Upload statement',exact:true}).click()
  const capability=await (await capabilityResponse).json() as UploadCapability,statementId=capability.statementId
  await expect(dialog.getByRole('combobox',{name:'Replace holdings in account'})).toBeVisible({timeout:45_000});await dialog.getByRole('combobox',{name:'Replace holdings in account'}).selectOption(accountId)
  const acknowledge=dialog.getByRole('checkbox',{name:/acknowledge all warnings/i});if(await acknowledge.isVisible())await acknowledge.check()
  await dialog.getByRole('button',{name:'Save review',exact:true}).click();await expect(dialog.getByRole('button',{name:'Preview changes',exact:true})).toBeEnabled();await dialog.getByRole('button',{name:'Preview changes',exact:true}).click();await dialog.getByRole('button',{name:'Apply snapshot',exact:true}).click();await expect(dialog.getByRole('heading',{name:/applied$/i})).toBeVisible()
  const before=await (await page.request.get(`/v1/liquidity-statements/${statementId}`)).json() as CsvDetail
  expect(before.priorApplications?.filter(application=>application.status==='APPLIED')).toHaveLength(1)
  const originalRun=before.activeRunId,originalHash=before.storedCanonicalHash,originalSnapshots=before.priorApplications!.filter(application=>application.status==='APPLIED')[0]!.snapshotIds

  await dialog.getByRole('button',{name:'Reprocess with latest adapter'}).click()
  await expect(dialog.getByText(/new correction draft from the retained original/i)).toBeVisible({timeout:45_000})
  expect((await (await page.request.get(`/v1/liquidity-statements/${statementId}`)).json() as CsvDetail).activeRunId).not.toBe(originalRun)
  await dialog.getByRole('button',{name:'Abandon correction and restore applied view'}).click();await expect(dialog.getByRole('heading',{name:/applied$/i})).toBeVisible()
  const restored=await (await page.request.get(`/v1/liquidity-statements/${statementId}`)).json() as CsvDetail
  expect(restored).toMatchObject({activeRunId:originalRun,storedCanonicalHash:originalHash,summary:{status:'APPLIED'}})

  await dialog.getByRole('button',{name:'Close',exact:true}).click();dialog=await openUpload();await dialog.getByRole('combobox',{name:'Entity',exact:true}).selectOption(entityId);await dialog.getByRole('combobox',{name:'Custodian',exact:true}).selectOption(syntheticRun.custodian);await dialog.locator('input[type=file]').setInputFiles({name:`duplicate-${syntheticRun.id}.csv`,mimeType:'text/csv',buffer:bytes})
  const duplicateResponse=page.waitForResponse(response=>response.url().endsWith('/upload-capability')&&response.request().method()==='POST');await dialog.getByRole('button',{name:'Upload statement',exact:true}).click();const duplicate=await (await duplicateResponse).json() as UploadCapability
  expect(duplicate).toMatchObject({statementId,duplicate:true});await expect(dialog.getByRole('button',{name:'Reprocess with latest adapter'})).toBeVisible()

  await dialog.getByRole('button',{name:'Reprocess with latest adapter'}).click();await expect(dialog.getByText(/new correction draft from the retained original/i)).toBeVisible({timeout:45_000})
  await expect(dialog.getByRole('combobox',{name:'Replace holdings in account'})).toHaveValue(accountId)
  const acknowledgeAgain=dialog.getByRole('checkbox',{name:/acknowledge all warnings/i});if(await acknowledgeAgain.isVisible())await acknowledgeAgain.check()
  await dialog.getByRole('button',{name:'Save review',exact:true}).click();await expect(dialog.getByRole('button',{name:'Preview changes',exact:true})).toBeEnabled();await dialog.getByRole('button',{name:'Preview changes',exact:true}).click();await dialog.getByRole('button',{name:'Apply snapshot',exact:true}).click();await expect(dialog.getByRole('heading',{name:/applied$/i})).toBeVisible()
  const after=await (await page.request.get(`/v1/liquidity-statements/${statementId}`)).json() as CsvDetail,approvals=after.priorApplications!.filter(application=>application.status==='APPLIED')
  expect(approvals).toHaveLength(2);expect(approvals[0]!.snapshotIds).toEqual(originalSnapshots);expect(approvals[1]!.snapshotIds).toEqual(originalSnapshots)
  const reportResponse=await page.request.get(`/v1/reports/consolidated-holdings?accountId=${accountId}&pricingMode=saved&pageSize=1000`),report=await reportResponse.json() as ConsolidatedHoldingsResponse
  expect(report.kpis.totalMarketValue).toBe(800);expect(report.rows.map(row=>row.symbol)).toEqual([symbol])
})
