import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager'
import type { PoolConfig } from 'pg'

interface ManagedDatabaseSecret {
  username?: unknown
  password?: unknown
}

export type DatabaseSecretLoader = (secretArn: string) => Promise<string>

let secretsManagerClient: SecretsManagerClient | undefined

const loadSecretString: DatabaseSecretLoader = async (secretArn) => {
  secretsManagerClient ??= new SecretsManagerClient({})
  const response = await secretsManagerClient.send(
    new GetSecretValueCommand({ SecretId: secretArn }),
  )

  if (response.SecretString) return response.SecretString
  if (response.SecretBinary) {
    return Buffer.from(response.SecretBinary).toString('utf8')
  }
  throw new Error('Managed database secret has no value')
}

const parseManagedDatabasePassword = (
  secretValue: string,
  expectedUsername: string,
): string => {
  let secret: ManagedDatabaseSecret
  try {
    secret = JSON.parse(secretValue) as ManagedDatabaseSecret
  } catch {
    throw new Error('Managed database secret is not valid JSON')
  }

  if (secret.username !== expectedUsername) {
    throw new Error('Managed database secret username does not match DATABASE_USER')
  }
  if (typeof secret.password !== 'string' || secret.password.length === 0) {
    throw new Error('Managed database secret has no password')
  }
  return secret.password
}

export const createDatabasePasswordProvider = (input: {
  secretArn: string
  expectedUsername: string
  loadSecret?: DatabaseSecretLoader
}): (() => Promise<string>) => {
  const loader = input.loadSecret ?? loadSecretString

  // node-postgres calls this provider whenever it opens a physical connection.
  // Do not cache here: an existing connection survives credential rotation, and
  // every replacement connection must read the current AWSCURRENT secret value.
  return async () =>
    parseManagedDatabasePassword(
      await loader(input.secretArn),
      input.expectedUsername,
    )
}

export const createManagedDatabasePoolConfig = (input: {
  databaseUrl: string
  password: () => Promise<string>
}): PoolConfig => {
  const url = new URL(input.databaseUrl)
  const port = Number(url.port)
  if (!url.username || !url.hostname || !Number.isInteger(port) || port <= 0) {
    throw new Error('Managed database URL is missing required connection fields')
  }

  // Do not pass connectionString alongside password. node-postgres parses the
  // URL after the other options and would overwrite the callback with the
  // URL's intentionally empty password.
  return {
    user: decodeURIComponent(url.username),
    host: url.hostname,
    port,
    database: decodeURIComponent(url.pathname.replace(/^\//, '')),
    password: input.password,
    ssl:
      url.searchParams.get('sslmode') === 'require'
        ? { rejectUnauthorized: false }
        : undefined,
  }
}
