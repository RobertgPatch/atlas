import { describe, expect, it } from 'vitest'
import { colorTokens } from '../../design-tokens.js'

interface TokenTree {
  [key: string]: string | TokenTree
}

const entries = (tree: TokenTree, path: string[] = []): Array<[string, string]> =>
  Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'string'
      ? [[[...path, key].join('.'), value]]
      : entries(value, [...path, key]),
  )

const luminance = (hex: string) => {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)!
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4,
    )

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

const contrast = (first: string, second: string) => {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a)
  return (lighter + 0.05) / (darker + 0.05)
}

describe('canonical color system', () => {
  it('exports every documented role group', () => {
    expect(Object.keys(colorTokens)).toEqual([
      'interaction',
      'neutral',
      'semantic',
      'visualization',
      'decorative',
    ])
  })

  it('uses normalized uppercase six-digit hex values and feature-neutral role names', () => {
    const tokenEntries = entries(colorTokens)
    const paths = tokenEntries.map(([path]) => path)

    expect(new Set(paths).size).toBe(paths.length)
    expect(tokenEntries.length).toBeGreaterThan(30)
    for (const [path, value] of tokenEntries) {
      expect(value, path).toMatch(/^#[0-9A-F]{6}$/)
      expect(path).not.toMatch(/k1|partnership|estate|report|jackson/i)
    }
  })

  it('keeps interaction roles separate from semantic, visualization, and decorative roles', () => {
    expect(colorTokens.interaction).toMatchObject({
      primary: '#14532D',
      primaryHover: '#0F3D22',
      primaryActive: '#0F2A1E',
      primaryForeground: '#FFFFFF',
      focus: '#166534',
      subtle: '#F2F6F3',
      subtleHover: '#E6EDE8',
      inverseBackground: '#FFFFFF',
      inverseForeground: '#14532D',
    })
    expect(Object.keys(colorTokens.interaction)).not.toContain('success')
    expect(Object.keys(colorTokens.interaction)).not.toContain('gold')
  })

  it.each([
    ['primary', '#14532D', '#FFFFFF', 4.5],
    ['primary hover', '#0F3D22', '#FFFFFF', 4.5],
    ['primary active', '#0F2A1E', '#FFFFFF', 4.5],
    ['focus', '#166534', '#FFFFFF', 3],
    ['primary text', '#17263A', '#FFFFFF', 4.5],
    ['secondary text', '#3E5169', '#FFFFFF', 4.5],
    ['muted text', '#5F7185', '#FFFFFF', 4.5],
    ['control border', '#64748B', '#FFFFFF', 3],
    ['danger', '#B91C1C', '#FFFFFF', 4.5],
  ])('%s meets its WCAG contrast floor', (_name, foreground, background, floor) => {
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(floor)
  })
})
