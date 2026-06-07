'use client'

import React from 'react'
import type {
  AccessAgeVerificationResponse,
  AgeGateCheckResponse,
  AgeGateRequirements,
  ChallengeStatusResponse,
  HttpExchange,
  KidConfig,
  KidSession,
  ProxyResult,
  SendEmailResponse,
  VerificationStatusResponse,
} from '@/lib/types'
import FlowPanel, { type ActiveFlow, type FlowInputs } from './FlowPanel'
import FlowStepper, { type FlowState, type StepHandlers } from './FlowStepper'
import AgeVerificationFlow, { type AccessFlowState } from './AgeVerificationFlow'
import InspectorPanel from './InspectorPanel'

function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `id-${Date.now()}-${Math.floor(Math.random() * 1e9)}`
}

const EMPTY_FLOW: FlowState = {
  requirements: null,
  ageGate: null,
  emailSentTo: null,
  challengeStatus: null,
  session: null,
  stepError: {},
}

const EMPTY_ACCESS: AccessFlowState = {
  accessAv: null,
  verificationStatus: null,
  errors: {},
}

export default function Console() {
  const [config, setConfig] = React.useState<KidConfig | null>(null)
  const [exchanges, setExchanges] = React.useState<HttpExchange[]>([])
  const [loadingStep, setLoadingStep] = React.useState<string | null>(null)
  const [sseConnected, setSseConnected] = React.useState(false)
  const [activeFlow, setActiveFlow] = React.useState<ActiveFlow>('access')
  const [productId, setProductId] = React.useState<string>('')

  const [inputs, setInputs] = React.useState<FlowInputs>({
    jurisdiction: 'US-CA',
    dateOfBirth: '2011-08-15',
    age: '',
    parentEmail: 'parent@example.com',
    kuid: '',
    criteriaMode: 'age',
    criteriaAge: '18',
    criteriaCategory: 'ADULT',
  })
  const [flow, setFlow] = React.useState<FlowState>(EMPTY_FLOW)
  const [access, setAccess] = React.useState<AccessFlowState>(EMPTY_ACCESS)
  const [consentSimulated, setConsentSimulated] = React.useState(false)
  const [verificationSimulated, setVerificationSimulated] = React.useState(false)
  const testMode = config?.testMode ?? false

  React.useEffect(() => {
    fetch('/api/kid/config')
      .then((r) => r.json())
      .then((c: KidConfig) => {
        setConfig(c)
        // Start on the server-suggested product (or the first available one).
        setProductId((prev) => prev || c.defaultProduct || c.products?.[0]?.id || '')
      })
      .catch(() => setConfig(null))
  }, [])

  React.useEffect(() => {
    const es = new EventSource('/api/webhook/events')
    es.addEventListener('connected', () => setSseConnected(true))
    es.addEventListener('webhook', (e) => {
      try {
        const ex = JSON.parse((e as MessageEvent).data) as HttpExchange
        setExchanges((prev) => [ex, ...prev])
      } catch {
        /* ignore */
      }
    })
    es.onerror = () => setSseConnected(false)
    return () => es.close()
  }, [])

  function pushHops(hops: HttpExchange[]) {
    if (hops.length > 0) setExchanges((prev) => [...hops, ...prev])
  }

  async function proxyCall<T>(
    path: string,
    init: RequestInit,
    title: string,
  ): Promise<ProxyResult<T> | null> {
    const startedMs = Date.now()
    const startedAt = new Date(startedMs).toISOString()
    // Tell the server which product (and therefore which API key) to use.
    const initWithProduct: RequestInit = {
      ...init,
      headers: { ...(init.headers as Record<string, string> | undefined), 'X-Kid-Product': productId },
    }
    const baseReq = {
      method: (init.method || 'GET').toUpperCase(),
      url: path,
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        'x-kid-product': productId,
      },
      body: init.body ? safeParse(init.body as string) : null,
    }
    try {
      const res = await fetch(path, initWithProduct)
      const json = (await res.json()) as ProxyResult<T>
      pushHops([
        {
          id: uid(),
          hop: 'browser->proxy',
          label: 'Browser → Proxy',
          title,
          request: baseReq,
          response: {
            status: res.status,
            statusText: res.statusText,
            ok: res.ok,
            headers: Object.fromEntries(res.headers.entries()),
            body: json,
          },
          startedAt,
          durationMs: Date.now() - startedMs,
        },
        ...(json.exchanges ?? []),
      ])
      return json
    } catch (err) {
      pushHops([
        {
          id: uid(),
          hop: 'browser->proxy',
          label: 'Browser → Proxy',
          title,
          request: baseReq,
          response: null,
          error: err instanceof Error ? err.message : 'Network error',
          startedAt,
          durationMs: Date.now() - startedMs,
        },
      ])
      return null
    }
  }

  // ── CDK age-gate + VPC handlers ──────────────────────────────────────────────

  function setStepError(step: string, message?: string) {
    setFlow((f) => ({ ...f, stepError: { ...f.stepError, [step]: message } }))
  }

  async function runRequirements() {
    setLoadingStep('requirements')
    setStepError('requirements', undefined)
    try {
      const res = await proxyCall<AgeGateRequirements>(
        `/api/kid/requirements?jurisdiction=${encodeURIComponent(inputs.jurisdiction)}`,
        { method: 'GET' },
        'age-gate/get-requirements',
      )
      if (res?.ok && res.data) setFlow((f) => ({ ...f, requirements: res.data! }))
      else setStepError('requirements', res?.error || 'Request failed')
    } finally {
      setLoadingStep(null)
    }
  }

  async function runCheck() {
    setLoadingStep('check')
    setStepError('check', undefined)
    const body: Record<string, unknown> = { jurisdiction: inputs.jurisdiction }
    if (inputs.kuid) body.kuid = inputs.kuid
    if (inputs.age) body.age = inputs.age
    else if (inputs.dateOfBirth) body.dateOfBirth = inputs.dateOfBirth
    try {
      const res = await proxyCall<AgeGateCheckResponse>(
        '/api/kid/age-gate-check',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
        'age-gate/check',
      )
      if (res?.ok && res.data) {
        setConsentSimulated(false)
        setFlow((f) => ({
          ...f,
          ageGate: res.data!,
          emailSentTo: null,
          challengeStatus: null,
          session: null,
          stepError: { ...f.stepError, check: undefined, 'send-email': undefined, poll: undefined, session: undefined },
        }))
      } else {
        setStepError('check', res?.error || 'Request failed')
      }
    } finally {
      setLoadingStep(null)
    }
  }

  async function runSendEmail() {
    const challengeId = flow.ageGate?.challenge?.challengeId
    if (!challengeId) return
    setLoadingStep('send-email')
    setStepError('send-email', undefined)
    try {
      const res = await proxyCall<SendEmailResponse>(
        '/api/kid/send-email',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ challengeId, email: inputs.parentEmail, locale: 'en-US' }),
        },
        'challenge/send-email',
      )
      if (res?.ok) setFlow((f) => ({ ...f, emailSentTo: inputs.parentEmail }))
      else setStepError('send-email', res?.error || 'Request failed')
    } finally {
      setLoadingStep(null)
    }
  }

  async function runPoll() {
    const challengeId = flow.ageGate?.challenge?.challengeId
    if (!challengeId) return
    setLoadingStep('poll')
    setStepError('poll', undefined)
    try {
      const res = await proxyCall<ChallengeStatusResponse>(
        `/api/kid/challenge-status?challengeId=${encodeURIComponent(challengeId)}`,
        { method: 'GET' },
        'challenge/get-status',
      )
      if (res?.ok && res.data) setFlow((f) => ({ ...f, challengeStatus: res.data! }))
      else setStepError('poll', res?.error || 'Request failed')
    } finally {
      setLoadingStep(null)
    }
  }

  async function runSession() {
    const sessionId = flow.challengeStatus?.sessionId ?? flow.ageGate?.session?.sessionId
    if (!sessionId) return
    setLoadingStep('session')
    setStepError('session', undefined)
    try {
      const res = await proxyCall<KidSession>(
        `/api/kid/session-get?sessionId=${encodeURIComponent(sessionId)}`,
        { method: 'GET' },
        'session/get',
      )
      if (res?.ok && res.data) setFlow((f) => ({ ...f, session: res.data! }))
      else setStepError('session', res?.error || 'Request failed')
    } finally {
      setLoadingStep(null)
    }
  }

  const stepHandlers: StepHandlers = {
    onRequirements: runRequirements,
    onCheck: runCheck,
    onSendEmail: runSendEmail,
    onPoll: runPoll,
    onSession: runSession,
  }

  // ── AgeKit+ Access Age Verification handlers ─────────────────────────────────

  function setAccessError(step: string, message?: string) {
    setAccess((a) => ({ ...a, errors: { ...a.errors, [step]: message } }))
  }

  async function runAccessAv() {
    setLoadingStep('access-av')
    setAccessError('access-av', undefined)
    const body: Record<string, unknown> = {
      jurisdiction: inputs.jurisdiction,
      criteriaMode: inputs.criteriaMode,
      criteriaAge: inputs.criteriaAge,
      criteriaCategory: inputs.criteriaCategory,
    }
    if (inputs.dateOfBirth) body.claimedDateOfBirth = inputs.dateOfBirth
    if (inputs.age) body.claimedAge = inputs.age
    try {
      const res = await proxyCall<AccessAgeVerificationResponse>(
        '/api/kid/access-age-verification',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
        'age-verification/perform-access-age-verification',
      )
      if (res?.ok && res.data?.url) {
        setVerificationSimulated(false)
        setAccess((a) => ({ ...a, accessAv: res.data!, verificationStatus: null, errors: {} }))
      } else {
        setAccessError('access-av', res?.error || 'Request failed')
      }
    } finally {
      setLoadingStep(null)
    }
  }

  // TEST-mode simulators: complete the pipeline without a real parent / user.
  async function runSimulateConsent() {
    const ch = flow.ageGate?.challenge
    if (!ch) return
    setLoadingStep('sim-consent')
    setStepError('send-email', undefined)
    const age = inputs.age ? Number(inputs.age) : ageFromDob(inputs.dateOfBirth)
    try {
      const res = await proxyCall(
        '/api/kid/test-set-challenge-status',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            challengeId: ch.challengeId,
            status: 'PASS',
            age,
            jurisdiction: inputs.jurisdiction,
            approverEmail: inputs.parentEmail || 'parent@example.com',
          }),
        },
        'test/set-challenge-status',
      )
      if (res?.ok) setConsentSimulated(true)
    } finally {
      setLoadingStep(null)
    }
  }

  async function runSimulateVerification() {
    const id = access.accessAv?.id
    if (!id) return
    setLoadingStep('sim-verify')
    try {
      const res = await proxyCall(
        '/api/kid/test-set-verification-status',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            verificationId: id,
            status: 'PASS',
            ageLow: 18,
            ageHigh: 120,
            ageCategory: 'adult',
            method: 'age-estimation',
          }),
        },
        'test/set-age-verification-status',
      )
      if (res?.ok) setVerificationSimulated(true)
    } finally {
      setLoadingStep(null)
    }
  }

  async function runVerifyStatus() {
    const id = access.accessAv?.id
    if (!id) return
    setLoadingStep('verify-status')
    setAccessError('verify-status', undefined)
    try {
      const res = await proxyCall<VerificationStatusResponse>(
        `/api/kid/verification-status?id=${encodeURIComponent(id)}`,
        { method: 'GET' },
        'age-verification/get-status',
      )
      if (res?.ok && res.data) setAccess((a) => ({ ...a, verificationStatus: res.data! }))
      else setAccessError('verify-status', res?.error || 'Request failed')
    } finally {
      setLoadingStep(null)
    }
  }

  function resetAll() {
    setFlow(EMPTY_FLOW)
    setAccess(EMPTY_ACCESS)
    setConsentSimulated(false)
    setVerificationSimulated(false)
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TopBar config={config} sseConnected={sseConnected} />

      <main className="grid min-h-0 flex-1 grid-cols-1 gap-px bg-ink-700/40 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)_minmax(0,0.9fr)]">
        <div className="min-h-0 bg-ink-900">
          <FlowPanel
            config={config}
            activeFlow={activeFlow}
            inputs={inputs}
            onChange={setInputs}
            onReset={resetAll}
            productId={productId}
            onProductChange={setProductId}
          />
        </div>

        <div className="flex min-h-0 flex-col bg-ink-900">
          <FlowTabs active={activeFlow} onChange={setActiveFlow} />
          <div className="min-h-0 flex-1">
            {activeFlow === 'access' ? (
              <AgeVerificationFlow
                inputs={inputs}
                state={access}
                loadingStep={loadingStep}
                testMode={testMode}
                verificationSimulated={verificationSimulated}
                onStart={runAccessAv}
                onPollStatus={runVerifyStatus}
                onSimulateVerification={runSimulateVerification}
              />
            ) : (
              <FlowStepper
                inputs={inputs}
                state={flow}
                loadingStep={loadingStep}
                testMode={testMode}
                consentSimulated={consentSimulated}
                handlers={stepHandlers}
                onSimulateConsent={runSimulateConsent}
              />
            )}
          </div>
        </div>

        <div className="min-h-0 bg-ink-900">
          <InspectorPanel exchanges={exchanges} onClear={() => setExchanges([])} />
        </div>
      </main>
    </div>
  )
}

function FlowTabs({ active, onChange }: { active: ActiveFlow; onChange: (f: ActiveFlow) => void }) {
  return (
    <div className="flex shrink-0 gap-1 border-b border-ink-700/70 bg-ink-950/40 px-3 pt-2">
      <FlowTab active={active === 'access'} onClick={() => onChange('access')}>
        AgeKit+ Access Verification
      </FlowTab>
      <FlowTab active={active === 'agegate'} onClick={() => onChange('agegate')}>
        Age-gate + VPC
      </FlowTab>
    </div>
  )
}

function FlowTab({
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
      className={`cursor-pointer rounded-t-md border-b-2 px-3 py-2 font-mono text-[12px] transition-colors duration-200 ${
        active
          ? 'border-run bg-ink-900 text-ink-50'
          : 'border-transparent text-ink-500 hover:text-ink-200'
      }`}
    >
      {children}
    </button>
  )
}

function TopBar({ config, sseConnected }: { config: KidConfig | null; sseConnected: boolean }) {
  return (
    <header className="grid-bg flex shrink-0 items-center gap-3 border-b border-ink-700/70 bg-ink-950/80 px-4 py-3">
      <div className="grid h-8 w-8 place-items-center rounded-md bg-run/15 ring-1 ring-run/40">
        <svg className="h-4 w-4 text-run" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" />
        </svg>
      </div>
      <div>
        <h1 className="font-mono text-[14px] font-bold tracking-tight text-ink-50">K-ID VPC Console</h1>
        <p className="font-mono text-[11px] text-ink-500">
          AgeKit+ Age Verification · CDK Age-gate · Verifiable Parental Consent · live HTTP inspector
        </p>
      </div>

      <div className="ml-auto flex items-center gap-3 font-mono text-[11px]">
        {config && (
          <span
            className={`hidden items-center gap-1.5 rounded border px-2 py-1 sm:inline-flex ${
              config.testMode
                ? 'border-pending/40 bg-pending/10 text-pending'
                : 'border-prohibited/40 bg-prohibited/10 text-prohibited'
            }`}
          >
            {config.testMode ? 'TEST MODE' : 'LIVE MODE'}
          </span>
        )}
        <span className="inline-flex items-center gap-1.5 text-ink-400">
          <span className={`h-2 w-2 rounded-full ${sseConnected ? 'bg-run animate-pulse-dot' : 'bg-ink-600'}`} />
          webhook stream
        </span>
      </div>
    </header>
  )
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return s
  }
}

function ageFromDob(dob: string): number {
  const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(dob.trim())
  if (!m) return 0
  const birth = new Date(Number(m[1]), m[2] ? Number(m[2]) - 1 : 0, m[3] ? Number(m[3]) : 1)
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const monthDiff = now.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age--
  return Math.max(0, age)
}
