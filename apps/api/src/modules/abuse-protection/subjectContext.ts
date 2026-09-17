import {
  fingerprintSubjectAliases,
  stableGlobalSubject,
  type FingerprintKeyring,
  type VersionedSubjectFingerprint,
} from './subjectFingerprint.js'
import type { ScopeDimension } from './protection.types.js'

export type AuthorizedResourceScope = 'account' | 'entity' | 'document' | 'provider'

export interface ValidatedSubjectContextInput {
  readonly userId: string
  readonly sessionId: string
  readonly deploymentTenantId: string
  readonly environment: string
  readonly keyring: FingerprintKeyring
  /** Values must come from authorization, never request parameters. */
  readonly authorizedResources?: Readonly<Partial<Record<AuthorizedResourceScope, string>>>
}

export interface ValidatedSubjectContext {
  readonly userId: string
  readonly sessionId: string
  readonly deploymentTenantId: string
  readonly aliases: Readonly<Partial<Record<ScopeDimension, readonly VersionedSubjectFingerprint[]>>>
  readonly activeHashes: Readonly<Partial<Record<ScopeDimension, Uint8Array>>>
}

export interface ServiceSubjectContextInput {
  readonly serviceId: string
  readonly operationId: string
  readonly deploymentTenantId: string
  readonly environment: string
  readonly keyring: FingerprintKeyring
  readonly authorizedResources?: Readonly<Partial<Record<AuthorizedResourceScope, string>>>
}

const boundedIdentity = (value: string, name: string): string => {
  const normalized = value.trim()
  if (!normalized || normalized.length > 128) throw new Error(`INVALID_${name}`)
  return normalized
}

export const createValidatedSubjectContext = (
  input: ValidatedSubjectContextInput,
): ValidatedSubjectContext => {
  const values: Partial<Record<ScopeDimension, string>> = {
    user: boundedIdentity(input.userId, 'USER_SUBJECT'),
    session: boundedIdentity(input.sessionId, 'SESSION_SUBJECT'),
    tenant: boundedIdentity(input.deploymentTenantId, 'TENANT_SUBJECT'),
    global: stableGlobalSubject(input.environment, 'api'),
  }
  for (const [scope, value] of Object.entries(input.authorizedResources ?? {})) {
    if (value !== undefined) {
      values[scope as AuthorizedResourceScope] = boundedIdentity(
        value,
        `${scope.toUpperCase()}_SUBJECT`,
      )
    }
  }
  const aliases = Object.fromEntries(Object.entries(values).map(([scope, value]) => [
    scope,
    fingerprintSubjectAliases(input.keyring, {
      scope: scope as ScopeDimension,
      value,
    }),
  ])) as Partial<Record<ScopeDimension, readonly VersionedSubjectFingerprint[]>>
  const activeHashes = Object.fromEntries(Object.entries(aliases).map(([scope, values]) => [
    scope,
    values?.[0]?.digest,
  ])) as Partial<Record<ScopeDimension, Uint8Array>>
  return {
    userId: values.user!,
    sessionId: values.session!,
    deploymentTenantId: values.tenant!,
    aliases,
    activeHashes,
  }
}

export const authorizeSubjectResources = (
  context: ValidatedSubjectContext,
  keyring: FingerprintKeyring,
  authorizedResources: Readonly<Partial<Record<AuthorizedResourceScope, string>>>,
): ValidatedSubjectContext => {
  const resourceAliases = Object.fromEntries(Object.entries(authorizedResources).map(
    ([scope, value]) => {
      if (value === undefined) return [scope, undefined]
      return [scope, fingerprintSubjectAliases(keyring, {
        scope: scope as AuthorizedResourceScope,
        value: boundedIdentity(value, `${scope.toUpperCase()}_SUBJECT`),
      })]
    },
  )) as Partial<Record<ScopeDimension, readonly VersionedSubjectFingerprint[]>>
  const aliases = { ...context.aliases, ...resourceAliases }
  const activeHashes = Object.fromEntries(Object.entries(aliases).map(([scope, values]) => [
    scope,
    values?.[0]?.digest,
  ])) as Partial<Record<ScopeDimension, Uint8Array>>
  return { ...context, aliases, activeHashes }
}

export const createServiceSubjectContext = (
  input: ServiceSubjectContextInput,
): ValidatedSubjectContext => createValidatedSubjectContext({
  userId: `service:${boundedIdentity(input.serviceId, 'SERVICE_SUBJECT')}`,
  sessionId: `operation:${boundedIdentity(input.operationId, 'OPERATION_SUBJECT')}`,
  deploymentTenantId: input.deploymentTenantId,
  environment: input.environment,
  keyring: input.keyring,
  authorizedResources: input.authorizedResources,
})
