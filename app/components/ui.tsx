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

// ── badges ───────────────────────────────────────────────────────────────────

export function Badge({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wide ${className}`}
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

// ── JSON viewer ──────────────────────────────────────────────────────────────

export function JsonView({ value }: { value: unknown }) {
  const text =
    typeof value === 'string' ? value : value == null ? 'null' : JSON.stringify(value, null, 2)
  return (
    <pre className="overflow-x-auto rounded-md bg-ink-950/70 p-3 font-mono text-[12px] leading-relaxed text-ink-100 ring-1 ring-inset ring-ink-700/60">
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
    <div className="overflow-hidden rounded-md ring-1 ring-inset ring-ink-700/60">
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
      className="cursor-pointer rounded border border-ink-700 px-2 py-0.5 font-mono text-[11px] text-ink-300 transition-colors duration-200 hover:border-ink-600 hover:text-ink-50"
    >
      {copied ? 'Copied' : label}
    </button>
  )
}
