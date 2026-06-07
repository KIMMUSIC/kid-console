'use client'

import React from 'react'
import QRCode from 'qrcode'
import type { AccessAgeVerificationResponse, VerificationStatusResponse } from '@/lib/types'
import type { FlowInputs } from './FlowPanel'
import { Badge, CopyButton, MethodBadge, ageGateStatusColor } from './ui'

export interface AccessFlowState {
  accessAv: AccessAgeVerificationResponse | null
  verificationStatus: VerificationStatusResponse | null
  errors: Record<string, string | undefined>
}

export default function AgeVerificationFlow({
  inputs,
  state,
  loadingStep,
  testMode,
  verificationSimulated,
  onStart,
  onPollStatus,
  onSimulateVerification,
}: {
  inputs: FlowInputs
  state: AccessFlowState
  loadingStep: string | null
  testMode: boolean
  verificationSimulated: boolean
  onStart: () => void
  onPollStatus: () => void
  onSimulateVerification: () => void
}) {
  const criteriaOk =
    inputs.criteriaMode === 'age' ? Boolean(inputs.criteriaAge) : Boolean(inputs.criteriaCategory)
  const canStart = Boolean(inputs.jurisdiction) && criteriaOk
  const av = state.accessAv

  return (
    <section className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-2 border-b border-ink-700/70 px-4 py-3">
        <h2 className="font-mono text-sm font-semibold text-ink-50">AgeKit+ Access Age Verification</h2>
        <span className="font-mono text-[11px] text-ink-500">perform → verify → get-status</span>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        <GroupHeader
          title="Access Age Verification"
          desc="Standalone AgeKit+ verification (face / ID / etc). Returns its own request id and status — independent of the CDK age gate."
        />

        {/* Step 1 — perform-access-age-verification */}
        <StepCard
          index={1}
          method="POST"
          endpoint="age-verification/perform-access-age-verification"
          title="Create the verification request"
          desc="Returns { id, url, shortUrl }. The url hosts the AgeKit+ waterfall; shortUrl is QR-friendly."
          enabled={canStart}
          disabledHint={!canStart ? 'Set jurisdiction and verification criteria (left)' : undefined}
          running={loadingStep === 'access-av'}
          done={Boolean(av)}
          error={state.errors['access-av']}
          runLabel="Send"
          onRun={onStart}
        >
          {av && <VerificationTarget av={av} />}
        </StepCard>

        {/* Test helper — simulate the verification result */}
        {testMode && av?.id && (
          <div className="rounded-lg border border-dashed border-pending/40 bg-pending/5 p-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-pending/50 font-mono text-[10px] font-bold text-pending">
                TEST
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-[13.5px] font-semibold text-ink-50">Simulate verification result</h3>
                  <MethodBadge method="POST" />
                  <span className="font-mono text-[11px] text-ink-500">test/set-age-verification-status</span>
                </div>
                <p className="mt-1 text-[12.5px] leading-relaxed text-ink-400">
                  TEST mode only. Marks the request PASS (age 18+, age-estimation) without completing the
                  hosted flow, so you can reach step 2&apos;s result immediately.
                </p>
                {verificationSimulated && (
                  <p className="mt-1.5 font-mono text-[11.5px] text-run">
                    Verified (simulated) — now get status →
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={onSimulateVerification}
                disabled={loadingStep === 'sim-verify'}
                className="shrink-0 cursor-pointer rounded-md border border-pending/50 bg-pending/10 px-3 py-1.5 font-mono text-[12px] font-semibold text-pending transition-colors duration-200 hover:bg-pending/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loadingStep === 'sim-verify' ? '…' : 'Simulate PASS'}
              </button>
            </div>
          </div>
        )}

        {/* Step 2 — get-status */}
        <StepCard
          index={2}
          method="GET"
          endpoint="age-verification/get-status"
          title="Poll the verification result"
          desc="PENDING / IN_PROGRESS until the user finishes, then PASS or FAIL with the method and verified age range."
          enabled={Boolean(av?.id)}
          disabledHint={!av?.id ? 'Run step 1 first' : undefined}
          running={loadingStep === 'verify-status'}
          done={Boolean(state.verificationStatus)}
          error={state.errors['verify-status']}
          runLabel="Get status"
          onRun={onPollStatus}
        >
          {state.verificationStatus && <VerificationStatusResult data={state.verificationStatus} />}
        </StepCard>
      </div>
    </section>
  )
}

// ── verification target: iframe + QR + link ──────────────────────────────────

function VerificationTarget({ av }: { av: AccessAgeVerificationResponse }) {
  const [view, setView] = React.useState<'qr' | 'iframe'>('qr')
  const [qr, setQr] = React.useState<string | null>(null)

  React.useEffect(() => {
    let alive = true
    QRCode.toDataURL(av.shortUrl || av.url, { margin: 1, width: 220, color: { dark: '#0F172A', light: '#F8FAFC' } })
      .then((d) => alive && setQr(d))
      .catch(() => alive && setQr(null))
    return () => {
      alive = false
    }
  }, [av.shortUrl, av.url])

  return (
    <div className="space-y-3 rounded-md border border-ink-700/60 bg-ink-950/40 p-3">
      <Detail label="id" value={av.id} mono copy />

      <div className="flex gap-1 border-b border-ink-700/70">
        <TabBtn active={view === 'qr'} onClick={() => setView('qr')}>
          QR / link
        </TabBtn>
        <TabBtn active={view === 'iframe'} onClick={() => setView('iframe')}>
          iframe
        </TabBtn>
      </div>

      {view === 'qr' ? (
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qr}
              alt="QR code to open the verification on a phone"
              width={160}
              height={160}
              className="h-40 w-40 shrink-0 rounded-md bg-ink-50 p-1"
            />
          ) : (
            <div className="grid h-40 w-40 shrink-0 place-items-center rounded-md border border-ink-700 font-mono text-[11px] text-ink-500">
              QR…
            </div>
          )}
          <div className="min-w-0 flex-1 space-y-2">
            <p className="font-mono text-[11px] text-ink-500">
              Scan to verify on a phone, or open directly:
            </p>
            <a
              href={av.shortUrl}
              target="_blank"
              rel="noreferrer"
              className="block cursor-pointer break-all rounded border border-ink-700 px-2 py-1.5 font-mono text-[11.5px] text-pending transition-colors hover:border-ink-600 hover:text-pending"
            >
              {av.shortUrl} ↗
            </a>
            <div className="flex items-center gap-2">
              <a
                href={av.url}
                target="_blank"
                rel="noreferrer"
                className="cursor-pointer font-mono text-[11px] text-ink-400 underline-offset-2 hover:text-ink-200 hover:underline"
              >
                full url ↗
              </a>
              <CopyButton getText={() => av.url} label="Copy url" />
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <div className="overflow-hidden rounded-md border border-ink-700/70 bg-white">
            <iframe
              title="k-ID AgeKit+ verification"
              src={av.url}
              className="h-[480px] w-full"
              allow="camera; microphone; payment; publickey-credentials-get *; publickey-credentials-create *"
            />
          </div>
          <p className="font-mono text-[11px] text-ink-500">
            After the user finishes, run step 2 to read the authoritative result.
          </p>
        </div>
      )}
    </div>
  )
}

function VerificationStatusResult({ data }: { data: VerificationStatusResponse }) {
  const range =
    data.age && (data.age.low != null || data.age.high != null)
      ? `${data.age.low ?? '?'}–${data.age.high ?? '?'}`
      : null
  return (
    <div className="space-y-2 rounded-md border border-ink-700/60 bg-ink-950/40 p-3">
      <div className="flex items-center gap-3">
        <span className={`font-mono text-base font-bold ${ageGateStatusColor(data.status)}`}>
          {data.status}
        </span>
        {data.method && (
          <Badge className="border-ink-700 bg-ink-800 text-ink-300">{data.method}</Badge>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 font-mono text-[11.5px]">
        {range && <Mini label="age range" value={range} />}
        {data.ageCategory && <Mini label="ageCategory" value={data.ageCategory} />}
      </div>
      {data.failureReason && (
        <p className="font-mono text-[12px] text-prohibited">failureReason: {data.failureReason}</p>
      )}
      {(data.status === 'PENDING' || data.status === 'IN_PROGRESS') && (
        <p className="font-mono text-[11px] text-ink-500">
          User has not finished verifying. Poll again after they complete the flow.
        </p>
      )}
    </div>
  )
}

// ── shared bits (local to keep this flow self-contained) ─────────────────────

function GroupHeader({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-1 h-3 w-1 shrink-0 rounded-full bg-pending" />
      <div>
        <h3 className="font-mono text-[11px] font-bold uppercase tracking-wider text-pending">{title}</h3>
        <p className="mt-0.5 text-[11.5px] leading-snug text-ink-500">{desc}</p>
      </div>
    </div>
  )
}

function StepCard({
  index,
  method,
  endpoint,
  title,
  desc,
  enabled,
  disabledHint,
  running,
  done,
  error,
  runLabel,
  onRun,
  children,
}: {
  index: number
  method: string
  endpoint: string
  title: string
  desc: string
  enabled: boolean
  disabledHint?: string
  running: boolean
  done: boolean
  error?: string
  runLabel: string
  onRun: () => void
  children?: React.ReactNode
}) {
  const stateColor = error
    ? 'border-prohibited/50 text-prohibited'
    : done
      ? 'border-run/50 text-run'
      : enabled
        ? 'border-ink-600 text-ink-300'
        : 'border-ink-800 text-ink-600'
  return (
    <div
      className={`rounded-lg border bg-ink-900/60 p-4 transition-colors duration-200 ${
        error ? 'border-prohibited/40' : done ? 'border-run/30' : 'border-ink-700/70'
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border font-mono text-[12px] font-bold ${stateColor}`}
        >
          {done && !error ? '✓' : index}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[13.5px] font-semibold text-ink-50">{title}</h3>
            <MethodBadge method={method} />
            <span className="font-mono text-[11px] text-ink-500">{endpoint}</span>
          </div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-400">{desc}</p>
        </div>
        <button
          type="button"
          onClick={onRun}
          disabled={!enabled || running}
          title={!enabled ? disabledHint : undefined}
          className="shrink-0 cursor-pointer rounded-md bg-run px-3 py-1.5 font-mono text-[12px] font-semibold text-ink-950 transition-colors duration-200 hover:bg-run-dark disabled:cursor-not-allowed disabled:bg-ink-700 disabled:text-ink-400"
        >
          {running ? '…' : runLabel}
        </button>
      </div>
      {!enabled && disabledHint && (
        <p className="mt-2 pl-10 font-mono text-[11px] text-ink-600">{disabledHint}</p>
      )}
      {error && (
        <div className="mt-3 rounded-md border border-prohibited/40 bg-prohibited/10 px-3 py-2 font-mono text-[12px] text-prohibited">
          {error}
        </div>
      )}
      {children && <div className="mt-3">{children}</div>}
    </div>
  )
}

function TabBtn({
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
        active ? 'border-run text-ink-50' : 'border-transparent text-ink-500 hover:text-ink-200'
      }`}
    >
      {children}
    </button>
  )
}

function Detail({
  label,
  value,
  mono,
  copy,
}: {
  label: string
  value: string
  mono?: boolean
  copy?: boolean
}) {
  return (
    <div>
      <p className="mb-0.5 font-mono text-[11px] text-ink-500">{label}</p>
      <div className="flex items-center gap-2">
        <p className={`break-all text-[12.5px] text-ink-100 ${mono ? 'font-mono' : ''}`}>{value}</p>
        {copy && <CopyButton getText={() => value} />}
      </div>
    </div>
  )
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-ink-800 bg-ink-950/40 px-2 py-1 font-mono">
      <span className="block text-ink-500">{label}</span>
      <span className="block break-all text-ink-100">{value}</span>
    </div>
  )
}
