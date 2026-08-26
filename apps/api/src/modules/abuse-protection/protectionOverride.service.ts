import { config } from '../../config.js'
import { AdmissionStoreUnavailableError } from './admission.repository.js'
import type {
  AdmissionControlResolver,
  EffectiveProtectionControl,
} from './admission.service.js'
import type { ScopeDimension } from './protection.types.js'
import { fingerprintSubject } from './subjectFingerprint.js'
import {
  protectionOverrideRepository,
  type ProtectionOverrideRecord,
  type ProtectionOverrideRepository,
} from './protectionOverride.repository.js'

export const PROTECTION_CONTROL_KEYS = [
  'k1_uploads',
  'k1_extraction',
  'k1_bedrock_checkbox',
  'plaid_refresh',
  'market_data_refresh',
  'report_exports',
  'backfills',
] as const
export type ProtectionControlKey = (typeof PROTECTION_CONTROL_KEYS)[number]

const configuredDefaults: Readonly<Record<ProtectionControlKey, boolean>> = {
  k1_uploads: config.abuseProtection.killSwitches.k1UploadsEnabled,
  k1_extraction: config.abuseProtection.killSwitches.k1ExtractionEnabled,
  k1_bedrock_checkbox: config.abuseProtection.killSwitches.k1BedrockCheckboxEnabled,
  plaid_refresh: config.abuseProtection.killSwitches.plaidRefreshEnabled,
  market_data_refresh: config.abuseProtection.killSwitches.marketDataRefreshEnabled,
  report_exports: config.abuseProtection.killSwitches.reportExportsEnabled,
  backfills: config.abuseProtection.killSwitches.backfillsEnabled,
}

export interface ResolvedProtectionControl extends EffectiveProtectionControl {
  readonly controlKey: ProtectionControlKey
  readonly mode?: ProtectionOverrideRecord['mode']
  readonly value?: ProtectionOverrideRecord['value']
  readonly reason?: string
  readonly actorUserId?: string
  readonly effectiveAt: Date
  readonly overrideId?: string
}

const sameHash = (left: Uint8Array | null, right: Uint8Array | undefined): boolean =>
  Boolean(left && right && Buffer.from(left).equals(Buffer.from(right)))

const matchingOverride = (
  records: readonly ProtectionOverrideRecord[],
  controlKey: ProtectionControlKey,
  subjectHashes: Readonly<Partial<Record<ScopeDimension, Uint8Array>>>,
): ProtectionOverrideRecord | null => {
  const workloadHash = fingerprintSubject(config.abuseProtection.hmac.activeKey, {
    scope: 'operation',
    value: `control:${controlKey}`,
  })
  const matches = records.filter((record) => {
    if (record.scopeKind === 'environment') return true
    if (record.scopeKind === 'workload') return sameHash(record.scopeHash, workloadHash)
    if (record.scopeKind === 'tenant') return sameHash(record.scopeHash, subjectHashes.tenant)
    return sameHash(record.scopeHash, subjectHashes.user)
  })
  // A broader disable always wins. Otherwise prefer the most specific active
  // override, then the newest row returned by the repository.
  return matches.find((record) => record.mode === 'disable')
    ?? matches.find((record) => record.scopeKind === 'user')
    ?? matches.find((record) => record.scopeKind === 'tenant')
    ?? matches.find((record) => record.scopeKind === 'workload')
    ?? matches[0]
    ?? null
}

export class ProtectionOverrideService implements AdmissionControlResolver {
  readonly #disabledCache = new Map<string, { value: EffectiveProtectionControl; expiresAt: number }>()

  constructor(
    private readonly repository: Pick<ProtectionOverrideRepository, 'listActiveInTransaction'> = protectionOverrideRepository,
  ) {}

  configuredEnabled(controlKey: ProtectionControlKey): boolean {
    return configuredDefaults[controlKey]
  }

  workloadScopeHash(controlKey: ProtectionControlKey): Buffer {
    return fingerprintSubject(config.abuseProtection.hmac.activeKey, {
      scope: 'operation',
      value: `control:${controlKey}`,
    })
  }

  async resolveInTransaction(
    client: Parameters<AdmissionControlResolver['resolveInTransaction']>[0],
    input: Parameters<AdmissionControlResolver['resolveInTransaction']>[1],
  ): Promise<EffectiveProtectionControl> {
    if (!PROTECTION_CONTROL_KEYS.includes(input.controlKey as ProtectionControlKey)) {
      return { enabled: false, source: 'environment_hard_disable' }
    }
    const controlKey = input.controlKey as ProtectionControlKey
    const cacheKey = [
      controlKey,
      Buffer.from(input.subjectHashes.user ?? []).toString('base64url'),
      Buffer.from(input.subjectHashes.tenant ?? []).toString('base64url'),
    ].join(':')
    const cached = this.#disabledCache.get(cacheKey)
    if (cached && cached.expiresAt > input.now.getTime()) return cached.value
    if (cached) this.#disabledCache.delete(cacheKey)
    try {
      const records = await this.repository.listActiveInTransaction(client, controlKey, input.now)
      const active = matchingOverride(records, controlKey, input.subjectHashes)
      if (active) {
        const resolved: EffectiveProtectionControl = {
          enabled: active.mode !== 'disable',
          source: 'runtime_override',
          expiresAt: active.expiresAt,
          ...(active.mode === 'lower_limit'
            ? {
                lowerLimits: Object.fromEntries(Object.entries(active.value).filter(
                  (entry): entry is [string, number] => typeof entry[1] === 'number',
                )),
              }
            : {}),
        }
        // Only disabled decisions are cached: a limiter-store outage must never
        // turn a recently cached allow into paid work that fails open.
        if (!resolved.enabled) {
          while (this.#disabledCache.size >= 128) {
            const oldest = this.#disabledCache.keys().next().value as string | undefined
            if (!oldest) break
            this.#disabledCache.delete(oldest)
          }
          this.#disabledCache.set(cacheKey, {
            value: resolved,
            expiresAt: input.now.getTime()
              + config.abuseProtection.overrides.cacheTtlSeconds * 1_000,
          })
        }
        return resolved
      }
      return {
        enabled: this.configuredEnabled(controlKey),
        source: 'configured_default',
      }
    } catch (error) {
      throw new AdmissionStoreUnavailableError(error)
    }
  }

  configuredControls(now = new Date()): readonly ResolvedProtectionControl[] {
    return PROTECTION_CONTROL_KEYS.map((controlKey) => ({
      controlKey,
      enabled: this.configuredEnabled(controlKey),
      source: 'configured_default' as const,
      effectiveAt: now,
    }))
  }
}

export const protectionOverrideService = new ProtectionOverrideService()

export const configuredHardDisabledControls = (): ReadonlySet<string> => {
  if (config.nodeEnv === 'test') return new Set()
  return new Set(PROTECTION_CONTROL_KEYS.filter(
    (controlKey) => !protectionOverrideService.configuredEnabled(controlKey),
  ))
}
