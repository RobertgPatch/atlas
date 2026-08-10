import { describe, expect, it, vi } from 'vitest'
import {
  createDatabasePasswordProvider,
  createManagedDatabasePoolConfig,
} from '../src/infra/db/managedDatabasePassword.js'

describe('managed database password provider', () => {
  it('retrieves AWSCURRENT for every new database connection', async () => {
    const loadSecret = vi
      .fn()
      .mockResolvedValueOnce(
        JSON.stringify({ username: 'atlas_admin', password: 'before-rotation' }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({ username: 'atlas_admin', password: 'after-rotation' }),
      )
    const password = createDatabasePasswordProvider({
      secretArn: 'arn:aws:secretsmanager:us-west-2:123456789012:secret:rds-managed',
      expectedUsername: 'atlas_admin',
      loadSecret,
    })

    await expect(password()).resolves.toBe('before-rotation')
    await expect(password()).resolves.toBe('after-rotation')
    expect(loadSecret).toHaveBeenCalledTimes(2)
  })

  it('rejects a secret for a different database user', async () => {
    const password = createDatabasePasswordProvider({
      secretArn: 'arn:aws:secretsmanager:us-west-2:123456789012:secret:rds-managed',
      expectedUsername: 'atlas_admin',
      loadSecret: async () =>
        JSON.stringify({ username: 'other_user', password: 'not-used' }),
    })

    await expect(password()).rejects.toThrow(
      'Managed database secret username does not match DATABASE_USER',
    )
  })

  it('keeps the rotating callback out of connection-string parsing', () => {
    const password = async () => 'current-password'
    const options = createManagedDatabasePoolConfig({
      databaseUrl:
        'postgresql://atlas_admin@db.example.com:5432/atlas?uselibpqcompat=true&sslmode=require',
      password,
    })

    expect(options).toMatchObject({
      user: 'atlas_admin',
      host: 'db.example.com',
      port: 5432,
      database: 'atlas',
      password,
      ssl: { rejectUnauthorized: false },
    })
    expect(options).not.toHaveProperty('connectionString')
  })
})
