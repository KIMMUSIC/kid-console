'use client'

import React from 'react'
import type {
  AgeGateCheckResponse,
  AgeGateRequirements,
  ChallengeStatusResponse,
  KidSession,
} from '@/lib/types'
import type { FlowInputs } from './FlowPanel'
import { Badge, CopyButton, MethodBadge, ageGateStatusColor } from './ui'

export interface FlowState {
  requirements: AgeGateRequirements | null
  ageGate: AgeGateCheckResponse | null
  emailSentTo: string | null
  challengeStatus: ChallengeStatusResponse | null
  session: KidSession | null
  stepError: Record<string, string | undefined>
}

export interface StepHandlers {
  onRequirements: () => void
  onCheck: () => void
  onSendEmail: () => void
  onPoll: () => void
  onSession: () => void
}

export default function FlowStepper({
  inputs,
  state,
  loadingStep,
  testMode,
  consentSimulated,
  handlers,
  onSimulateConsent,
}: {
  inputs: FlowInputs
  state: FlowState
  loadingStep: string | null
  testMode: boolean
  consentSimulated: boolean
  handlers: StepHandlers
  onSimulateConsent: () => void
}) {
  const challengeId = state.ageGate?.challenge?.challengeId ?? null
  const sessionId = state.challengeStatus?.sessionId ?? state.ageGate?.session?.sessionId ?? null
  const hasAgeInput = Boolean(inputs.dateOfBirth || inputs.age)

  return (
    <section className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-2 border-b border-ink-700/70 px-4 py-3">
        <h2 className="font-mono text-sm font-semibold text-ink-50">Flow</h2>
        <span className="font-mono text-[11px] text-ink-500">age assurance → parental consent</span>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        <GroupHeader
          title="Age Assurance"
          desc="Determine the player's age status and whether consent is required."
          tone="assurance"
        />

        {/* Step 1 — requirements */}
        <StepCard
          index={1}
          method="GET"
          endpoint="age-gate/get-requirements"
          title="Get jurisdiction requirements"
          desc="Digital-consent age, civil age, minimum age, approved age-collection methods."
          enabled={Boolean(inputs.jurisdiction)}
          running={loadingStep === 'requirements'}
          done={Boolean(state.requirements)}
          error={state.stepError.requirements}
          runLabel="Send"
          onRun={handlers.onRequirements}
        >
          {state.requirements && <RequirementsResult data={state.requirements} />}
        </StepCard>

        {/* Step 2 — age-gate check */}
        <StepCard
          index={2}
          method="POST"
          endpoint="age-gate/check"
          title="Run the age gate"
          desc="PASS, PROHIBITED, or CHALLENGE. A CHALLENGE creates a parental-consent challenge."
          enabled={Boolean(inputs.jurisdiction) && hasAgeInput}
          running={loadingStep === 'check'}
          done={Boolean(state.ageGate)}
          error={state.stepError.check}
          runLabel="Send"
          onRun={handlers.onCheck}
        >
          {state.ageGate && <CheckResult data={state.ageGate} />}
        </StepCard>

        <GroupHeader
          title="Verifiable Parental Consent (VPC)"
          desc="Only when step 2 returns CHALLENGE: email the consent challenge and confirm approval."
          tone="vpc"
        />

        {/* Step 3 — send consent email (VPC trigger) */}
        <StepCard
          index={3}
          method="POST"
          endpoint="challenge/send-email"
          title="Email the parental-consent challenge"
          desc="The VPC trigger without a widget: emails the consent link + OTP to a trusted adult."
          enabled={Boolean(challengeId) && isEmail(inputs.parentEmail)}
          disabledHint={
            !challengeId
              ? 'Needs a CHALLENGE from step 2'
              : !isEmail(inputs.parentEmail)
                ? 'Enter a parent/guardian email'
                : undefined
          }
          running={loadingStep === 'send-email'}
          done={Boolean(state.emailSentTo)}
          error={state.stepError['send-email']}
          runLabel="Send email"
          onRun={handlers.onSendEmail}
        >
          {state.emailSentTo && (
            <div className="rounded-md border border-pass/40 bg-pass/5 px-3 py-2 font-mono text-[12px] text-pass">
              Consent challenge emailed to {state.emailSentTo}
            </div>
          )}
        </StepCard>

        {/* Test helper — simulate parental approval */}
        {testMode && challengeId && (
          <TestHelper
            title="Simulate parental approval"
            endpoint="test/set-challenge-status"
            desc="TEST mode only. Marks the challenge PASS as if a trusted adult approved, so you can run the full pipeline without a real consent email."
            running={loadingStep === 'sim-consent'}
            done={consentSimulated}
            doneLabel="Approved (simulated) — now poll status →"
            runLabel="Simulate PASS"
            onRun={onSimulateConsent}
          />
        )}

        {/* Step 4 — poll challenge status */}
        <StepCard
          index={4}
          method="GET"
          endpoint="challenge/get-status"
          title="Poll the consent result"
          desc="PENDING / IN_PROGRESS until a trusted adult approves, then PASS or FAIL."
          enabled={Boolean(challengeId)}
          disabledHint={!challengeId ? 'Needs a CHALLENGE from step 2' : undefined}
          running={loadingStep === 'poll'}
          done={Boolean(state.challengeStatus)}
          error={state.stepError.poll}
          runLabel="Poll status"
          onRun={handlers.onPoll}
        >
          {state.challengeStatus && <ChallengeStatusResult data={state.challengeStatus} />}
        </StepCard>

        {/* Step 5 — get session */}
        <StepCard
          index={5}
          method="GET"
          endpoint="session/get"
          title="Inspect the resulting session"
          desc="The permissions and allowances the player ends up with."
          enabled={Boolean(sessionId)}
          disabledHint={!sessionId ? 'Needs a sessionId (from PASS / approved consent)' : undefined}
          running={loadingStep === 'session'}
          done={Boolean(state.session)}
          error={state.stepError.session}
          runLabel="Send"
          onRun={handlers.onSession}
        >
          {state.session && <SessionCard session={state.session} />}
        </StepCard>
      </div>
    </section>
  )
}

// ── group header ─────────────────────────────────────────────────────────────

function GroupHeader({
  title,
  desc,
  tone,
}: {
  title: string
  desc: string
  tone: 'assurance' | 'vpc'
}) {
  const accent = tone === 'assurance' ? 'text-pending' : 'text-challenge'
  const bar = tone === 'assurance' ? 'bg-pending' : 'bg-challenge'
  return (
    <div className="flex items-start gap-2 pt-1 first:pt-0">
      <span className={`mt-1 h-3 w-1 shrink-0 rounded-full ${bar}`} />
      <div>
        <h3 className={`font-mono text-[11px] font-bold uppercase tracking-wider ${accent}`}>
          {title}
        </h3>
        <p className="mt-0.5 text-[11.5px] leading-snug text-ink-500">{desc}</p>
      </div>
    </div>
  )
}

// ── test helper card ─────────────────────────────────────────────────────────

function TestHelper({
  title,
  endpoint,
  desc,
  running,
  done,
  doneLabel,
  runLabel,
  onRun,
}: {
  title: string
  endpoint: string
  desc: string
  running: boolean
  done: boolean
  doneLabel: string
  runLabel: string
  onRun: () => void
}) {
  return (
    <div className="rounded-lg border border-dashed border-pending/40 bg-pending/5 p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-pending/50 font-mono text-[10px] font-bold text-pending">
          TEST
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[13.5px] font-semibold text-ink-50">{title}</h3>
            <MethodBadge method="POST" />
            <span className="font-mono text-[11px] text-ink-500">{endpoint}</span>
          </div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-400">{desc}</p>
          {done && <p className="mt-1.5 font-mono text-[11.5px] text-run">{doneLabel}</p>}
        </div>
        <button
          type="button"
          onClick={onRun}
          disabled={running}
          className="shrink-0 cursor-pointer rounded-md border border-pending/50 bg-pending/10 px-3 py-1.5 font-mono text-[12px] font-semibold text-pending transition-colors duration-200 hover:bg-pending/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {running ? '…' : runLabel}
        </button>
      </div>
    </div>
  )
}

// ── step shell ───────────────────────────────────────────────────────────────

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
      {children && <div className="mt-3 pl-0">{children}</div>}
    </div>
  )
}

// ── per-step result renderers ────────────────────────────────────────────────

function RequirementsResult({ data }: { data: AgeGateRequirements }) {
  return (
    <div className="space-y-3 rounded-md border border-ink-700/60 bg-ink-950/40 p-3">
      <div className="grid grid-cols-3 gap-2 font-mono text-[11.5px]">
        <Mini label="digitalConsentAge" value={String(data.digitalConsentAge)} />
        <Mini label="civilAge" value={String(data.civilAge)} />
        <Mini label="minimumAge" value={String(data.minimumAge)} />
      </div>
      <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
        <span className={data.ageAssuranceRequired ? 'text-challenge' : 'text-ink-500'}>
          ageAssuranceRequired: {String(data.ageAssuranceRequired)}
        </span>
        <span className="text-ink-500">shouldDisplay: {String(data.shouldDisplay)}</span>
      </div>
      {data.approvedAgeCollectionMethods?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {data.approvedAgeCollectionMethods.map((m) => (
            <Badge key={m} className="border-ink-700 bg-ink-800 text-ink-300">
              {m}
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}

function CheckResult({ data }: { data: AgeGateCheckResponse }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className={`font-mono text-base font-bold ${ageGateStatusColor(data.status)}`}>
          {data.status}
        </span>
        <span className="text-[12px] text-ink-400">{statusExplainer(data.status)}</span>
      </div>

      {data.challenge && (
        <div className="space-y-3 rounded-md border border-challenge/40 bg-challenge/5 p-3">
          <div className="flex items-center gap-2">
            <Badge className="border-challenge/50 bg-challenge/10 text-challenge">
              Parental Consent
            </Badge>
            <span className="font-mono text-[11px] text-ink-500">{data.challenge.type}</span>
          </div>
          <Detail label="challengeId" value={data.challenge.challengeId} mono copy />
          {data.challenge.oneTimePassword && (
            <div>
              <p className="mb-1 font-mono text-[11px] text-ink-500">One-time password</p>
              <p className="font-mono text-xl font-bold tracking-[0.3em] text-challenge">
                {data.challenge.oneTimePassword}
              </p>
              {data.challenge.otpExpiresAt && (
                <p className="mt-1 font-mono text-[11px] text-ink-500">
                  expires {data.challenge.otpExpiresAt}
                </p>
              )}
            </div>
          )}
          {data.challenge.url && (
            <a
              href={data.challenge.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex cursor-pointer items-center gap-1 font-mono text-[12px] text-pending underline-offset-2 hover:underline"
            >
              consent link ↗
            </a>
          )}
          <p className="font-mono text-[11px] text-ink-500">
            → step 3 emails this challenge to the parent.
          </p>
        </div>
      )}

      {data.session && <SessionCard session={data.session} />}
    </div>
  )
}

function ChallengeStatusResult({ data }: { data: ChallengeStatusResponse }) {
  return (
    <div className="space-y-2 rounded-md border border-ink-700/60 bg-ink-950/40 p-3">
      <p className={`font-mono text-base font-bold ${ageGateStatusColor(data.status)}`}>
        {data.status}
      </p>
      {data.approverEmail && <Detail label="approverEmail" value={data.approverEmail} mono />}
      {data.sessionId && <Detail label="sessionId" value={data.sessionId} mono copy />}
      {(data.status === 'PENDING' || data.status === 'IN_PROGRESS') && (
        <p className="font-mono text-[11px] text-ink-500">
          Still waiting on the trusted adult. Poll again after they approve.
        </p>
      )}
    </div>
  )
}

function SessionCard({ session }: { session: KidSession }) {
  return (
    <div className="space-y-3 rounded-md border border-ink-700/60 bg-ink-950/40 p-3">
      <div className="flex items-center gap-2">
        <Badge className="border-pass/50 bg-pass/10 text-pass">Session</Badge>
        <span className="font-mono text-[11px] text-ink-500">{session.ageStatus}</span>
        <span className="ml-auto font-mono text-[11px] text-ink-500">{session.status}</span>
      </div>
      <Detail label="sessionId" value={session.sessionId} mono copy />
      <div className="grid grid-cols-2 gap-2 font-mono text-[11.5px]">
        <Mini label="jurisdiction" value={session.jurisdiction} />
        <Mini label="ageCategory" value={session.ageCategory} />
        <Mini label="dateOfBirth" value={session.dateOfBirth} />
        <Mini label="managedBy" value={session.managedBy} />
      </div>
      {session.permissions?.length > 0 && (
        <div className="overflow-hidden rounded-md ring-1 ring-inset ring-ink-700/60">
          <table className="w-full border-collapse font-mono text-[11.5px]">
            <tbody>
              {session.permissions.map((p) => (
                <tr key={p.name} className="border-b border-ink-800 last:border-0">
                  <td className="px-2 py-1 text-ink-200">{p.name}</td>
                  <td className="px-2 py-1 text-ink-500">{p.managedBy}</td>
                  <td className="px-2 py-1 text-right">
                    <span className={p.enabled ? 'text-pass' : 'text-prohibited'}>
                      {p.enabled ? 'enabled' : 'off'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
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
    <div className="rounded border border-ink-800 bg-ink-950/40 px-2 py-1">
      <span className="block text-ink-500">{label}</span>
      <span className="block break-all text-ink-100">{value}</span>
    </div>
  )
}

function statusExplainer(status: string): string {
  switch (status) {
    case 'PASS':
      return 'Player may continue; a session was created.'
    case 'CHALLENGE':
      return 'Parental consent required; a challenge was created.'
    case 'PROHIBITED':
      return 'Below the minimum age; block the player.'
    default:
      return ''
  }
}

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())
}
