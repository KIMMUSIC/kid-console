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
          DEFAULT: '#22C55E', // PASS / success semantic
          dark: '#16A34A',
        },
        // DESIGN.md single interactive accent. On our dark canvas we use Sky Link
        // Blue (#2997ff, DESIGN.md primary-on-dark) so the accent never disappears.
        action: {
          DEFAULT: '#2997ff', // interactive on dark
          deep: '#0066cc', // Action Blue, for light chips only
          focus: '#0071e3', // keyboard focus ring
          dark: '#1a86f0', // pressed
        },
        // K-ID age-gate status semantics
        pass: '#22C55E',
        challenge: '#F59E0B',
        prohibited: '#EF4444',
        pending: '#38BDF8',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      letterSpacing: {
        apple: '-0.01em', // DESIGN.md: nudge Inter tighter at display sizes
      },
      boxShadow: {
        panel: '0 1px 0 0 rgba(148,163,184,0.06), 0 12px 32px -12px rgba(0,0,0,0.6)',
        // DESIGN.md: exactly one product-weight shadow.
        product: 'rgba(0, 0, 0, 0.22) 3px 5px 30px 0px',
        glow: '0 0 0 1px rgba(41,151,255,0.45), 0 10px 30px -10px rgba(41,151,255,0.3)',
      },
      transitionTimingFunction: {
        apple: 'cubic-bezier(0.16, 1, 0.3, 1)', // easeOutExpo — the journey feel
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
          '0%': { boxShadow: '0 0 0 0 rgba(41,151,255,0.5)' },
          '100%': { boxShadow: '0 0 0 10px rgba(41,151,255,0)' },
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
