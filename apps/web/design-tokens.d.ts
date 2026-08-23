export type SemanticTone = Readonly<{
  foreground: string
  background: string
  border: string
  hover?: string
  active?: string
}>

export const interaction: Readonly<{
  primary: string
  primaryHover: string
  primaryActive: string
  primaryForeground: string
  focus: string
  subtle: string
  subtleHover: string
  inverseBackground: string
  inverseForeground: string
  disabledBackground: string
  disabledForeground: string
}>

export const neutral: Readonly<{
  canvas: string
  surface: string
  surfaceSubtle: string
  border: string
  controlBorder: string
  textPrimary: string
  textSecondary: string
  textMuted: string
}>

export const semantic: Readonly<{
  success: SemanticTone
  warning: SemanticTone
  danger: SemanticTone
  info: SemanticTone
}>

export const visualization: Readonly<Record<
  'seriesOne' | 'seriesTwo' | 'seriesThree' | 'seriesFour' | 'seriesFive' | 'seriesSix' | 'mapLand' | 'mapBoundary',
  string
>>

export const decorative: Readonly<{
  brandAccent: string
  brandAccentSoft: string
}>

export const colorTokens: Readonly<{
  interaction: typeof interaction
  neutral: typeof neutral
  semantic: typeof semantic
  visualization: typeof visualization
  decorative: typeof decorative
}>

export default colorTokens
