'use client'

import React from 'react'

type Theme = 'light' | 'dark'

function currentTheme(): Theme {
  if (typeof document === 'undefined') return 'light'
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
}

// Sun/moon pill toggle. Manual only — no prefers-color-scheme auto-detect.
// Persists the choice so it survives reloads (restored pre-paint in layout.tsx).
export default function ThemeToggle() {
  const [theme, setTheme] = React.useState<Theme>('light')

  React.useEffect(() => {
    setTheme(currentTheme())
  }, [])

  function toggle() {
    const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', next)
    try {
      localStorage.setItem('kid-theme', next)
    } catch {
      /* storage unavailable */
    }
    setTheme(next)
  }

  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      onClick={toggle}
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={isDark ? 'Light mode' : 'Dark mode'}
      className="relative inline-flex h-[30px] w-[74px] shrink-0 cursor-pointer items-center rounded-full border border-ink-700 bg-ink-800/60 transition-colors duration-300"
    >
      {/* track icons */}
      <span className="pointer-events-none absolute left-[7px] text-ink-500">
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path strokeLinecap="round" d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" />
        </svg>
      </span>
      <span className="pointer-events-none absolute right-[7px] text-ink-500">
        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />
        </svg>
      </span>
      {/* knob */}
      <span
        className={`relative z-10 grid h-6 w-6 place-items-center rounded-full bg-action text-ink-950 shadow transition-transform duration-300 ease-apple ${
          isDark ? 'translate-x-[46px]' : 'translate-x-[2px]'
        }`}
      >
        {isDark ? (
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />
          </svg>
        ) : (
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="12" cy="12" r="4" />
            <path strokeLinecap="round" d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" />
          </svg>
        )}
      </span>
    </button>
  )
}
