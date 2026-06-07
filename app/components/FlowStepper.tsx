'use client'

import React from 'react'
import type {
  AgeGateCheckResponse,
  AgeGateRequirements,
  ChallengeStatusResponse,
  KidSession,
} from '@/lib/types'
import type { FlowInputs } from './FlowPanel'
import {
  ActionButton,
  Badge,
  CopyButton,
  MethodBadge,
  ProgressBar,
  StepNode,
  ageGateStatusColor,
} from './ui'

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

  // Display-only journey progress derived from existing state.
  const doneCount = [
    state.requirements,
    state.ageGate,
    state.emailSentTo,
    state.challengeStatus,
    state.session,
  ].filter(Boolean).length

  return (
    <section className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-ink-700/70 px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold tracking-apple text-ink-50">Flow</h2>
          <span className="font-mono text-[11px] text-ink-500">
            age assurance → parental consent
          </span>
          <span className="ml-auto font-mono text-[11px] text-ink-400">
            {doneCount}/5 steps
          </span>
        </div>
        <div className="mt-2">
          <ProgressBar value={doneCount} total={5} tone={state.session ? 'pass' : 'action'} />
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-4 py-4">
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
            <div className="flex items-center gap-2 rounded-lg border border-pass/40 bg-pass/5 px-3 py-2 font-mono text-[12px] text-pass">
              <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 6l7 5 7-5M3 6v8h14V6" />
              </svg>
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
          last
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
    <div className="flex items-start gap-2 pb-1 pt-3 first:pt-1">
      <span className={`mt-1 h-3.5 w-1 shrink-0 rounded-full ${bar}`} />
      <div>
        <h3 className={`text-[11px] font-bold uppercase tracking-wider ${accent}`}>{title}</h3>
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
    <div className="ml-[44px] mb-1 rounded-xl border border-dashed border-pending/40 bg-pending/5 p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-pending/50 font-mono text-[10px] font-bold text-pending">
          TEST
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[13.5px] font-semibold tracking-apple text-ink-50">{title}</h3>
            <MethodBadge method="POST" />
            <span className="font-mono text-[11px] text-ink-500">{endpoint}</span>
          </div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-400">{desc}</p>
          {done && (
            <p className="mt-1.5 animate-fade-up font-mono text-[11.5px] text-pass">{doneLabel}</p>
          )}
        </div>
        <ActionButton variant="amber" onClick={onRun} running={running}>
          {running ? 'Running' : runLabel}
        </ActionButton>
      </div>
    </div>
  )
}

// ── step shell (journey node + card) ─────────────────────────────────────────

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
    ? 'border-prohibited/40 bg-prohibited/[0.03]'
    : done
      ? 'border-pass/30 bg-pass/[0.03]'
      : running
        ? 'border-action/40 bg-action/[0.03] shadow-glow'
        : enabled
          ? 'border-ink-700/70 bg-ink-900/60'
          : 'border-ink-800/70 bg-ink-900/30'

  return (
    <div className="flex gap-3.5">
      {/* journey rail */}
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

      {/* card */}
      <div
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

// ── per-step result renderers ────────────────────────────────────────────────

function RequirementsResult({ data }: { data: AgeGateRequirements }) {
  return (
    <div className="space-y-3 rounded-lg border border-ink-700/60 bg-ink-950/40 p-3">
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
        <div className="space-y-3 rounded-lg border border-challenge/40 bg-challenge/5 p-3">
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
              className="inline-flex cursor-pointer items-center gap-1 font-mono text-[12px] text-action underline-offset-2 transition-colors hover:underline"
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
    <div className="space-y-2 rounded-lg border border-ink-700/60 bg-ink-950/40 p-3">
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
    <div className="space-y-3 rounded-lg border border-ink-700/60 bg-ink-950/40 p-3">
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
        <div className="overflow-hidden rounded-lg ring-1 ring-inset ring-ink-700/60">
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
    <div className="rounded-lg border border-ink-800 bg-ink-950/40 px-2 py-1">
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
