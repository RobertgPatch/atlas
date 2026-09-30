import { buildCsvBytes } from '../../api/tests/liquidity-statements/adapter-conformance/fixture-builders.js'
import { test,expect } from './fixtures/liquidity.js'

test('partial controls, optional cash fields and a genuine negative gain remain explicit through a corrected fresh preview',async({adminPage:page,syntheticRun})=>{
  test.setTimeout(90_000)
  const headers={Origin:new URL(page.url()).origin}
  const entityResponse=await page.request.post('/v1/entities',{headers,data:{name:syntheticRun.entityName,kind:'trust',jurisdiction:'Synthetic test jurisdiction',taxId:'',formedOn:''}})
  expect(entityResponse.status()).toBe(201)
  const {id:entityId}=await entityResponse.json() as {id:string}
  const accountResponse=await page.request.post('/v1/liquidity-source-accounts',{headers,data:{entityId,custodian:'Charles Schwab',name:syntheticRun.accountName,accountMask:'4242',currency:'USD',cadence:'ON_DEMAND'}})
  expect(accountResponse.status()).toBe(201)
  const {id:accountId}=await accountResponse.json() as {id:string}
  const suffix=syntheticRun.id.replaceAll('-','').slice(0,8).toUpperCase(),symbol=`NEG${suffix}`
  const bytes=buildCsvBytes([
    [`Positions for account ${syntheticRun.accountName} ...4242 as of 09/21/2026 04:00 PM ET`],
    [''],
    ['Symbol','Description','Qty (Quantity)','Price','Mkt Val (Market Value)','Cost Basis','Gain $ (Gain/Loss $)','Gain % (Gain/Loss %)','Day Chng $ (Day Change $)','Day Chng % (Day Change %)','Asset Type'],
    [symbol,'Synthetic negative-gain equity','10','$123.456','$1,234.56','$1,500.00','($265.44)','-17.696%','N/A','N/A','Equity'],
    ['Cash & Cash Investments','','','','$250.00','N/A','N/A','N/A','N/A','N/A','Cash and Money Market'],
    ['Positions Total','','','','$1,484.56','$1,400.00','($165.44)','','','',''],
  ])

  await page.goto('/liquidity')
  await page.getByRole('button',{name:/Upload statements/i}).click()
  const dialog=page.getByRole('dialog')
  await dialog.getByRole('combobox',{name:'Entity',exact:true}).selectOption(entityId)
  await dialog.getByRole('combobox',{name:'Custodian',exact:true}).selectOption('Charles Schwab')
  await dialog.locator('input[type="file"]').setInputFiles({name:`synthetic-review-${syntheticRun.id}.csv`,mimeType:'text/csv',buffer:bytes})
  await dialog.getByRole('button',{name:'Upload statement',exact:true}).click()
  const category=dialog.getByRole('combobox',{name:`Category for ${symbol}`,exact:true})
  await expect(category).toBeVisible({timeout:45_000})
  const holdingRow=category.locator('xpath=ancestor::tr[1]')
  await expect(holdingRow).toContainText('-$265.44')
  await expect(dialog.getByText(/PARTIAL SOURCE COVERAGE/i).first()).toBeVisible()
  const cashCategory=dialog.getByRole('combobox',{name:'Category for Cash & Cash Investments',exact:true})
  await expect(cashCategory.locator('xpath=ancestor::tr[1]')).toContainText('Unavailable')
  await dialog.getByRole('combobox',{name:'Replace holdings in account',exact:true}).selectOption(accountId)

  const correction=async(fieldPath:string,value:string,reason:string)=>{
    const field=dialog.getByRole('combobox',{name:'Field',exact:true})
    if(!await field.isVisible())await dialog.getByText('Correct a field for this account',{exact:true}).click()
    await field.selectOption({label:fieldPath.split('.').at(-1)!})
    await dialog.getByLabel('Replacement value (blank means unavailable)',{exact:true}).fill(value)
    await dialog.getByLabel('Reason',{exact:true}).fill(reason)
    await dialog.getByRole('button',{name:'Add correction',exact:true}).click()
  }
  await correction('accounts.0.positions.0.costBasis','1400','Verified adjusted basis from statement detail')
  await correction('accounts.0.positions.0.unrealizedGainLoss','-165.44','Verified gain from statement detail')
  await correction('accounts.0.positions.0.unrealizedGainLossRatio','-0.118171428571','Recalculated ratio from the reviewed basis and gain')
  const acknowledge=dialog.getByRole('checkbox',{name:/acknowledge all warnings/i})
  if(await acknowledge.isVisible())await acknowledge.check()
  const reviewResponse=page.waitForResponse(response=>response.url().endsWith('/review')&&response.request().method()==='PATCH')
  await dialog.getByRole('button',{name:'Save review',exact:true}).click()
  expect((await reviewResponse).status()).toBe(200)
  await expect(dialog.getByText(/Resolve these items before applying/)).toBeHidden()
  await expect(dialog.getByRole('button',{name:'Preview changes',exact:true})).toBeEnabled()
  await dialog.getByRole('button',{name:'Preview changes',exact:true}).click()
  await expect(dialog.getByRole('heading',{name:'Review the changes before applying',exact:true})).toBeVisible()
  await dialog.getByText('Control comparisons',{exact:true}).click()
  await expect(dialog.getByText(/source unknown \(unverifiable\).*reviewed unknown \(unverifiable\)/i).first()).toBeVisible()
  await expect(dialog.getByText(/basis value is estimated or cash-at-par/i)).toBeVisible()
})
