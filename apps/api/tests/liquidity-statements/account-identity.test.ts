import { describe,expect,it } from 'vitest'
import { accountIdentifierFingerprints } from '../../src/modules/liquidity-statements/csv/account-identity.js'

describe('CSV account identity',()=>{
  it('matches formatting variants without retaining the account number',()=>{
    const raw='0001-2345'
    const fingerprints=accountIdentifierFingerprints(raw)
    expect(fingerprints).toEqual(accountIdentifierFingerprints('00012345'))
    expect(fingerprints.length).toBeGreaterThan(0)
    expect(JSON.stringify(fingerprints)).not.toContain(raw)
    expect(JSON.stringify(fingerprints)).not.toContain('00012345')
  })
})
