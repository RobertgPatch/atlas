import { colorTokens } from './design-tokens.js'

const { interaction, neutral, semantic, visualization, decorative } = colorTokens

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        serif: ['"Playfair Display"', 'serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      colors: {
        primary: {
          DEFAULT: interaction.primary,
          hover: interaction.primaryHover,
          active: interaction.primaryActive,
          foreground: interaction.primaryForeground,
          subtle: interaction.subtle,
          'subtle-hover': interaction.subtleHover,
        },
        focus: interaction.focus,
        inverse: {
          background: interaction.inverseBackground,
          foreground: interaction.inverseForeground,
        },
        disabled: {
          background: interaction.disabledBackground,
          foreground: interaction.disabledForeground,
        },
        canvas: neutral.canvas,
        surface: {
          DEFAULT: neutral.surface,
          subtle: neutral.surfaceSubtle,
        },
        content: {
          primary: neutral.textPrimary,
          secondary: neutral.textSecondary,
          muted: neutral.textMuted,
        },
        success: {
          DEFAULT: semantic.success.foreground,
          light: semantic.success.background,
        },
        warning: {
          DEFAULT: semantic.warning.foreground,
          light: semantic.warning.background,
        },
        error: {
          DEFAULT: semantic.danger.foreground,
          light: semantic.danger.background,
          hover: semantic.danger.hover,
          active: semantic.danger.active,
        },
        info: {
          DEFAULT: semantic.info.foreground,
          light: semantic.info.background,
        },
        gray: {
          50: '#F9FAFB',
          100: '#F3F4F6',
          200: '#E5E7EB',
          300: '#D1D5DB',
          400: '#9CA3AF',
          500: '#6B7280',
          600: '#4B5563',
          700: '#374151',
          800: '#1F2937',
          900: '#111827',
          950: '#0a0a0a',
        },
        background: neutral.canvas,
        border: {
          DEFAULT: neutral.border,
          subtle: neutral.surfaceSubtle,
          control: neutral.controlBorder,
        },
        text: {
          primary: neutral.textPrimary,
          secondary: neutral.textSecondary,
          tertiary: neutral.textMuted,
        },
        status: {
          uploaded: { bg: '#EEF0F4', text: '#4A5568' },
          processing: { bg: '#EBF0F9', text: '#1E3A5F' },
          review: { bg: '#FEF3E2', text: '#92600A' },
          approval: { bg: '#E8F4F0', text: '#1B6B4D' },
          finalized: { bg: '#E6F0E8', text: '#2D6A3F' },
          error: { bg: '#FEE9E7', text: '#9B2C2C' },
        },
        visualization,
        decorative: {
          'brand-accent': decorative.brandAccent,
          'brand-accent-soft': decorative.brandAccentSoft,
        },
      },
      fontSize: {
        kpi: ['28px', { lineHeight: '1.2', fontWeight: '600' }],
      },
      boxShadow: {
        sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        DEFAULT: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
        md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        card: '0 1px 2px 0 rgba(0, 0, 0, 0.04)',
        'card-hover': '0 1px 4px 0 rgba(0, 0, 0, 0.08)',
      },
      borderRadius: {
        card: '6px',
      },
    },
  },
}
