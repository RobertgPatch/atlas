import { describe,expect,it } from 'vitest'
import { csvRepository } from '../../src/modules/liquidity-statements/liquidity-statement.repository.js'
import { parseCsv } from '../../src/modules/liquidity-statements/csv/profiles.js'
import { buildCsvFixture } from './fixtures/buildCsvFixture.js'
import type { Db } from '../../src/modules/liquidity-sources/liquidity-source.repository.js'

describe('persisted draft compatibility',()=>{
  it('loads review drafts created before account fingerprints existed',async()=>{
    const parsed=await parseCsv(Buffer.from(buildCsvFixture({format:'merrill'})))
    const draft=parsed.draft!
    delete (draft.accounts[0] as {identifierFingerprints?:string[]}).identifierFingerprints
    const rows=[
      [{id:'import-1',entity_id:'entity-1',custodian:'Merrill Lynch',version:3,status:'NEEDS_REVIEW',created_at:new Date('2026-09-25T00:00:00Z'),active_run_id:'run-1',review_revision:0,safe_error_code:null}],
      [{id:'run-1',canonical_draft:draft,reconciliation:{}}],
      [],
    ]
    const db={query:async()=>({rows:rows.shift()??[]})} as unknown as Db
    const detail=await csvRepository.detail('import-1',{userId:'user-1',isAdmin:true,entityIds:[]},db)
    expect(detail.summary.status).toBe('NEEDS_REVIEW')
    expect(detail.canonicalDraft?.accounts).toHaveLength(1)
    expect(detail.accountBindings).toEqual([])
  })
})
