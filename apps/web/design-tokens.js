/**
 * Canonical application color tokens.
 *
 * Keep this dependency-free ESM module consumable by Tailwind, browser code,
 * MUI, tests, and governance scripts. Feature code should consume semantic
 * utility aliases or shared recipes instead of importing raw values.
 */
export const interaction = Object.freeze({
  primary: '#14532D',
  primaryHover: '#0F3D22',
  primaryActive: '#0F2A1E',
  primaryForeground: '#FFFFFF',
  focus: '#166534',
  subtle: '#F2F6F3',
  subtleHover: '#E6EDE8',
  inverseBackground: '#FFFFFF',
  inverseForeground: '#14532D',
  disabledBackground: '#E2E8F0',
  disabledForeground: '#64748B',
})

export const neutral = Object.freeze({
  canvas: '#F4F7FA',
  surface: '#FFFFFF',
  surfaceSubtle: '#F8FAFC',
  border: '#DAE2EC',
  controlBorder: '#64748B',
  textPrimary: '#17263A',
  textSecondary: '#3E5169',
  textMuted: '#5F7185',
})

export const semantic = Object.freeze({
  success: Object.freeze({ foreground: '#047857', background: '#ECFDF5', border: '#047857' }),
  warning: Object.freeze({ foreground: '#92400E', background: '#FFFBEB', border: '#92400E' }),
  danger: Object.freeze({
    foreground: '#B91C1C',
    background: '#FEF2F2',
    border: '#B91C1C',
    hover: '#991B1B',
    active: '#7F1D1D',
  }),
  info: Object.freeze({ foreground: '#1D4ED8', background: '#EFF6FF', border: '#1D4ED8' }),
})

export const visualization = Object.freeze({
  seriesOne: '#2563EB',
  seriesTwo: '#7C3AED',
  seriesThree: '#0891B2',
  seriesFour: '#C2410C',
  seriesFive: '#BE185D',
  seriesSix: '#4D7C0F',
  mapLand: '#D6E4D8',
  mapBoundary: '#315C3B',
})

export const decorative = Object.freeze({
  brandAccent: '#C9A96E',
  brandAccentSoft: '#FDFBF7',
})

export const colorTokens = Object.freeze({
  interaction,
  neutral,
  semantic,
  visualization,
  decorative,
})

export default colorTokens
