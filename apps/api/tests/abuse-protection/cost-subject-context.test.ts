import { describe, expect, it } from 'vitest'

import {
  authorizeSubjectResources,
  createValidatedSubjectContext,
} from '../../src/modules/abuse-protection/subjectContext.js'
import { fingerprintSubject } from '../../src/modules/abuse-protection/subjectFingerprint.js'

const activeKey = 'cost-subject-active-key-material-0000000001'
const retainedKey = 'cost-subject-retained-key-material-0000001'
const keyring = {
  active: { id: 'v2', key: activeKey },
  retained: [{ id: 'v1', key: retainedKey }],
} as const

describe('validated cost subject context', () => {
  it('keeps user, session, tenant, resource, provider, and global subjects distinct', () => {
    const base = createValidatedSubjectContext({
      userId: 'user-1',
      sessionId: 'session-1',
      deploymentTenantId: 'production-tenant',
      environment: 'production',
      keyring,
    })
    const context = authorizeSubjectResources(base, keyring, {
      account: 'account-1',
      entity: 'entity-authorized',
      document: 'document-1',
      provider: 'market-data',
    })
    const hashes = Object.values(context.activeHashes)
      .filter((value): value is Uint8Array => Boolean(value))
      .map((value) => Buffer.from(value).toString('hex'))

    expect(new Set(hashes).size).toBe(hashes.length)
    expect(context.aliases.user).toHaveLength(2)
    expect(context.aliases.provider).toHaveLength(2)
  })

  it('uses the authorization result rather than a request-supplied resource', () => {
    const base = createValidatedSubjectContext({
      userId: 'user-1',
      sessionId: 'session-1',
      deploymentTenantId: 'deployment-owned-tenant',
      environment: 'production',
      keyring,
    })
    const requestParameter = 'entity-attacker-selected'
    const authorizationResult = 'entity-authorized'
    const context = authorizeSubjectResources(base, keyring, {
      entity: authorizationResult,
    })

    expect(context.activeHashes.entity).toEqual(fingerprintSubject(activeKey, {
      scope: 'entity',
      value: authorizationResult,
    }))
    expect(context.activeHashes.entity).not.toEqual(fingerprintSubject(activeKey, {
      scope: 'entity',
      value: requestParameter,
    }))
    expect(context.deploymentTenantId).toBe('deployment-owned-tenant')
  })
})
