import type { Config } from 'tailwindcss'

// Colors are CSS variables (RGB channels) so a single [data-theme] switch on
// <html> re-themes every existing utility class — including /alpha modifiers —
// with no per-component dark: variants. Channel values live in globals.css.
const v = (name: string) => `rgb(var(${name}) / <alpha-value>)`

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Surface / text scale. Luminance inverts between themes: low numbers
        // are foreground (text), high numbers are background (surface).
        ink: {
          950: v('--ink-950'),
          900: v('--ink-900'),
          800: v('--ink-800'),
          700: v('--ink-700'),
          600: v('--ink-600'),
          500: v('--ink-500'),
          400: v('--ink-400'),
          300: v('--ink-300'),
          200: v('--ink-200'),
          100: v('--ink-100'),
          50: v('--ink-50'),
        },
        run: {
          DEFAULT: v('--run'), // PASS / success semantic
          dark: v('--run-dark'),
        },
        // Single interactive accent. Action Blue on light, Sky Blue on dark.
        action: {
          DEFAULT: v('--action'),
          deep: v('--action-deep'),
          focus: v('--action-focus'),
          dark: v('--action-dark'),
        },
        // K-ID age-gate status semantics (tuned per theme for contrast).
        pass: v('--pass'),
        challenge: v('--challenge'),
        prohibited: v('--prohibited'),
        pending: v('--pending'),
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      letterSpacing: {
        apple: '-0.01em',
      },
      boxShadow: {
        panel: '0 1px 0 0 rgba(148,163,184,0.06), 0 12px 32px -12px rgba(0,0,0,0.6)',
        product: 'var(--shadow-product)',
        lift: 'var(--shadow-lift)',
        glow: '0 0 0 1px rgb(var(--action) / 0.45), 0 10px 30px -10px rgb(var(--action) / 0.3)',
      },
      transitionTimingFunction: {
        apple: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        'slide-in': {
          '0%': { opacity: '0', transform: 'translateY(-4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'check-pop': {
          '0%': { transform: 'scale(0)' },
          '60%': { transform: 'scale(1.18)' },
          '100%': { transform: 'scale(1)' },
        },
        'ring-fade': {
          '0%': { boxShadow: '0 0 0 0 rgb(var(--action) / 0.5)' },
          '100%': { boxShadow: '0 0 0 10px rgb(var(--action) / 0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        pulseDot: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.3' },
        },
      },
      animation: {
        'slide-in': 'slide-in 220ms cubic-bezier(0.16,1,0.3,1)',
        'fade-up': 'fade-up 360ms cubic-bezier(0.16,1,0.3,1) both',
        'scale-in': 'scale-in 200ms cubic-bezier(0.16,1,0.3,1) both',
        'check-pop': 'check-pop 300ms cubic-bezier(0.16,1,0.3,1)',
        'ring-fade': 'ring-fade 1.3s ease-out',
        shimmer: 'shimmer 1.5s infinite',
        'pulse-dot': 'pulseDot 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}

export default config
