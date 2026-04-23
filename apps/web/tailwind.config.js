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
      },
      colors: {
        atlas: {
          gold: '#C9A96E',
          hover: '#B39359',
          light: '#FDFBF7',
        },
        success: {
          DEFAULT: '#059669',
          light: '#D1FAE5',
        },
        warning: {
          DEFAULT: '#D97706',
          light: '#FEF3C7',
        },
        error: {
          DEFAULT: '#DC2626',
          light: '#FEE2E2',
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
        // Keep old tokens so K1Dashboard still compiles
        accent: {
          DEFAULT: '#1E3A5F',
          light: '#E8EDF3',
          hover: '#162D4A',
        },
        surface: '#FFFFFF',
        background: '#F8F9FA',
        border: {
          DEFAULT: '#E5E7EB',
          subtle: '#F0F1F3',
        },
        text: {
          primary: '#1A1D21',
          secondary: '#5F6368',
          tertiary: '#8C9196',
        },
        status: {
          uploaded: { bg: '#EEF0F4', text: '#4A5568' },
          processing: { bg: '#EBF0F9', text: '#1E3A5F' },
          review: { bg: '#FEF3E2', text: '#92600A' },
          approval: { bg: '#E8F4F0', text: '#1B6B4D' },
          finalized: { bg: '#E6F0E8', text: '#2D6A3F' },
          error: { bg: '#FEE9E7', text: '#9B2C2C' },
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
