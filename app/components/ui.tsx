'use client'

import React from 'react'

// ── small style helpers ──────────────────────────────────────────────────────

export function methodClasses(method: string): string {
  switch (method.toUpperCase()) {
    case 'GET':
      return 'text-pending border-pending/40 bg-pending/10'
    case 'POST':
      return 'text-run border-run/40 bg-run/10'
    case 'PUT':
    case 'PATCH':
      return 'text-challenge border-challenge/40 bg-challenge/10'
    case 'DELETE':
      return 'text-prohibited border-prohibited/40 bg-prohibited/10'
    default:
      return 'text-ink-300 border-ink-700 bg-ink-800'
  }
}

export function statusClasses(status: number): string {
  if (status === 0) return 'text-prohibited border-prohibited/40 bg-prohibited/10'
  if (status >= 500) return 'text-prohibited border-prohibited/40 bg-prohibited/10'
  if (status >= 400) return 'text-challenge border-challenge/40 bg-challenge/10'
  if (status >= 300) return 'text-pending border-pending/40 bg-pending/10'
  if (status >= 200) return 'text-run border-run/40 bg-run/10'
  return 'text-ink-300 border-ink-700 bg-ink-800'
}

export function ageGateStatusColor(status?: string): string {
  switch (status) {
    case 'PASS':
      return 'text-pass'
    case 'CHALLENGE':
      return 'text-challenge'
    case 'PROHIBITED':
      return 'text-prohibited'
    case 'PENDING':
    case 'IN_PROGRESS':
      return 'text-pending'
    case 'FAIL':
      return 'text-prohibited'
    default:
      return 'text-ink-300'
  }
}

export function formatDuration(ms: number): string {
  if (ms < 1) return '<1ms'
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

export function formatClock(iso: string): string {
  const d = new Date(iso)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  const mmm = String(d.getMilliseconds()).padStart(3, '0')
  return `${hh}:${mm}:${ss}.${mmm}`
}

// ── badges (pill grammar per DESIGN.md) ──────────────────────────────────────

export function Badge({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10.5px] font-semibold uppercase tracking-wide ${className}`}
    >
      {children}
    </span>
  )
}

export function MethodBadge({ method }: { method: string }) {
  return <Badge className={methodClasses(method)}>{method}</Badge>
}

export function StatusBadge({ status, statusText }: { status: number; statusText?: string }) {
  return (
    <Badge className={statusClasses(status)}>
      {status === 0 ? 'ERR' : status}
      {statusText ? ` ${statusText}` : ''}
    </Badge>
  )
}

// ── interactive primitives ───────────────────────────────────────────────────

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`h-3.5 w-3.5 animate-spin ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-20" cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" />
      <path
        className="opacity-90"
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}

type ActionButtonProps = {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  running?: boolean
  title?: string
  /** primary = blue pill (the action accent); ghost = quiet pill. */
  variant?: 'primary' | 'ghost' | 'amber'
  className?: string
}

/**
 * DESIGN.md action grammar: full pill, single blue accent, scale(0.95) press,
 * focus ring. Used for every "run this step" control so the action signal is
 * consistent across the whole console.
 */
export function ActionButton({
  children,
  onClick,
  disabled,
  running,
  title,
  variant = 'primary',
  className = '',
}: ActionButtonProps) {
  const tones: Record<NonNullable<ActionButtonProps['variant']>, string> = {
    primary:
      'bg-action text-ink-950 hover:bg-action-dark disabled:bg-ink-700 disabled:text-ink-400',
    ghost:
      'border border-ink-600 bg-transparent text-ink-200 hover:border-action/60 hover:text-action disabled:border-ink-800 disabled:text-ink-600',
    amber:
      'border border-pending/50 bg-pending/10 text-pending hover:bg-pending/20 disabled:opacity-50',
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || running}
      title={title}
      className={`inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full px-4 py-1.5 font-mono text-[12px] font-semibold transition-all duration-200 ease-apple active:scale-95 disabled:cursor-not-allowed disabled:active:scale-100 ${tones[variant]} ${className}`}
    >
      {running && <Spinner />}
      {children}
    </button>
  )
}

/** Journey node: a numbered circle that reflects the step's lifecycle. */
export function StepNode({
  index,
  state,
}: {
  index: number
  state: 'locked' | 'ready' | 'running' | 'done' | 'error'
}) {
  const ring =
    state === 'error'
      ? 'border-prohibited/70 text-prohibited bg-prohibited/10'
      : state === 'done'
        ? 'border-pass/60 text-pass bg-pass/10'
        : state === 'running'
          ? 'border-action/70 text-action bg-action/10 animate-ring-fade'
          : state === 'ready'
            ? 'border-action/50 text-action bg-ink-900'
            : 'border-ink-700 text-ink-600 bg-ink-900'
  return (
    <span
      className={`relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full border font-mono text-[12px] font-bold transition-colors duration-300 ${ring}`}
    >
      {state === 'running' ? (
        <Spinner />
      ) : state === 'done' ? (
        <svg
          className="h-4 w-4 animate-check-pop"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 10.5l3.2 3.2L15 7" />
        </svg>
      ) : state === 'error' ? (
        '!'
      ) : (
        index
      )}
    </span>
  )
}

/** Thin journey progress bar that grows with completion. */
export function ProgressBar({
  value,
  total,
  tone = 'action',
}: {
  value: number
  total: number
  tone?: 'action' | 'pass' | 'pending'
}) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0
  const fill =
    tone === 'pass' ? 'bg-pass' : tone === 'pending' ? 'bg-pending' : 'bg-action'
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-ink-800">
      <div
        className={`h-full rounded-full ${fill} transition-[width] duration-500 ease-apple`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

// ── JSON viewer ──────────────────────────────────────────────────────────────

export function JsonView({ value }: { value: unknown }) {
  const text =
    typeof value === 'string' ? value : value == null ? 'null' : JSON.stringify(value, null, 2)
  return (
    <pre className="overflow-x-auto rounded-lg bg-ink-950/70 p-3 font-mono text-[12px] leading-relaxed text-ink-100 ring-1 ring-inset ring-ink-700/60">
      <code>{text}</code>
    </pre>
  )
}

export function HeaderTable({ headers }: { headers: Record<string, string> }) {
  const entries = Object.entries(headers)
  if (entries.length === 0) {
    return <p className="font-mono text-[12px] text-ink-500">— no headers —</p>
  }
  return (
    <div className="overflow-hidden rounded-lg ring-1 ring-inset ring-ink-700/60">
      <table className="w-full border-collapse font-mono text-[12px]">
        <tbody>
          {entries.map(([k, v]) => {
            const redacted = k.toLowerCase() === 'authorization'
            return (
              <tr key={k} className="border-b border-ink-800 last:border-0">
                <td className="w-1/3 whitespace-nowrap bg-ink-950/50 px-2 py-1 align-top text-ink-400">
                  {k}
                </td>
                <td
                  className={`break-all px-2 py-1 align-top ${redacted ? 'text-challenge' : 'text-ink-100'}`}
                >
                  {v}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function CopyButton({ getText, label = 'Copy' }: { getText: () => string; label?: string }) {
  const [copied, setCopied] = React.useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(getText())
          setCopied(true)
          setTimeout(() => setCopied(false), 1200)
        } catch {
          /* clipboard unavailable */
        }
      }}
      className={`inline-flex cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[11px] transition-all duration-200 ease-apple active:scale-95 ${
        copied
          ? 'border-pass/50 bg-pass/10 text-pass'
          : 'border-ink-700 text-ink-300 hover:border-action/50 hover:text-action'
      }`}
    >
      {copied ? (
        <svg
          className="h-3 w-3 animate-check-pop"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 10.5l3.2 3.2L15 7" />
        </svg>
      ) : null}
      {copied ? 'Copied' : label}
    </button>
  )
}
