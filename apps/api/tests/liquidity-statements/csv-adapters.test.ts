import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { parseCsv } from '../../src/modules/liquidity-statements/csv/profiles.js'
import { buildCsvFixture, csvRows, positionsHeaders } from './fixtures/buildCsvFixture.js'
import type { MappingProfile } from '../../src/modules/liquidity-statements/liquidity-statement.types.js'

describe('deterministic brokerage CSV conformance', () => {
  it('requires explicit legacy encoding and verifies tab-separated mapped headers',async()=>{
    const profile:MappingProfile={name:'Synthetic encoding',delimiter:'\t',encoding:'WINDOWS1252',headerRecord:1,dateFormat:'YYYY-MM-DD',asOfDate:'2026-09-01',percentUnit:'PERCENT_POINTS',currency:'USD',columns:[{sourceIndex:0,sourceHeader:'Description',target:'description'},{sourceIndex:1,sourceHeader:'Value',target:'marketValue'}]}
    const bytes=Buffer.from('Description\tValue\nCaf\u00e9\t800','latin1')
    await expect(parseCsv(bytes)).rejects.toMatchObject({code:'UNSUPPORTED_ENCODING'})
    expect((await parseCsv(bytes,{},profile)).draft!.accounts[0]!.positions[0]!.description.value).toBe('Caf\u00e9')
    const utf16=Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from(buildCsvFixture(),'utf16le')])
    expect((await parseCsv(utf16)).draft!.accounts[0]!.positions).toHaveLength(1)
    await expect(parseCsv(bytes,{}, {...profile,columns:[{...profile.columns[0]!,sourceHeader:'Wrong'},profile.columns[1]!]})).rejects.toThrow()
  })
  it('reads both layouts, retains exact strings, all occurrences and controls', async () => {
    const positions=await parseCsv(await readFile(new URL('./fixtures/positions.csv',import.meta.url)))
    expect(positions.draft?.adapter.id).toBe('positions_v1')
    expect(positions.draft?.accounts[0]?.positions).toHaveLength(5)
    expect(positions.draft?.accounts[0]?.positions.filter(p=>p.symbol.value==='SWEEP')).toHaveLength(2)
    expect(positions.draft?.accounts[0]?.reportedTotal.value).toBe('1100')
    expect(positions.draft?.accounts[0]?.positions[1]?.costBasis.availability).toBe('INCOMPLETE')
    expect(positions.records.filter(r=>r.role==='TOTAL')).toHaveLength(1)
    expect(positions.records).toHaveLength(Object.values(positions.draft!.recordCounts).slice(1).reduce((a,b)=>a+b,0))
    const merrill=await parseCsv(await readFile(new URL('./fixtures/merrill-holdings.csv',import.meta.url)))
    expect(merrill.draft?.adapter.id).toBe('merrill_holdings_v1')
    expect(merrill.draft?.accounts[0]?.positions[0]?.cusip.value).toBe('001234567')
    expect(merrill.draft?.accounts[0]?.positions[0]?.unrealizedGainLossRatio.value).toBe('-0.2')
    expect(merrill.draft?.accounts[0]?.positions[0]?.costBasis.value).toBeNull()
    expect(merrill.draft?.accounts[0]?.currency.value).toBeNull()
  })
  it('retains physical spans, quoted commas/newlines and source punctuation', async()=>{
    const result=await parseCsv(Buffer.from('\ufeff'+buildCsvFixture({rows:[['BRK/B','Line one\nLine "two", text','1','80','80','100','-20','-20%','','Equity']]})))
    const p=result.draft!.accounts[0]!.positions[0]!
    expect(p.symbol.value).toBe('BRK/B')
    expect(p.description.value).toContain('\n')
    expect(p.description.evidence[0]!.lineEnd).toBeGreaterThan(p.description.evidence[0]!.lineStart)
  })
  it.each([
    ()=>buildCsvFixture({rows:[['BAD','truncated','1']]}),
    ()=>buildCsvFixture()+'\n"unclosed',
    ()=>csvRows([['title'],[...positionsHeaders,'Symbol']]),
  ])('rejects malformed or ambiguous input without losing rows',async make=>{
    await expect(parseCsv(Buffer.from(make()))).rejects.toThrow()
  })
  it('returns mapping state for unknown headers; never guesses based on filename',async()=>{
    const parsed=await parseCsv(Buffer.from('Ticker,Amount\nDEMO,800'))
    expect(parsed.draft).toBeNull()
    expect(parsed.records).toHaveLength(2)
  })
  it('accepts structured empty accounts but rejects an empty file',async()=>{
    expect((await parseCsv(Buffer.from(buildCsvFixture({rows:[]})))).draft!.accounts[0]!.positions).toHaveLength(0)
    await expect(parseCsv(Buffer.from(''))).rejects.toThrow()
  })
  it('rejects invalid text and enforces byte/field/row limits',async()=>{
    await expect(parseCsv(Buffer.from([0xff,0x00,0x01]))).rejects.toThrow()
    await expect(parseCsv(Buffer.from(buildCsvFixture()),{maxBytes:3})).rejects.toThrow()
    await expect(parseCsv(Buffer.from(buildCsvFixture()),{maxFieldBytes:3})).rejects.toThrow()
    await expect(parseCsv(Buffer.from(buildCsvFixture({rows:Array(3).fill(['DEMO','Example','1','1','1','1','0','0%','','Equity'])})),{maxRows:2})).rejects.toThrow()
  })
})
