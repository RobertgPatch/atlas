import { createHash } from 'node:crypto'
import { describe,expect,it } from 'vitest'
import { buildLiquidityCsvConfig } from '../../src/modules/liquidity-statements/liquidity-statement.config.js'
import { readXlsxStatement } from '../../src/modules/liquidity-statements/readers/xlsx.reader.js'
import { morganStanleyHoldingsXlsxAdapter } from '../../src/modules/liquidity-statements/adapters/morgan-stanley/holdings-xlsx.js'
import { classifyUnclaimedSections,validateDeclaredAccountSections } from '../../src/modules/liquidity-statements/adapters/account-sections.js'
import { buildMorganStanleyMultiAccountFixture } from './fixtures/morgan-stanley/multi-account.fixture.js'

const config=buildLiquidityCsvConfig({LIQUIDITY_XLSX_ENABLED:'true'})
async function document(options:Parameters<typeof buildMorganStanleyMultiAccountFixture>[0]={}){
  const bytes=buildMorganStanleyMultiAccountFixture(options)
  return readXlsxStatement(bytes,createHash('sha256').update(bytes).digest('hex'),config)
}

describe('account section boundaries',()=>{
  it('detects two disjoint complete account snapshots with independent dates and stable occurrences',async()=>{
    const source=await document(),matches=morganStanleyHoldingsXlsxAdapter.detect(source)
    expect(matches).toHaveLength(2)
    validateDeclaredAccountSections(source,matches)
    const accounts=matches.flatMap(match=>morganStanleyHoldingsXlsxAdapter.parse(source,match).accounts)
    expect(accounts.map(account=>({id:account.occurrenceId,date:account.asOfDate.value,sections:account.sourceSections}))).toEqual([
      {id:'morgan-account-1',date:'2026-10-15',sections:['Synthetic Account A']},
      {id:'morgan-account-6',date:'2026-10-16',sections:['Synthetic Account B']},
    ])
    expect(new Set(accounts.flatMap(account=>account.positions.map(position=>position.occurrenceId))).size).toBe(2)
    expect(accounts[0]!.positions[0]!.description.evidence[0]).toMatchObject({kind:'XLSX',hidden:true})
  })

  it('accounts for notes without turning them into positions',async()=>{
    const source=await document(),matches=morganStanleyHoldingsXlsxAdapter.detect(source)
    const classified=classifyUnclaimedSections(source,matches)
    expect(classified.findings).toEqual([])
    expect(classified.dispositions).toContainEqual(expect.objectContaining({role:'NOTE',rule:'UNCLAIMED_NOTE'}))
  })

  it('keeps hidden holdings unselected and emits a global blocking finding',async()=>{
    const source=await document({hidden:true}),matches=morganStanleyHoldingsXlsxAdapter.detect(source)
    expect(matches).toHaveLength(2)
    const classified=classifyUnclaimedSections(source,matches)
    expect(classified.findings).toContainEqual(expect.objectContaining({code:'HIDDEN_ACCOUNT_SECTION',severity:'BLOCKING'}))
    expect(classified.dispositions.some(item=>item.role==='EXCLUDED_SECTION')).toBe(true)
  })

  it('blocks unclaimed visible numeric sections',async()=>{
    const source=await document({unknownNumeric:true}),matches=morganStanleyHoldingsXlsxAdapter.detect(source)
    expect(classifyUnclaimedSections(source,matches).findings).toContainEqual(expect.objectContaining({code:'UNKNOWN_HOLDINGS_SECTION',severity:'BLOCKING'}))
  })

  it('rejects overview/detail overlap instead of double counting',async()=>{
    const source=await document(),match=morganStanleyHoldingsXlsxAdapter.detect(source)[0]!
    expect(()=>validateDeclaredAccountSections(source,[match,{...match,regionId:'overlap',recordStart:match.recordStart+1}])).toThrow('OVERLAPPING_ACCOUNT_SECTIONS')
  })
})
