'use client'

import React from 'react'
import type { HttpExchange } from '@/lib/types'
import {
  CopyButton,
  HeaderTable,
  JsonView,
  MethodBadge,
  StatusBadge,
  formatClock,
  formatDuration,
} from './ui'

const HOP_META: Record<HttpExchange['hop'], { dot: string; ring: string; label: string }> = {
  'browser->proxy': { dot: 'bg-pending', ring: 'ring-pending/30', label: 'Browser → Proxy' },
  'proxy->kid': { dot: 'bg-run', ring: 'ring-run/30', label: 'Proxy → k-ID' },
  webhook: { dot: 'bg-challenge', ring: 'ring-challenge/30', label: 'k-ID → Webhook' },
}

function ExchangeRow({ ex, defaultOpen }: { ex: HttpExchange; defaultOpen?: boolean }) {
  const [open, setOpen] = React.useState(Boolean(defaultOpen))
  const [tab, setTab] = React.useState<'req' | 'res'>('res')
  const meta = HOP_META[ex.hop]
  const path = (() => {
    try {
      const u = new URL(ex.request.url, 'http://x')
      return u.pathname + u.search
    } catch {
      return ex.request.url
    }
  })()

  return (
    <li className="animate-slide-in">
      <div className="relative pl-6">
        {/* timeline dot */}
        <span
          className={`absolute left-[5px] top-[10px] h-2.5 w-2.5 rounded-full ${meta.dot} ring-4 ${meta.ring}`}
        />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="group flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors duration-200 hover:bg-ink-800/60"
        >
          <span className="font-mono text-[10px] uppercase tracking-wider text-ink-500">
            {meta.label}
          </span>
          <MethodBadge method={ex.request.method} />
          {ex.response ? (
            <StatusBadge status={ex.response.status} />
          ) : (
            <StatusBadge status={0} statusText="ERR" />
          )}
          <span className="truncate font-mono text-[12px] text-ink-200">{ex.title}</span>
          <span className="ml-auto whitespace-nowrap font-mono text-[11px] text-ink-500">
            {formatDuration(ex.durationMs)}
          </span>
          <svg
            className={`h-3.5 w-3.5 shrink-0 text-ink-500 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M7.21 14.77a.75.75 0 01.02-1.06L10.94 10 7.23 6.29a.75.75 0 111.04-1.08l4.25 4.25a.75.75 0 010 1.08l-4.25 4.25a.75.75 0 01-1.06-.02z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        {open && (
          <div className="mb-2 ml-2 space-y-3 rounded-lg border border-ink-700/70 bg-ink-900/60 p-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-ink-400">
              <span className="text-ink-500">{formatClock(ex.startedAt)}</span>
              <span className="break-all text-ink-300">{path}</span>
              <span className="ml-auto">
                <CopyButton getText={() => JSON.stringify(ex, null, 2)} label="Copy exchange" />
              </span>
            </div>

            {ex.error && (
              <div className="rounded-md border border-prohibited/40 bg-prohibited/10 px-3 py-2 font-mono text-[12px] text-prohibited">
                {ex.error}
              </div>
            )}

            <div className="flex gap-1 border-b border-ink-700/70">
              <TabButton active={tab === 'res'} onClick={() => setTab('res')}>
                Response
              </TabButton>
              <TabButton active={tab === 'req'} onClick={() => setTab('req')}>
                Request
              </TabButton>
            </div>

            {tab === 'req' ? (
              <div className="space-y-2">
                <SectionLabel>Request URL</SectionLabel>
                <p className="break-all font-mono text-[12px] text-ink-100">
                  <span className="text-ink-500">{ex.request.method} </span>
                  {ex.request.url}
                </p>
                <SectionLabel>Request Headers</SectionLabel>
                <HeaderTable headers={ex.request.headers} />
                {ex.request.body != null && (
                  <>
                    <SectionLabel>Request Body</SectionLabel>
                    <JsonView value={ex.request.body} />
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {ex.response ? (
                  <>
                    <SectionLabel>Response Headers</SectionLabel>
                    <HeaderTable headers={ex.response.headers} />
                    <SectionLabel>Response Body</SectionLabel>
                    <JsonView value={ex.response.body} />
                  </>
                ) : (
                  <p className="font-mono text-[12px] text-ink-500">— no response received —</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </li>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`cursor-pointer border-b-2 px-3 py-1 font-mono text-[12px] transition-colors duration-200 ${
        active
          ? 'border-run text-ink-50'
          : 'border-transparent text-ink-500 hover:text-ink-200'
      }`}
    >
      {children}
    </button>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-500">
      {children}
    </p>
  )
}

export default function InspectorPanel({
  exchanges,
  onClear,
}: {
  exchanges: HttpExchange[]
  onClear: () => void
}) {
  const latestId = exchanges.length > 0 ? exchanges[0].id : null

  return (
    <section className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-2 border-b border-ink-700/70 px-4 py-3">
        <h2 className="font-mono text-sm font-semibold text-ink-50">HTTP Inspector</h2>
        <span className="rounded bg-ink-800 px-1.5 py-0.5 font-mono text-[11px] text-ink-400">
          {exchanges.length}
        </span>
        <div className="ml-auto flex items-center gap-3">
          <LegendDot className="bg-pending" label="browser→proxy" />
          <LegendDot className="bg-run" label="proxy→k-ID" />
          <LegendDot className="bg-challenge" label="webhook" />
          <button
            type="button"
            onClick={onClear}
            disabled={exchanges.length === 0}
            className="cursor-pointer rounded border border-ink-700 px-2 py-0.5 font-mono text-[11px] text-ink-300 transition-colors duration-200 hover:border-ink-600 hover:text-ink-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Clear
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        {exchanges.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="font-mono text-[13px] text-ink-400">No traffic captured yet.</p>
            <p className="max-w-xs text-[13px] leading-relaxed text-ink-500">
              Run a flow on the left. Every hop — browser → proxy → k-ID and back, plus inbound
              webhooks — appears here with full headers and JSON bodies.
            </p>
          </div>
        ) : (
          <ol className="relative space-y-0.5 before:absolute before:bottom-2 before:left-[10px] before:top-2 before:w-px before:bg-ink-700/60">
            {exchanges.map((ex) => (
              <ExchangeRow key={ex.id} ex={ex} defaultOpen={ex.id === latestId} />
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="hidden items-center gap-1 font-mono text-[10px] text-ink-500 lg:inline-flex">
      <span className={`h-2 w-2 rounded-full ${className}`} />
      {label}
    </span>
  )
}
