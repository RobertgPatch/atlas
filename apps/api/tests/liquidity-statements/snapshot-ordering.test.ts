import { describe,expect,it } from 'vitest'
import { resolveSnapshotOrder } from '../../src/modules/liquidity-sources/snapshot-ordering.js'
describe('source chronology',()=>{
  const current={id:'current',asOfDate:'2026-09-15',asOfAt:null,effectiveKey:'DATE:2026-09-15'}
  it('orders by observation date, including a late historical import',()=>{
    expect(resolveSnapshotOrder({asOfDate:'2026-08-31',asOfAt:null},current).willBecomeCurrent).toBe(false)
    expect(resolveSnapshotOrder({asOfDate:'2026-09-16',asOfAt:null},current).willBecomeCurrent).toBe(true)
    expect(resolveSnapshotOrder({asOfDate:'2026-09-15',asOfAt:null},current).willBecomeCurrent).toBe(true)
  })
  it('requires a reviewed decision when timed and date-only observations compete',()=>{
    expect(()=>resolveSnapshotOrder({asOfDate:'2026-09-15',asOfAt:'2026-09-15T20:00:00Z'},current)).toThrow()
    expect(resolveSnapshotOrder({asOfDate:'2026-09-15',asOfAt:'2026-09-15T20:00:00Z'},current,{kind:'HISTORICAL_ONLY',reason:'Uncertain order'}).willBecomeCurrent).toBe(false)
    expect(resolveSnapshotOrder({asOfDate:'2026-09-15',asOfAt:'2026-09-15T20:00:00Z'},current,{kind:'CORRECTION',reason:'Corrected source',replacesSnapshotId:'current'}).effectiveKey).toBe(current.effectiveKey)
  })
})
