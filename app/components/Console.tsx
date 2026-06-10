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
  SessionUpgradeResponse,
  VerificationStatusResponse,
} from '@/lib/types'
import { type ActiveFlow, type FlowInputs } from './FlowPanel'
import FlowStepper, { type FlowState, type StepHandlers } from './FlowStepper'
import { EMPTY_UPGRADE, type UpgradeState } from './SessionUpgradePanel'
import AgeVerificationFlow, { type AccessFlowState } from './AgeVerificationFlow'
import InspectorPanel from './InspectorPanel'
import ThemeToggle from './ThemeToggle'

const JURISDICTIONS: [string, string][] = [
  ['US-CA', 'California, US'],
  ['US', 'United States'],
  ['GB', 'United Kingdom'],
  ['DE', 'Germany'],
  ['FR', 'France'],
  ['KR', 'South Korea'],
  ['AU', 'Australia'],
  ['BR', 'Brazil'],
  ['JP', 'Japan'],
]

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
  const [webhookLive, setWebhookLive] = React.useState(false)
  const [activeFlow, setActiveFlow] = React.useState<ActiveFlow>('access')
  const [productId, setProductId] = React.useState<string>('')
  // Linked highlight: hovering a flow step highlights its HTTP exchange(s).
  const [highlightKey, setHighlightKey] = React.useState<string | null>(null)

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
  const [upgrade, setUpgrade] = React.useState<UpgradeState>(EMPTY_UPGRADE)
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

  // Latest sessionId, readable from the webhook callback without re-binding it.
  const sessionIdRef = React.useRef<string | null>(null)
  React.useEffect(() => {
    sessionIdRef.current = flow.session?.sessionId ?? null
  }, [flow.session])
  // Bumped when a Session.ChangePermissions webhook targets our session.
  const [permTick, setPermTick] = React.useState(0)

  // Inbound webhooks drive the flow in place — no manual poll needed:
  // · Challenge.StateChange { data: { id: <challengeId>, status, sessionId?, approverEmail? } }
  //   resolves step 4 and/or the in-game upgrade challenge.
  // · Session.ChangePermissions (parent toggled permissions on the consent page)
  //   triggers a session re-fetch.
  const applyChallengeWebhook = React.useCallback((ev: HttpExchange) => {
    if (ev.hop !== 'webhook' || ev.response?.ok === false) return
    const body = ev.request.body as
      | { eventType?: string; data?: { id?: string; status?: string; sessionId?: string; approverEmail?: string } }
      | null
    if (!body?.data) return
    if (body.eventType === 'Session.ChangePermissions') {
      if (body.data.sessionId && body.data.sessionId === sessionIdRef.current) {
        setPermTick((t) => t + 1)
      }
      return
    }
    if (body.eventType !== 'Challenge.StateChange') return
    const { id, status, sessionId, approverEmail } = body.data
    if (!id || !status) return
    setFlow((f) => {
      if (f.ageGate?.challenge?.challengeId !== id) return f
      return {
        ...f,
        challengeStatus: {
          status: status as ChallengeStatusResponse['status'],
          sessionId: sessionId ?? f.challengeStatus?.sessionId,
          approverEmail: approverEmail ?? f.challengeStatus?.approverEmail,
        },
        challengeStatusSource: 'webhook',
      }
    })
    // The same webhook also resolves an in-game session-upgrade challenge.
    setUpgrade((u) => {
      if (u.response?.challenge?.challengeId !== id) return u
      return {
        ...u,
        challengeStatus: {
          status: status as ChallengeStatusResponse['status'],
          sessionId: sessionId ?? u.challengeStatus?.sessionId,
          approverEmail: approverEmail ?? u.challengeStatus?.approverEmail,
        },
        challengeStatusSource: 'webhook',
      }
    })
  }, [])

  // Webhook feed: poll the shared event store. SSE doesn't survive Vercel's
  // serverless split (webhook POST and stream land on different instances),
  // so the inspector pulls instead — works identically in dev and deployed.
  React.useEffect(() => {
    let cursor = -1 // first poll only establishes the server-time cursor
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    // The overlapping cursor can re-deliver events; process each id once.
    const processed = new Set<string>()

    async function poll() {
      if (stopped) return
      if (document.visibilityState === 'visible') {
        try {
          const res = await fetch(`/api/webhook/events?since=${cursor}`, { cache: 'no-store' })
          const json = (await res.json()) as { ok: boolean; events?: HttpExchange[]; now?: number }
          if (json.ok && typeof json.now === 'number') {
            setWebhookLive(true)
            // Overlap the cursor window so boundary events can't be missed;
            // re-delivered ones are deduped by exchange id below.
            cursor = json.now - 2000
            const fresh = (json.events ?? []).filter((e) => !processed.has(e.id))
            if (fresh.length > 0) {
              fresh.forEach((e) => processed.add(e.id))
              setExchanges((prev) => {
                const seen = new Set(prev.map((e) => e.id))
                const next = fresh.filter((e) => !seen.has(e.id))
                return next.length > 0 ? [...next, ...prev] : prev
              })
              // fresh is newest-first; apply oldest→newest so the latest
              // state change ends up in the flow.
              for (let i = fresh.length - 1; i >= 0; i--) applyChallengeWebhook(fresh[i])
            }
          } else {
            setWebhookLive(false)
          }
        } catch {
          setWebhookLive(false)
        }
      }
      timer = setTimeout(poll, 3000)
    }

    poll()
    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
    }
  }, [applyChallengeWebhook])

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
        setUpgrade(EMPTY_UPGRADE)
        setFlow((f) => ({
          ...f,
          ageGate: res.data!,
          emailSentTo: null,
          challengeStatus: null,
          challengeStatusSource: undefined,
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
      if (res?.ok && res.data)
        setFlow((f) => ({ ...f, challengeStatus: res.data!, challengeStatusSource: 'api' }))
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

  // ── In-game session upgrade handlers ─────────────────────────────────────────

  async function runUpgrade(permission: string) {
    const current = upgrade.upgraded ?? flow.session
    const sessionId = current?.sessionId
    if (!sessionId) return
    setLoadingStep('upgrade')
    setUpgrade({ ...EMPTY_UPGRADE, permission, before: current })
    try {
      const res = await proxyCall<SessionUpgradeResponse>(
        '/api/kid/session-upgrade',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, requestedPermissions: [{ name: permission }] }),
        },
        'session/upgrade',
      )
      if (res?.ok && res.data) {
        const data = res.data
        setUpgrade((u) => ({
          ...u,
          response: data,
          // PLAYER-managed permissions resolve instantly with the new session.
          upgraded: data.challenge ? null : (data.session ?? null),
        }))
        if (!data.challenge && data.session) setFlow((f) => ({ ...f, session: data.session! }))
      } else {
        setUpgrade((u) => ({ ...u, error: res?.error || 'Request failed' }))
      }
    } finally {
      setLoadingStep(null)
    }
  }

  async function runUpgradeSendEmail() {
    const challengeId = upgrade.response?.challenge?.challengeId
    if (!challengeId || !inputs.parentEmail) return
    setLoadingStep('upgrade-email')
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
      if (res?.ok) setUpgrade((u) => ({ ...u, emailSentTo: inputs.parentEmail, error: undefined }))
      else setUpgrade((u) => ({ ...u, error: res?.error || 'Request failed' }))
    } finally {
      setLoadingStep(null)
    }
  }

  async function runUpgradePoll() {
    const challengeId = upgrade.response?.challenge?.challengeId
    if (!challengeId) return
    setLoadingStep('upgrade-poll')
    try {
      const res = await proxyCall<ChallengeStatusResponse>(
        `/api/kid/challenge-status?challengeId=${encodeURIComponent(challengeId)}`,
        { method: 'GET' },
        'challenge/get-status',
      )
      if (res?.ok && res.data)
        setUpgrade((u) => ({ ...u, challengeStatus: res.data!, challengeStatusSource: 'api', error: undefined }))
      else setUpgrade((u) => ({ ...u, error: res?.error || 'Request failed' }))
    } finally {
      setLoadingStep(null)
    }
  }

  async function runUpgradeSimulate() {
    const ch = upgrade.response?.challenge
    if (!ch) return
    setLoadingStep('upgrade-sim')
    const base = upgrade.before ?? flow.session
    const isAgeAssurance = ch.type === 'CHALLENGE_SESSION_UPGRADE_BY_AGE_ASSURANCE'
    const threshold = base?.permissions.find(
      (p) => p.name === upgrade.permission,
    )?.verifiedAgeThreshold
    // An age-assurance challenge passes on the PLAYER's verified age — use the
    // permission's threshold; a consent challenge passes on the child's age.
    const age = isAgeAssurance
      ? (threshold ?? 18)
      : inputs.age
        ? Number(inputs.age)
        : ageFromDob(inputs.dateOfBirth)
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
      if (res?.ok) {
        // A simulated consent PASS only resolves the challenge — k-ID does not
        // enable anything by itself. Emulate the parent ticking the requested
        // permission on the consent page (full-set semantics). Verified-age
        // permissions are NOT guardian-managed, so skip this for age assurance.
        if (!isAgeAssurance) {
          const enabled = (base?.permissions ?? [])
            .filter((p) => p.managedBy === 'GUARDIAN' && p.enabled)
            .map((p) => p.name)
          if (upgrade.permission && !enabled.includes(upgrade.permission)) {
            enabled.push(upgrade.permission)
          }
          if (base?.sessionId) {
            await proxyCall(
              '/api/kid/set-guardian-permissions',
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId: base.sessionId, enabledPermissions: enabled }),
              },
              'session/set-guardian-managed-permissions',
            )
          }
        }
        setUpgrade((u) => ({ ...u, consentSimulated: true }))
      }
    } finally {
      setLoadingStep(null)
    }
  }

  // A Session.ChangePermissions webhook targeted our session — re-fetch it so
  // the permissions table and the game action bar reflect the parent's change.
  React.useEffect(() => {
    if (permTick === 0) return
    const sessionId = sessionIdRef.current
    if (!sessionId) return
    let cancelled = false
    ;(async () => {
      const res = await proxyCall<KidSession>(
        `/api/kid/session-get?sessionId=${encodeURIComponent(sessionId)}`,
        { method: 'GET' },
        'session/get',
      )
      if (!cancelled && res?.ok && res.data) {
        setFlow((f) => ({ ...f, session: res.data! }))
        setUpgrade((u) => (u.permission ? { ...u, upgraded: res.data! } : u))
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permTick])

  // Once the upgrade challenge passes (poll, simulate, or ⚡webhook), re-fetch
  // the session so the diff and the game action bar reflect the new permissions.
  // Prefer the ORIGINAL sessionId: a simulated challenge PASS can mint a new
  // session, and refreshing that one would miss the permissions we changed.
  const upgradeNeedsRefresh = upgrade.challengeStatus?.status === 'PASS' && !upgrade.upgraded
  React.useEffect(() => {
    if (!upgradeNeedsRefresh) return
    const sessionId =
      upgrade.before?.sessionId ?? flow.session?.sessionId ?? upgrade.challengeStatus?.sessionId
    if (!sessionId) return
    let cancelled = false
    ;(async () => {
      setLoadingStep('upgrade-refresh')
      try {
        const res = await proxyCall<KidSession>(
          `/api/kid/session-get?sessionId=${encodeURIComponent(sessionId)}`,
          { method: 'GET' },
          'session/get',
        )
        if (!cancelled && res?.ok && res.data) {
          setUpgrade((u) => ({ ...u, upgraded: res.data! }))
          setFlow((f) => ({ ...f, session: res.data! }))
        }
      } finally {
        if (!cancelled) setLoadingStep(null)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upgradeNeedsRefresh])

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
    setUpgrade(EMPTY_UPGRADE)
    setAccess(EMPTY_ACCESS)
    setConsentSimulated(false)
    setVerificationSimulated(false)
  }

  return (
    <div className="flex min-h-screen flex-col bg-ink-900 lg:h-screen lg:overflow-hidden">
      <TopBar config={config} webhookLive={webhookLive} />
      <ContextToolbar
        config={config}
        productId={productId}
        onProductChange={setProductId}
        jurisdiction={inputs.jurisdiction}
        onJurisdictionChange={(j) => setInputs((p) => ({ ...p, jurisdiction: j }))}
        activeFlow={activeFlow}
        onFlowChange={setActiveFlow}
        onReset={resetAll}
      />

      <main className="flex flex-1 flex-col lg:grid lg:min-h-0 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="min-h-0 border-b border-ink-700/50 lg:overflow-hidden lg:border-b-0 lg:border-r">
          {activeFlow === 'access' ? (
            <AgeVerificationFlow
              inputs={inputs}
              onChange={setInputs}
              state={access}
              loadingStep={loadingStep}
              testMode={testMode}
              verificationSimulated={verificationSimulated}
              onStart={runAccessAv}
              onPollStatus={runVerifyStatus}
              onSimulateVerification={runSimulateVerification}
              onHoverStep={setHighlightKey}
            />
          ) : (
            <FlowStepper
              inputs={inputs}
              onChange={setInputs}
              state={flow}
              loadingStep={loadingStep}
              testMode={testMode}
              consentSimulated={consentSimulated}
              handlers={stepHandlers}
              upgrade={upgrade}
              upgradeHandlers={{
                onRequest: runUpgrade,
                onSendEmail: runUpgradeSendEmail,
                onPoll: runUpgradePoll,
                onSimulateConsent: runUpgradeSimulate,
              }}
              onSimulateConsent={runSimulateConsent}
              onHoverStep={setHighlightKey}
            />
          )}
        </div>

        <div className="min-h-0 lg:overflow-hidden">
          <InspectorPanel
            exchanges={exchanges}
            onClear={() => setExchanges([])}
            highlightKey={highlightKey}
          />
        </div>
      </main>
    </div>
  )
}

// ── context toolbar (consolidated global controls) ───────────────────────────

function ContextToolbar({
  config,
  productId,
  onProductChange,
  jurisdiction,
  onJurisdictionChange,
  activeFlow,
  onFlowChange,
  onReset,
}: {
  config: KidConfig | null
  productId: string
  onProductChange: (id: string) => void
  jurisdiction: string
  onJurisdictionChange: (j: string) => void
  activeFlow: ActiveFlow
  onFlowChange: (f: ActiveFlow) => void
  onReset: () => void
}) {
  return (
    <div className="z-10 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-ink-700/60 bg-ink-950/40 px-4 py-2.5 theme-tx">
      {config && config.products.length > 0 && (
        <ToolGroup label="Product">
          <select
            value={productId}
            onChange={(e) => onProductChange(e.target.value)}
            className="cursor-pointer rounded-full border border-action/40 bg-action/5 px-3 py-1.5 font-mono text-[12px] text-ink-100 outline-none transition-colors focus:border-action/60"
          >
            {config.products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
                {p.hasKey ? '' : ' — no key'}
              </option>
            ))}
          </select>
        </ToolGroup>
      )}

      <ToolGroup label="Region">
        <select
          value={jurisdiction}
          onChange={(e) => onJurisdictionChange(e.target.value)}
          className="cursor-pointer rounded-full border border-ink-700 bg-ink-900/60 px-3 py-1.5 font-mono text-[12px] text-ink-100 outline-none transition-colors focus:border-action/60"
        >
          {JURISDICTIONS.map(([code, name]) => (
            <option key={code} value={code}>
              {code} — {name}
            </option>
          ))}
        </select>
      </ToolGroup>

      <Segmented active={activeFlow} onChange={onFlowChange} />

      <button
        type="button"
        onClick={onReset}
        className="ml-auto cursor-pointer rounded-full border border-ink-700 px-3.5 py-1.5 font-mono text-[12px] text-ink-300 transition-all duration-200 ease-apple active:scale-95 hover:border-action/50 hover:text-action"
      >
        Reset
      </button>
    </div>
  )
}

function ToolGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-500">
        {label}
      </span>
      {children}
    </div>
  )
}

function Segmented({ active, onChange }: { active: ActiveFlow; onChange: (f: ActiveFlow) => void }) {
  return (
    <div className="relative grid grid-cols-2 overflow-hidden rounded-full border border-ink-700/70 bg-ink-900/60">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-1/2 rounded-full bg-action/15 ring-1 ring-inset ring-action/40 transition-transform duration-300 ease-apple"
        style={{ transform: active === 'agegate' ? 'translateX(100%)' : 'translateX(0)' }}
      />
      <SegTab active={active === 'access'} onClick={() => onChange('access')}>
        AgeKit+ Access
      </SegTab>
      <SegTab active={active === 'agegate'} onClick={() => onChange('agegate')}>
        Age-gate + VPC
      </SegTab>
    </div>
  )
}

function SegTab({
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
      className={`relative z-10 cursor-pointer whitespace-nowrap rounded-full px-4 py-1.5 text-center font-mono text-[12px] font-medium transition-colors duration-200 ${
        active ? 'text-action' : 'text-ink-400 hover:text-ink-100'
      }`}
    >
      {children}
    </button>
  )
}

function TopBar({ config, webhookLive }: { config: KidConfig | null; webhookLive: boolean }) {
  return (
    <header className="grid-bg sticky top-0 z-20 flex shrink-0 items-center gap-3 border-b border-ink-700/70 bg-ink-950/70 px-4 py-3 backdrop-blur-md backdrop-saturate-150 theme-tx">
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-action/15 ring-1 ring-action/40 shadow-glow">
        <svg className="h-4 w-4 text-action" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" />
        </svg>
      </div>
      <div className="min-w-0">
        <h1 className="text-[15px] font-semibold tracking-apple text-ink-50">K-ID VPC Console</h1>
        <p className="truncate font-mono text-[11px] text-ink-500">
          AgeKit+ Age Verification · CDK Age-gate · Verifiable Parental Consent · live HTTP inspector
        </p>
      </div>

      <div className="ml-auto flex items-center gap-2.5 font-mono text-[11px]">
        {config && (
          <span
            className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 sm:inline-flex ${
              config.testMode
                ? 'border-pending/40 bg-pending/10 text-pending'
                : 'border-prohibited/40 bg-prohibited/10 text-prohibited'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${config.testMode ? 'bg-pending' : 'bg-prohibited'}`} />
            {config.testMode ? 'TEST MODE' : 'LIVE MODE'}
          </span>
        )}
        <span className="hidden items-center gap-1.5 rounded-full border border-ink-700/70 bg-ink-900/50 px-2.5 py-1 text-ink-400 sm:inline-flex">
          <span className={`h-2 w-2 rounded-full ${webhookLive ? 'bg-run animate-pulse-dot' : 'bg-ink-600'}`} />
          webhook feed
        </span>
        <ThemeToggle />
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
