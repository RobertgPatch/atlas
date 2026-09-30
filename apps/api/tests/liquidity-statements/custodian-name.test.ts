import { describe,expect,it } from 'vitest'
import { custodianNameKey,preferredCustodianName } from '../../src/modules/liquidity-sources/custodian-name.js'

describe('custodian identity normalization',()=>{
  it('treats casing, spacing and punctuation variants as the same custodian',()=>{
    expect(custodianNameKey('  merrill   lynch ')).toBe(custodianNameKey('Merrill-Lynch'))
  })

  it('prefers the readable saved casing for display',()=>{
    expect(preferredCustodianName(['merrill lynch','Merrill Lynch'])).toBe('Merrill Lynch')
  })
})
