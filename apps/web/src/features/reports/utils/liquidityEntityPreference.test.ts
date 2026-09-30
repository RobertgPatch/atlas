import { beforeEach,describe,expect,it } from 'vitest'
import { liquidityDefaultEntityKey,preferredLiquidityEntityId,savedLiquidityEntityId } from './liquidityEntityPreference'

const entities=[
  {id:'first',name:'Personal'},
  {id:'garner',name:'Garner Family Trust'},
  {id:'other',name:'Other Trust'},
]

describe('liquidity entity preference',()=>{
  beforeEach(()=>window.localStorage.clear())

  it('defaults to Garner Family Trust when there is no saved choice',()=>{
    expect(preferredLiquidityEntityId(entities,'')).toBe('garner')
  })

  it('uses a valid saved entity and falls back when it is no longer available',()=>{
    expect(preferredLiquidityEntityId(entities,'other')).toBe('other')
    expect(preferredLiquidityEntityId(entities,'missing')).toBe('garner')
  })

  it('stores defaults separately for each user',()=>{
    window.localStorage.setItem(liquidityDefaultEntityKey('user-1'),'other')
    expect(savedLiquidityEntityId('user-1')).toBe('other')
    expect(savedLiquidityEntityId('user-2')).toBe('')
  })
})
