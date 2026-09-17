import { describe, expect, it } from 'vitest'

import {
  parseCloudFrontViewerAddress,
  resolveRequestSourceIdentity,
} from '../src/modules/abuse-protection/requestSourceIdentity.js'

describe('trusted CloudFront viewer source identity', () => {
  it.each([
    ['198.51.100.25:443', '198.51.100.25/32'],
    ['[::ffff:192.0.2.8]:8443', '192.0.2.8/32'],
    ['[2001:db8:abcd:12::f]:443', '2001:db8:abcd:12::/64'],
  ])('normalizes %s to %s', (header, expected) => {
    expect(parseCloudFrontViewerAddress(header, 64)).toBe(expected)
  })

  it.each([
    undefined,
    '',
    ['198.51.100.1:443', '198.51.100.2:443'],
    '198.51.100.1',
    '198.51.100.1:443, 198.51.100.2:443',
    '[2001:db8::1%eth0]:443',
    '[2001:db8::1]:not-a-port',
    'viewer.example:443',
    '198.51.100.1:443\r\nspoofed: true',
  ])('rejects missing, duplicate, spoofable, or malformed input %#', (header) => {
    expect(() => parseCloudFrontViewerAddress(header, 64)).toThrow(/INVALID_VIEWER_SOURCE/)
  })

  it('accepts the generated value only on the trusted private origin path', () => {
    expect(resolveRequestSourceIdentity({
      header: '198.51.100.25:443',
      trustedPath: true,
      production: true,
      ipv6PrefixLength: 64,
    })).toEqual({
      normalizedPrefix: '198.51.100.25/32',
      source: 'cloudfront_viewer_address',
    })

    expect(() => resolveRequestSourceIdentity({
      header: '198.51.100.25:443',
      trustedPath: false,
      production: true,
      ipv6PrefixLength: 64,
    })).toThrow(/UNTRUSTED_VIEWER_SOURCE_PATH/)

    expect(resolveRequestSourceIdentity({
      header: undefined,
      trustedPath: false,
      production: false,
      ipv6PrefixLength: 64,
    })).toBeNull()
  })
})
