'use client'

import React from 'react'
import QRCode from 'qrcode'
import type { AccessAgeVerificationResponse, VerificationStatusResponse } from '@/lib/types'
import type { FlowInputs } from './FlowPanel'
import {
  ActionButton,
  Badge,
  CopyButton,
  MethodBadge,
  ProgressRing,
  StepNode,
  ageGateStatusColor,
} from './ui'

export interface AccessFlowState {
  accessAv: AccessAgeVerificationResponse | null
  verificationStatus: VerificationStatusResponse | null
  errors: Record<string, string | undefined>
}

const AGE_PRESETS: [string, string][] = [
  ['Child · 8', '2017-08-15'],
  ['Teen · 14', '2011-08-15'],
  ['Adult · 27', '1998-08-15'],
]

export default function AgeVerificationFlow({
  inputs,
  onChange,
  state,
  loadingStep,
  testMode,
  verificationSimulated,
  onStart,
  onPollStatus,
  onSimulateVerification,
  onHoverStep,
}: {
  inputs: FlowInputs
  onChange: (next: FlowInputs) => void
  state: AccessFlowState
  loadingStep: string | null
  testMode: boolean
  verificationSimulated: boolean
  onStart: () => void
  onPollStatus: () => void
  onSimulateVerification: () => void
  onHoverStep?: (key: string | null) => void
}) {
  const set = <K extends keyof FlowInputs>(key: K, value: FlowInputs[K]) =>
    onChange({ ...inputs, [key]: value })

  const criteriaOk =
    inputs.criteriaMode === 'age' ? Boolean(inputs.criteriaAge) : Boolean(inputs.criteriaCategory)
  const canStart = Boolean(inputs.jurisdiction) && criteriaOk
  const av = state.accessAv

  const doneCount = [state.accessAv, state.verificationStatus].filter(Boolean).length

  return (
    <section className="flex h-full min-h-0 flex-col theme-tx">
      <header className="flex shrink-0 items-center gap-2 border-b border-ink-700/70 px-4 py-3">
        <h2 className="text-sm font-semibold tracking-apple text-ink-50">Journey</h2>
        <span className="font-mono text-[11px] text-ink-500">perform → verify → get-status</span>
        <span className="ml-auto font-mono text-[11px] text-ink-400">{doneCount}/2 steps</span>
      </header>

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-4 py-4">
        <OutcomeHeader state={state} doneCount={doneCount} />

        <GroupHeader
          title="Access Age Verification"
          desc="Standalone AgeKit+ verification (face / ID / etc). Returns its own request id and status — independent of the CDK age gate."
        />

        {/* Step 1 — perform-access-age-verification (with contextual criteria inputs) */}
        <StepCard
          index={1}
          method="POST"
          endpoint="age-verification/perform-access-age-verification"
          title="Create the verification request"
          desc="Returns { id, url, shortUrl }. The url hosts the AgeKit+ waterfall; shortUrl is QR-friendly."
          enabled={canStart}
          disabledHint={!canStart ? 'Set verification criteria below' : undefined}
          running={loadingStep === 'access-av'}
          done={Boolean(av)}
          error={state.errors['access-av']}
          runLabel="Send"
          onRun={onStart}
          onHover={onHoverStep}
          form={
            <CtxForm>
              <CtxField label="Verification criteria" hint="required" badge>
                <div className="mb-2 grid grid-cols-2 gap-1 rounded-full border border-ink-700/70 bg-ink-900/60 p-1">
                  <MiniTab active={inputs.criteriaMode === 'age'} onClick={() => set('criteriaMode', 'age')}>
                    Age threshold
                  </MiniTab>
                  <MiniTab
                    active={inputs.criteriaMode === 'ageCategory'}
                    onClick={() => set('criteriaMode', 'ageCategory')}
                  >
                    Age category
                  </MiniTab>
                </div>
                {inputs.criteriaMode === 'age' ? (
                  <input
                    type="number"
                    min={0}
                    max={120}
                    placeholder="pass if at least (age)"
                    value={inputs.criteriaAge}
                    onChange={(e) => set('criteriaAge', e.target.value)}
                    className={ctxInput}
                  />
                ) : (
                  <select
                    value={inputs.criteriaCategory}
                    onChange={(e) =>
                      set('criteriaCategory', e.target.value as FlowInputs['criteriaCategory'])
                    }
                    className={`${ctxInput} cursor-pointer`}
                  >
                    <option value="ADULT">ADULT</option>
                    <option value="DIGITAL_YOUTH_OR_ADULT">DIGITAL_YOUTH_OR_ADULT</option>
                  </select>
                )}
              </CtxField>

              <CtxField label="Subject hints" hint="optional">
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {AGE_PRESETS.map(([label, dob]) => (
                    <button
                      key={dob}
                      type="button"
                      onClick={() => set('dateOfBirth', dob)}
                      className={`cursor-pointer rounded-full border px-2.5 py-1 font-mono text-[11px] transition-all duration-200 ease-apple active:scale-95 ${
                        inputs.dateOfBirth === dob
                          ? 'border-action/50 bg-action/10 text-action'
                          : 'border-ink-700 text-ink-400 hover:border-ink-600 hover:text-ink-100'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    value={inputs.dateOfBirth}
                    onChange={(e) => set('dateOfBirth', e.target.value)}
                    className={ctxInput}
                  />
                  <input
                    type="number"
                    min={0}
                    max={120}
                    placeholder="claimed age"
                    value={inputs.age}
                    onChange={(e) => set('age', e.target.value)}
                    className={ctxInput}
                  />
                </div>
              </CtxField>
            </CtxForm>
          }
        >
          {av && <VerificationTarget av={av} />}
        </StepCard>

        {/* Test helper — simulate the verification result */}
        {testMode && av?.id && (
          <div className="ml-[44px] mb-1 rounded-xl border border-dashed border-pending/40 bg-pending/5 p-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-pending/50 font-mono text-[10px] font-bold text-pending">
                TEST
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-[13.5px] font-semibold tracking-apple text-ink-50">
                    Simulate verification result
                  </h3>
                  <MethodBadge method="POST" />
                  <span className="font-mono text-[11px] text-ink-500">
                    test/set-age-verification-status
                  </span>
                </div>
                <p className="mt-1 text-[12.5px] leading-relaxed text-ink-400">
                  TEST mode only. Marks the request PASS (age 18+, age-estimation) without completing the
                  hosted flow, so you can reach step 2&apos;s result immediately.
                </p>
                {verificationSimulated && (
                  <p className="mt-1.5 animate-fade-up font-mono text-[11.5px] text-pass">
                    Verified (simulated) — now get status →
                  </p>
                )}
              </div>
              <ActionButton
                variant="amber"
                onClick={onSimulateVerification}
                running={loadingStep === 'sim-verify'}
              >
                {loadingStep === 'sim-verify' ? 'Running' : 'Simulate PASS'}
              </ActionButton>
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
          onHover={onHoverStep}
          last
        >
          {state.verificationStatus && <VerificationStatusResult data={state.verificationStatus} />}
        </StepCard>
      </div>
    </section>
  )
}

// ── outcome header ───────────────────────────────────────────────────────────

function OutcomeHeader({ state, doneCount }: { state: AccessFlowState; doneCount: number }) {
  let label = 'Not started'
  let color = 'text-ink-300'
  let sub = 'Set criteria and create a verification request.'
  if (state.verificationStatus) {
    label = state.verificationStatus.status
    color = ageGateStatusColor(state.verificationStatus.status)
    sub = 'Authoritative verification result.'
  } else if (state.accessAv) {
    label = 'Awaiting verification'
    color = 'text-pending'
    sub = 'Scan the QR or run the hosted flow, then poll status.'
  }
  return (
    <div className="mb-2 flex items-center gap-3 rounded-xl border border-ink-700/60 bg-ink-950/30 p-3">
      <ProgressRing value={doneCount} total={2} tone={state.verificationStatus ? 'pass' : 'action'} />
      <div className="min-w-0">
        <div className={`text-[15px] font-bold tracking-apple ${color}`}>{label}</div>
        <div className="truncate text-[12px] text-ink-400">{sub}</div>
      </div>
    </div>
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
    <div className="space-y-3 rounded-lg border border-ink-700/60 bg-ink-950/40 p-3">
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
        <div className="flex animate-fade-up flex-col items-center gap-3 sm:flex-row sm:items-start">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qr}
              alt="QR code to open the verification on a phone"
              width={160}
              height={160}
              className="h-40 w-40 shrink-0 rounded-lg bg-ink-50 p-1 shadow-product"
            />
          ) : (
            <div className="grid h-40 w-40 shrink-0 place-items-center rounded-lg border border-ink-700 font-mono text-[11px] text-ink-500 shimmer-track">
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
              className="block cursor-pointer break-all rounded-lg border border-ink-700 px-2 py-1.5 font-mono text-[11.5px] text-action transition-colors hover:border-action/60"
            >
              {av.shortUrl} ↗
            </a>
            <div className="flex items-center gap-2">
              <a
                href={av.url}
                target="_blank"
                rel="noreferrer"
                className="cursor-pointer font-mono text-[11px] text-ink-400 underline-offset-2 transition-colors hover:text-ink-200 hover:underline"
              >
                full url ↗
              </a>
              <CopyButton getText={() => av.url} label="Copy url" />
            </div>
          </div>
        </div>
      ) : (
        <div className="animate-fade-up space-y-1">
          <div className="overflow-hidden rounded-lg border border-ink-700/70 bg-white shadow-product">
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
    <div className="space-y-2 rounded-lg border border-ink-700/60 bg-ink-950/40 p-3">
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

// ── shared bits ──────────────────────────────────────────────────────────────

function GroupHeader({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="flex items-start gap-2 pb-1 pt-1">
      <span className="mt-1 h-3.5 w-1 shrink-0 rounded-full bg-pending" />
      <div>
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-pending">{title}</h3>
        <p className="mt-0.5 text-[11.5px] leading-snug text-ink-500">{desc}</p>
      </div>
    </div>
  )
}

const ctxInput =
  'w-full rounded-md border border-ink-700 bg-ink-950/50 px-2.5 py-1.5 font-mono text-[12px] text-ink-100 outline-none transition-colors placeholder:text-ink-600 focus:border-action/60 focus:ring-1 focus:ring-action/40'

function CtxForm({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-2.5 rounded-lg border border-dashed border-ink-700/70 bg-ink-950/30 p-3">
      {children}
    </div>
  )
}

function CtxField({
  label,
  hint,
  badge,
  children,
}: {
  label: string
  hint?: string
  badge?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <span className="text-[11px] font-medium text-ink-200">{label}</span>
        {hint && (
          <span className={`font-mono text-[10px] ${badge ? 'text-challenge' : 'text-ink-500'}`}>
            {hint}
          </span>
        )}
        <span className="ml-auto font-mono text-[9px] font-bold uppercase tracking-wider text-action/70">
          this step
        </span>
      </div>
      {children}
    </div>
  )
}

function MiniTab({
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
      className={`cursor-pointer rounded-full px-2 py-1.5 font-mono text-[11px] transition-colors duration-200 ${
        active ? 'bg-action/15 text-action ring-1 ring-inset ring-action/40' : 'text-ink-400 hover:text-ink-100'
      }`}
    >
      {children}
    </button>
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
  onHover,
  form,
  last,
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
  onHover?: (key: string | null) => void
  form?: React.ReactNode
  last?: boolean
  children?: React.ReactNode
}) {
  const nodeState = error
    ? 'error'
    : done
      ? 'done'
      : running
        ? 'running'
        : enabled
          ? 'ready'
          : 'locked'

  const cardTone = error
    ? 'border-prohibited/40 bg-prohibited/[0.04]'
    : done
      ? 'border-pass/30 bg-pass/[0.04]'
      : running
        ? 'border-action/40 bg-action/[0.04] shadow-glow'
        : enabled
          ? 'border-ink-700/70 bg-ink-950/20'
          : 'border-ink-800/70 bg-ink-950/10'

  return (
    <div className="flex gap-3.5">
      <div className="flex flex-col items-center">
        <StepNode index={index} state={nodeState} />
        {!last && (
          <span
            className={`mt-1 w-0.5 flex-1 rounded-full transition-colors duration-500 ${
              done ? 'bg-pass/40' : 'bg-ink-700/50'
            }`}
          />
        )}
      </div>

      <div
        onMouseEnter={() => onHover?.(endpoint)}
        onMouseLeave={() => onHover?.(null)}
        className={`mb-3 min-w-0 flex-1 rounded-xl border p-4 transition-all duration-300 ease-apple ${cardTone} ${
          enabled || running || done || error ? '' : 'opacity-70'
        }`}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[13.5px] font-semibold tracking-apple text-ink-50">{title}</h3>
              <MethodBadge method={method} />
              <span className="font-mono text-[11px] text-ink-500">{endpoint}</span>
            </div>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-400">{desc}</p>
          </div>
          <ActionButton
            onClick={onRun}
            disabled={!enabled}
            running={running}
            title={!enabled ? disabledHint : undefined}
          >
            {running ? 'Running' : runLabel}
          </ActionButton>
        </div>

        {form && <div className="mt-3">{form}</div>}

        {!enabled && disabledHint && (
          <p className="mt-2 flex items-center gap-1.5 font-mono text-[11px] text-ink-600">
            <svg className="h-3 w-3 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path
                fillRule="evenodd"
                d="M10 1a4 4 0 00-4 4v2H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2V9a2 2 0 00-2-2h-1V5a4 4 0 00-4-4zm2 6V5a2 2 0 10-4 0v2h4z"
                clipRule="evenodd"
              />
            </svg>
            {disabledHint}
          </p>
        )}
        {error && (
          <div className="mt-3 animate-fade-up rounded-lg border border-prohibited/40 bg-prohibited/10 px-3 py-2 font-mono text-[12px] text-prohibited">
            {error}
          </div>
        )}
        {children && <div className="mt-3 animate-fade-up">{children}</div>}
      </div>
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
        active ? 'border-action text-ink-50' : 'border-transparent text-ink-500 hover:text-ink-200'
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
    <div className="rounded-lg border border-ink-800 bg-ink-950/40 px-2 py-1 font-mono">
      <span className="block text-ink-500">{label}</span>
      <span className="block break-all text-ink-100">{value}</span>
    </div>
  )
}
