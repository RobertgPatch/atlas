import { describe,expect,it } from 'vitest'
import { reprocessSchema } from '../../src/modules/liquidity-statements/liquidity-statement.zod.js'

describe('statement reprocess request contract',()=>{
  it('accepts server-registered adapter intent and bounded structural selection',()=>{
    expect(reprocessSchema.parse({expectedVersion:2,reason:'New adapter available',adapter:{id:'morgan_stanley_holdings_xlsx',version:'1.0.0'},structuralSelection:['sheet-1:account-1']})).toMatchObject({expectedVersion:2})
  })
  it('requires an existing mapping revision for mapped CSV',()=>{
    expect(()=>reprocessSchema.parse({expectedVersion:2,reason:'Map it',adapter:{id:'mapped_csv',version:'1.0.0'}})).toThrow()
    expect(reprocessSchema.parse({expectedVersion:2,reason:'Map it',adapter:{id:'mapped_csv',version:'1.0.0'},mappingRevision:3})).toMatchObject({mappingRevision:3})
  })
  it.each([
    {expectedVersion:1,reason:'x',adapter:{id:'arbitrary_uploaded_code',version:'1.0.0'}},
    {expectedVersion:1,reason:'x',adapter:{id:'merrill_holdings_csv',version:'9.9.9'}},
    {expectedVersion:1,reason:'x',claimedReader:'evil'},
    {expectedVersion:1,reason:'x',structuralSelection:['same','same']},
  ])('rejects arbitrary claimed parser input',payload=>expect(()=>reprocessSchema.parse(payload)).toThrow())
})
