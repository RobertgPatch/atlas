const ENABLED_FLAG_VALUES = new Set(['1', 'true', 'yes', 'on'])

export function parseFeatureFlag(value: boolean | string | null | undefined) {
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return false

  return ENABLED_FLAG_VALUES.has(value.trim().toLowerCase())
}

export const featureFlags = Object.freeze({
  magicPatternDesigns: parseFeatureFlag(
    import.meta.env.VITE_MAGIC_PATTERN_DESIGNS as string | undefined,
  ),
})
