import { describe, expect, it } from 'vitest'
import { colorTokens } from '../../design-tokens.js'
import { muiTheme } from './muiTheme'

describe('MUI color bridge', () => {
  it('maps canonical palette roles without introducing a second primary color', () => {
    expect(muiTheme.palette.primary.main).toBe(colorTokens.interaction.primary)
    expect(muiTheme.palette.primary.dark).toBe(colorTokens.interaction.primaryHover)
    expect(muiTheme.palette.primary.contrastText).toBe(colorTokens.interaction.primaryForeground)
    expect(muiTheme.palette.error.main).toBe(colorTokens.semantic.danger.foreground)
    expect(muiTheme.palette.background.default).toBe(colorTokens.neutral.canvas)
    expect(muiTheme.palette.background.paper).toBe(colorTokens.neutral.surface)
    expect(muiTheme.palette.text.primary).toBe(colorTokens.neutral.textPrimary)
    expect(muiTheme.palette.text.secondary).toBe(colorTokens.neutral.textSecondary)
    expect(muiTheme.palette.divider).toBe(colorTokens.neutral.border)
  })

  it('aligns MUI controls with canonical focus, disabled, and state colors', () => {
    const button = muiTheme.components?.MuiButton?.styleOverrides?.root
    const input = muiTheme.components?.MuiOutlinedInput?.styleOverrides?.root
    const choice = muiTheme.components?.MuiCheckbox?.styleOverrides?.root

    expect(JSON.stringify(button)).toContain(colorTokens.interaction.focus)
    expect(JSON.stringify(button)).toContain(colorTokens.interaction.disabledBackground)
    expect(JSON.stringify(input)).toContain(colorTokens.interaction.focus)
    expect(JSON.stringify(choice)).toContain(colorTokens.interaction.primary)
  })
})
