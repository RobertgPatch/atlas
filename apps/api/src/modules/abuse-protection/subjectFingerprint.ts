import { createHmac } from 'node:crypto'
import { isIP } from 'node:net'

import type { HttpMethod, ScopeDimension } from './protection.types.js'

export const DEFAULT_IPV6_PREFIX_LENGTH = 64
export const SUBJECT_FINGERPRINT_BYTES = 32

export type FingerprintKey = string | Buffer | Uint8Array

export type CanonicalFingerprintValue =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalFingerprintValue[]
  | { readonly [key: string]: CanonicalFingerprintValue | undefined }

export interface SubjectFingerprintInput {
  readonly scope: ScopeDimension
  readonly value: string
}

export interface CanonicalRequestFingerprintInput {
  readonly policyKey: string
  readonly method: HttpMethod
  readonly routePattern: string
  readonly inputs?: CanonicalFingerprintValue
  readonly contentSha256?: string | null
  readonly resourceVersion?: string | number | null
}

const keyBytes = (key: FingerprintKey): Buffer => {
  const bytes = typeof key === 'string' ? Buffer.from(key, 'utf8') : Buffer.from(key)
  if (bytes.byteLength < 32) {
    throw new Error('ABUSE_PROTECTION_FINGERPRINT_KEY_TOO_SHORT')
  }
  return bytes
}

const nonEmpty = (value: string, code: string): string => {
  const normalized = value.trim()
  if (!normalized) throw new Error(code)
  return normalized
}

const hmac = (key: FingerprintKey, domain: string, value: string): Buffer =>
  createHmac('sha256', keyBytes(key))
    .update(`atlas-abuse-protection:v1\n${domain}\n`, 'utf8')
    .update(value, 'utf8')
    .digest()

const parseIpv4 = (value: string): number[] | null => {
  if (isIP(value) !== 4) return null
  const octets = value.split('.').map(Number)
  return octets.length === 4 && octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255)
    ? octets
    : null
}

const parseIpv6 = (value: string): number[] | null => {
  const withoutZone = value.split('%', 1)[0]!
  if (isIP(withoutZone) !== 6) return null

  const halves = withoutZone.toLowerCase().split('::')
  if (halves.length > 2) return null

  const parseHalf = (half: string): number[] => {
    if (!half) return []
    const segments = half.split(':')
    const parsed: number[] = []
    for (const segment of segments) {
      const ipv4 = parseIpv4(segment)
      if (ipv4) {
        parsed.push((ipv4[0]! << 8) | ipv4[1]!, (ipv4[2]! << 8) | ipv4[3]!)
        continue
      }
      if (!/^[0-9a-f]{1,4}$/.test(segment)) throw new Error('INVALID_IPV6_SEGMENT')
      parsed.push(Number.parseInt(segment, 16))
    }
    return parsed
  }

  try {
    const left = parseHalf(halves[0]!)
    const right = parseHalf(halves[1] ?? '')
    if (halves.length === 1) return left.length === 8 ? left : null
    const missing = 8 - left.length - right.length
    if (missing < 1) return null
    return [...left, ...Array<number>(missing).fill(0), ...right]
  } catch {
    return null
  }
}

const formatIpv6 = (segments: readonly number[]): string => {
  let longestStart = -1
  let longestLength = 0
  for (let index = 0; index < segments.length;) {
    if (segments[index] !== 0) {
      index += 1
      continue
    }
    let end = index
    while (end < segments.length && segments[end] === 0) end += 1
    if (end - index > longestLength && end - index >= 2) {
      longestStart = index
      longestLength = end - index
    }
    index = end
  }

  const values = segments.map((segment) => segment.toString(16))
  if (longestStart < 0) return values.join(':')
  const left = values.slice(0, longestStart).join(':')
  const right = values.slice(longestStart + longestLength).join(':')
  if (!left && !right) return '::'
  if (!left) return `::${right}`
  if (!right) return `${left}::`
  return `${left}::${right}`
}

const applyIpv6Prefix = (segments: readonly number[], prefixLength: number): number[] => {
  if (!Number.isInteger(prefixLength) || prefixLength < 0 || prefixLength > 128) {
    throw new Error('INVALID_IPV6_PREFIX_LENGTH')
  }
  return segments.map((segment, index) => {
    const remaining = prefixLength - index * 16
    if (remaining >= 16) return segment
    if (remaining <= 0) return 0
    const mask = (0xffff << (16 - remaining)) & 0xffff
    return segment & mask
  })
}

/**
 * Returns a network identity suitable only as transient HMAC input. Callers
 * must persist `fingerprintSubject(...)`, never this raw normalized value.
 */
export const normalizeSourcePrefix = (
  value: string,
  ipv6PrefixLength = DEFAULT_IPV6_PREFIX_LENGTH,
): string => {
  const candidate = nonEmpty(value, 'INVALID_SOURCE_IP')
  const ipv4Mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(candidate)
  const ipv4 = parseIpv4(ipv4Mapped?.[1] ?? candidate)
  if (ipv4) return `${ipv4.join('.')}/32`

  const ipv6 = parseIpv6(candidate)
  if (!ipv6) throw new Error('INVALID_SOURCE_IP')
  return `${formatIpv6(applyIpv6Prefix(ipv6, ipv6PrefixLength))}/${ipv6PrefixLength}`
}

export const fingerprintSubject = (
  key: FingerprintKey,
  input: SubjectFingerprintInput,
): Buffer => hmac(
  key,
  `subject:${input.scope}`,
  nonEmpty(input.value, 'EMPTY_SUBJECT_FINGERPRINT_VALUE'),
)

const canonicalize = (value: CanonicalFingerprintValue | undefined): string => {
  if (value === undefined) return 'null'
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value)
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('NON_FINITE_CANONICAL_NUMBER')
    return JSON.stringify(Object.is(value, -0) ? 0 : value)
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`

  const record = value as Readonly<Record<string, CanonicalFingerprintValue | undefined>>
  const entries = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
  return `{${entries.join(',')}}`
}

const normalizeSha256 = (value: string | null | undefined): string | null => {
  if (value == null) return null
  const normalized = value.trim().toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(normalized)) throw new Error('INVALID_CONTENT_SHA256')
  return normalized
}

/**
 * HMACs the canonical action and normalized inputs. The canonical plaintext is
 * intentionally not exported or returned, preventing raw resource IDs and
 * request values from becoming persistence keys.
 */
export const fingerprintCanonicalRequest = (
  key: FingerprintKey,
  input: CanonicalRequestFingerprintInput,
): Buffer => {
  const canonical = canonicalize({
    contentSha256: normalizeSha256(input.contentSha256),
    inputs: input.inputs ?? null,
    method: input.method.toUpperCase(),
    policyKey: nonEmpty(input.policyKey, 'EMPTY_POLICY_KEY'),
    resourceVersion: input.resourceVersion ?? null,
    routePattern: nonEmpty(input.routePattern, 'EMPTY_ROUTE_PATTERN'),
  })
  return hmac(key, 'canonical-request', canonical)
}
