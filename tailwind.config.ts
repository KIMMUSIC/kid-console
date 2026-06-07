import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Developer-tool dark palette (ui-ux-pro-max: "Code dark + run green")
        ink: {
          950: '#0B1120',
          900: '#0F172A', // background
          800: '#1E293B', // panel
          700: '#334155', // border / secondary
          600: '#475569',
          500: '#64748B',
          400: '#94A3B8',
          300: '#CBD5E1',
          100: '#F1F5F9',
          50: '#F8FAFC', // text
        },
        run: {
          DEFAULT: '#22C55E', // CTA / PASS
          dark: '#16A34A',
        },
        // K-ID age-gate status semantics
        pass: '#22C55E',
        challenge: '#F59E0B',
        prohibited: '#EF4444',
        pending: '#38BDF8',
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        panel: '0 1px 0 0 rgba(148,163,184,0.06), 0 12px 32px -12px rgba(0,0,0,0.6)',
      },
      keyframes: {
        'slide-in': {
          '0%': { opacity: '0', transform: 'translateY(-4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseDot: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.3' },
        },
      },
      animation: {
        'slide-in': 'slide-in 200ms ease-out',
        'pulse-dot': 'pulseDot 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}

export default config
