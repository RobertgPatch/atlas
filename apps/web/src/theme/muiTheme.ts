import { createTheme } from '@mui/material/styles'
import { colorTokens } from '../../design-tokens.js'

const { interaction, neutral, semantic } = colorTokens

export const muiTheme = createTheme({
  palette: {
    primary: {
      main: interaction.primary,
      dark: interaction.primaryHover,
      contrastText: interaction.primaryForeground,
    },
    error: {
      main: semantic.danger.foreground,
      dark: semantic.danger.hover,
      contrastText: interaction.primaryForeground,
    },
    background: {
      default: neutral.canvas,
      paper: neutral.surface,
    },
    text: {
      primary: neutral.textPrimary,
      secondary: neutral.textSecondary,
      disabled: interaction.disabledForeground,
    },
    divider: neutral.border,
    action: {
      disabled: interaction.disabledForeground,
      disabledBackground: interaction.disabledBackground,
      hover: interaction.subtle,
      selected: interaction.subtleHover,
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          '&:focus-visible': {
            outline: `2px solid ${interaction.focus}`,
            outlineOffset: 2,
          },
          '&.Mui-disabled': {
            backgroundColor: interaction.disabledBackground,
            color: interaction.disabledForeground,
          },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: neutral.controlBorder,
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: interaction.focus,
            borderWidth: 2,
          },
        },
      },
    },
    MuiCheckbox: {
      styleOverrides: {
        root: {
          color: neutral.controlBorder,
          '&.Mui-checked': { color: interaction.primary },
          '&:focus-visible': {
            outline: `2px solid ${interaction.focus}`,
            outlineOffset: 2,
          },
        },
      },
    },
    MuiRadio: {
      styleOverrides: {
        root: {
          color: neutral.controlBorder,
          '&.Mui-checked': { color: interaction.primary },
          '&:focus-visible': {
            outline: `2px solid ${interaction.focus}`,
            outlineOffset: 2,
          },
        },
      },
    },
  },
})
