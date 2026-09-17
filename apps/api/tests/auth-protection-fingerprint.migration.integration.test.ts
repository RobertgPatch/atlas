import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const migration = readFileSync(fileURLToPath(new URL(
  '../src/infra/db/migrations/040_auth_rate_limit_hardening.sql',
  import.meta.url,
)), 'utf8')

describe('fingerprinted auth-protection expand/contract migration', () => {
  it('adds source-prefix rate scope and fingerprinted attempt columns without dropping legacy data', () => {
    expect(migration).toMatch(/source_prefix/i)
    expect(migration).toMatch(/subject_hash\s+bytea/i)
    expect(migration).toMatch(/subject_key_version\s+text/i)
    expect(migration).toMatch(/outcome_class\s+text/i)
    expect(migration).toMatch(/cooldown_until\s+timestamptz/i)
    expect(migration).toMatch(/auth_attempts_subject_type_idx/i)
    expect(migration).not.toMatch(/drop\s+(column|table)/i)
  })

  it('keeps compatibility reads possible while making final fingerprint writes enforceable', () => {
    expect(migration).toMatch(/drop\s+not\s+null/i)
    expect(migration).toMatch(/legacy_user_identifier/i)
    expect(migration).toMatch(/subject_hash.*octet_length/is)
    expect(migration).toMatch(/auth_attempts_fingerprint_consistency/i)
    expect(migration).toMatch(/auth_attempts_legacy_cleanup_idx/i)
  })
})
