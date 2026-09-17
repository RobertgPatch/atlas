import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execute = promisify(execFile)
interface SessionCredentials {
  accessKeyId: string
  secretAccessKey: string
  sessionToken: string
  expiration: Date
}

// AWS CLI supports login_session profiles. Refresh its short-lived session
// before expiry instead of freezing the launcher's export for the whole run.
export const createLocalBdaCredentialProvider = (
  profile: string,
  exportSession: () => Promise<string> = async () => {
    const environment = { ...process.env }
    for (const key of ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN',
      'AWS_SECURITY_TOKEN', 'AWS_CREDENTIAL_EXPIRATION', 'AWS_PROFILE', 'AWS_DEFAULT_PROFILE']) {
      delete environment[key]
    }
    const { stdout } = await execute(process.platform === 'win32' ? 'aws.exe' : 'aws', [
      'configure', 'export-credentials', '--profile', profile, '--format', 'process',
    ], { env: environment, windowsHide: true, timeout: 30_000, maxBuffer: 1024 * 1024 })
    return stdout
  },
): (() => Promise<SessionCredentials>) => {
  let cached: SessionCredentials | undefined
  let pending: Promise<SessionCredentials> | undefined
  return async () => {
    if (cached && cached.expiration.getTime() > Date.now() + 60_000) return cached
    if (!pending) {
      pending = (async () => {
        try {
          const value = JSON.parse(await exportSession())
          const expiration = new Date(value.Expiration)
          if (value.Version !== 1 || !value.AccessKeyId || !value.SecretAccessKey || !value.SessionToken
            || !Number.isFinite(expiration.getTime()) || expiration.getTime() <= Date.now()) {
            throw new Error('INVALID_SESSION')
          }
          cached = { accessKeyId: value.AccessKeyId, secretAccessKey: value.SecretAccessKey,
            sessionToken: value.SessionToken, expiration }
          return cached
        } catch {
          // Process errors may contain credential JSON or CLI diagnostics.
          throw Object.assign(new Error('Refresh the approved AWS login and retry.'), {
            name: 'CredentialsProviderError', code: 'LOCAL_BDA_CREDENTIALS_UNAVAILABLE',
          })
        } finally { pending = undefined }
      })()
    }
    return pending
  }
}

export const localBdaCredentials = () => {
  if (process.env.ATLAS_RUNTIME !== 'local' || process.env.ATLAS_LOCAL_BDA_ENABLED !== 'true') return undefined
  const profile = process.env.ATLAS_LOCAL_BDA_AWS_PROFILE
  return profile ? createLocalBdaCredentialProvider(profile) : undefined
}
