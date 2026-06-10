'use client'

// A plaync-look-alike signup experience whose "Guardian Consent" step is powered
// by the real k-ID API. The flow mirrors the actual plaync signup:
//   method -> terms -> country + date of birth -> [age-gate/check] -> branch
// The branch is driven entirely by the live age-gate/check response — exactly the
// decisions k-ID makes at a signup age gate:
//   PASS        -> account created
//   CHALLENGE (CHALLENGE_PARENTAL_CONSENT)        -> VPC guardian-consent flow
//   CHALLENGE (CHALLENGE_AGE_GATE_AGE_ASSURANCE)  -> hosted age check, session-linked
//   PROHIBITED  -> blocked (under the minimum age)
// Both challenge types are session-linked (challengeId -> challenge/get-status ->
// session/get). The standalone AgeKit+ Access Age Verification product is NOT used
// here: it returns only a verified age range with no kuid/session, so it can't tie
// into the account being created. Every hop is captured in the docked HTTP inspector.

import React from 'react'
import QRCode from 'qrcode'
import type {
  AgeGateCheckResponse,
  AgeGateRequirements,
  ChallengeStatusResponse,
  KidChallenge,
  KidSession,
  SendEmailResponse,
} from '@/lib/types'
import InspectorPanel from '../components/InspectorPanel'
import { useKidTraffic, type ChallengeWebhook } from './useKidTraffic'
import s from './plaync.module.css'

type Step = 'method' | 'terms' | 'input' | 'guardian' | 'ageassurance' | 'done' | 'blocked'

const COUNTRIES: [string, string][] = [
  ['KR', 'Korea, Republic of (KR)'],
  ['US-CA', 'United States — California (US-CA)'],
  ['US', 'United States (US)'],
  ['GB', 'United Kingdom (GB)'],
  ['DE', 'Germany (DE)'],
  ['FR', 'France (FR)'],
  ['AU', 'Australia (AU)'],
  ['JP', 'Japan (JP)'],
  ['BR', 'Brazil (BR)'],
]

// Convenience presets. The actual branch still comes from the live age-gate/check
// response — these only prefill the inputs.
const PRESETS: { label: string; jurisdiction: string; dob: [string, string, string] }[] = [
  // Adult over the consent age -> age-gate/check returns PASS.
  { label: 'Adult · PASS', jurisdiction: 'KR', dob: ['2000', '01', '15'] },
  // Under the consent age -> age-gate/check returns a parental-consent challenge.
  { label: 'Child · Parental consent', jurisdiction: 'US-CA', dob: ['2015', '06', '10'] },
]

const YEARS = Array.from({ length: 100 }, (_, i) => String(new Date().getFullYear() - i))
const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'))
const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'))

function ageFromDob(dob: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob)
  if (!m) return 0
  const birth = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const md = now.getMonth() - birth.getMonth()
  if (md < 0 || (md === 0 && now.getDate() < birth.getDate())) age--
  return Math.max(0, age)
}

export default function PlayncSignup() {
  const [step, setStep] = React.useState<Step>('method')
  const [jurisdiction, setJurisdiction] = React.useState('KR')
  const [year, setYear] = React.useState('2014')
  const [month, setMonth] = React.useState('03')
  const [day, setDay] = React.useState('22')
  const [guardianEmail, setGuardianEmail] = React.useState('parent@example.com')
  const [agreed, setAgreed] = React.useState({ tos: true, privacy: true, data: true, marketing: false })

  const [ageGate, setAgeGate] = React.useState<AgeGateCheckResponse | null>(null)
  const [challenge, setChallenge] = React.useState<KidChallenge | null>(null)
  const [challengeStatus, setChallengeStatus] = React.useState<ChallengeStatusResponse | null>(null)
  const [session, setSession] = React.useState<KidSession | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [inspectorOpen, setInspectorOpen] = React.useState(true)
  const [qrDataUrl, setQrDataUrl] = React.useState<string | null>(null)
  const [emailSentTo, setEmailSentTo] = React.useState<string | null>(null)

  const dob = `${year}-${month}-${day}`
  const challengeIdRef = React.useRef<string | null>(null)
  React.useEffect(() => {
    challengeIdRef.current = challenge?.challengeId ?? null
  }, [challenge])

  // Render the consent URL as a QR the guardian can scan with their phone.
  React.useEffect(() => {
    const url = challenge?.url
    if (!url) {
      setQrDataUrl(null)
      return
    }
    let cancelled = false
    QRCode.toDataURL(url, { margin: 1, width: 240 })
      .then((d) => { if (!cancelled) setQrDataUrl(d) })
      .catch(() => { if (!cancelled) setQrDataUrl(null) })
    return () => { cancelled = true }
  }, [challenge?.url])

  // When a Challenge.StateChange webhook resolves our challenge, advance in place.
  const onChallengeWebhook = React.useCallback((ev: ChallengeWebhook) => {
    if (!challengeIdRef.current || ev.challengeId !== challengeIdRef.current) return
    setChallengeStatus({ status: ev.status, sessionId: ev.sessionId, approverEmail: ev.approverEmail })
  }, [])

  const { config, exchanges, clearExchanges, webhookLive, proxyCall } = useKidTraffic(onChallengeWebhook)
  const testMode = config?.testMode ?? false

  // Once the challenge passes (webhook, poll, or simulate), fetch the session and finish.
  React.useEffect(() => {
    if (challengeStatus?.status !== 'PASS') return
    const sessionId = challengeStatus.sessionId ?? ageGate?.session?.sessionId
    if (!sessionId) {
      setStep('done')
      return
    }
    let cancelled = false
    ;(async () => {
      const res = await proxyCall<KidSession>(
        `/api/kid/session-get?sessionId=${encodeURIComponent(sessionId)}`,
        { method: 'GET' },
        'session/get',
      )
      if (!cancelled) {
        if (res?.ok && res.data) setSession(res.data)
        setStep('done')
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challengeStatus?.status])

  function resetFlowState() {
    setAgeGate(null)
    setChallenge(null)
    setChallengeStatus(null)
    setSession(null)
    setEmailSentTo(null)
    setError(null)
  }

  // Country + DOB -> requirements (jurisdiction context) + age-gate/check -> branch.
  // Every outcome here is session-linked; no standalone age-verification product.
  async function runAgeGate() {
    setLoading(true)
    setError(null)
    resetFlowState()
    try {
      // Informational: jurisdiction rules (consent age, etc.) show in the inspector.
      await proxyCall<AgeGateRequirements>(
        `/api/kid/requirements?jurisdiction=${encodeURIComponent(jurisdiction)}`,
        { method: 'GET' },
        'age-gate/get-requirements',
      )
      const res = await proxyCall<AgeGateCheckResponse>(
        '/api/kid/age-gate-check',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jurisdiction, dateOfBirth: dob }),
        },
        'age-gate/check',
      )
      if (!res?.ok || !res.data) {
        setError(res?.error || 'Age check failed. Please try again.')
        return
      }
      const data = res.data
      setAgeGate(data)
      if (data.status === 'CHALLENGE' && data.challenge) {
        // Both challenge types are session-linked and resolve via challenge/get-status:
        // parental consent (VPC) or a hosted age-gate age-assurance check.
        setChallenge(data.challenge)
        if (data.challenge.type === 'CHALLENGE_AGE_GATE_AGE_ASSURANCE') {
          setStep('ageassurance')
        } else {
          setStep('guardian')
        }
      } else if (data.status === 'PROHIBITED') {
        setStep('blocked')
      } else if (data.status === 'PASS') {
        if (data.session) setSession(data.session)
        setStep('done')
      } else {
        setError('Unexpected response from age check.')
      }
    } finally {
      setLoading(false)
    }
  }

  async function sendConsentEmail() {
    if (!challenge?.challengeId) return
    setLoading(true)
    setError(null)
    try {
      const res = await proxyCall<SendEmailResponse>(
        '/api/kid/send-email',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ challengeId: challenge.challengeId, email: guardianEmail, locale: 'en-US' }),
        },
        'challenge/send-email',
      )
      if (res?.ok) setEmailSentTo(guardianEmail)
      else setError(res?.error || 'Could not send the consent request.')
    } finally {
      setLoading(false)
    }
  }

  async function pollStatus() {
    if (!challenge?.challengeId) return
    setLoading(true)
    setError(null)
    try {
      const res = await proxyCall<ChallengeStatusResponse>(
        `/api/kid/challenge-status?challengeId=${encodeURIComponent(challenge.challengeId)}`,
        { method: 'GET' },
        'challenge/get-status',
      )
      if (res?.ok && res.data) setChallengeStatus(res.data)
      else setError(res?.error || 'Could not check status.')
    } finally {
      setLoading(false)
    }
  }

  // TEST-mode only: resolve the challenge without a real parent / hosted check.
  async function simulateApproval() {
    if (!challenge?.challengeId) return
    setLoading(true)
    setError(null)
    const isAgeAssurance = challenge.type === 'CHALLENGE_AGE_GATE_AGE_ASSURANCE'
    const age = isAgeAssurance ? 18 : ageFromDob(dob)
    try {
      const res = await proxyCall(
        '/api/kid/test-set-challenge-status',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            challengeId: challenge.challengeId,
            status: 'PASS',
            age,
            jurisdiction,
            approverEmail: guardianEmail || 'parent@example.com',
          }),
        },
        'test/set-challenge-status',
      )
      if (res?.ok) {
        // Re-read the real status so the inspector shows the PASS transition;
        // the session-fetch effect then advances to the result screen.
        await pollStatus()
      } else {
        setError(res?.error || 'Could not simulate approval.')
      }
    } finally {
      setLoading(false)
    }
  }

  function restart() {
    resetFlowState()
    setStep('method')
  }

  const stepIndex: Record<Step, number> = {
    method: 0, terms: 1, input: 2, guardian: 3, ageassurance: 3, done: 4, blocked: 3,
  }

  return (
    <div className={s.shell}>
      <div className={s.main}>
        <header className={s.header}>
          <a className={s.back} href="/" title="Back to k-ID Console">
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L9.06 10l3.71 3.71a.75.75 0 11-1.04 1.08l-4.25-4.25a.75.75 0 010-1.08l4.25-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
            </svg>
            Console
          </a>
          <span className={s.logo}>nc</span>
        </header>

        <div className={s.content}>
          {step !== 'method' && <Rail current={stepIndex[step]} />}

          {step === 'method' && <MethodStep onPick={() => setStep('terms')} />}
          {step === 'terms' && (
            <TermsStep agreed={agreed} setAgreed={setAgreed} onContinue={() => setStep('input')} />
          )}
          {step === 'input' && (
            <InputStep
              jurisdiction={jurisdiction}
              setJurisdiction={setJurisdiction}
              year={year} month={month} day={day}
              setYear={setYear} setMonth={setMonth} setDay={setDay}
              loading={loading} error={error}
              onPreset={(p) => { setJurisdiction(p.jurisdiction); setYear(p.dob[0]); setMonth(p.dob[1]); setDay(p.dob[2]) }}
              onNext={runAgeGate}
            />
          )}
          {step === 'guardian' && (
            <GuardianStep
              jurisdiction={jurisdiction}
              consentUrl={challenge?.url}
              qrDataUrl={qrDataUrl}
              otp={challenge?.oneTimePassword}
              otpExpiresAt={challenge?.otpExpiresAt}
              email={guardianEmail} setEmail={setGuardianEmail}
              emailSentTo={emailSentTo}
              testMode={testMode} loading={loading} error={error}
              onSend={sendConsentEmail} onPoll={pollStatus} onSimulate={simulateApproval}
            />
          )}
          {step === 'ageassurance' && (
            <AgeAssuranceStep
              url={challenge?.url}
              testMode={testMode} loading={loading} error={error}
              onPoll={pollStatus} onSimulate={simulateApproval}
            />
          )}
          {step === 'done' && <DoneStep session={session} onRestart={restart} />}
          {step === 'blocked' && <BlockedStep jurisdiction={jurisdiction} onRestart={restart} />}
        </div>

        <Footer />
      </div>

      <div className={`${s.dock} ${inspectorOpen ? '' : s.dockClosed} theme-dark-scope`}>
        {inspectorOpen ? (
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex items-center gap-2 border-b border-ink-700/70 px-3 py-2">
              <span className="font-mono text-[10px] uppercase tracking-wider text-ink-500">
                {webhookLive ? '● webhook live' : '○ webhook'}
              </span>
              {testMode && (
                <span className="rounded-full border border-pending/40 bg-pending/10 px-2 py-0.5 font-mono text-[10px] text-pending">
                  TEST MODE
                </span>
              )}
              <button
                type="button"
                onClick={() => setInspectorOpen(false)}
                className="ml-auto cursor-pointer rounded-full border border-ink-700 px-2 py-0.5 font-mono text-[11px] text-ink-300 hover:border-action/50 hover:text-action"
              >
                Hide ›
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <InspectorPanel exchanges={exchanges} onClear={clearExchanges} />
            </div>
          </div>
        ) : (
          <button type="button" className={s.reopen} onClick={() => setInspectorOpen(true)}>
            ‹ HTTP Inspector ({exchanges.length})
          </button>
        )}
      </div>

      <div className={s.dmPill}>🌙 OFF</div>
    </div>
  )
}

// ── step rail ────────────────────────────────────────────────────────────────

function Rail({ current }: { current: number }) {
  // 4 visible nodes: Terms · Info · Verify · Done (method step hides the rail).
  const nodes = [1, 2, 3, 4]
  return (
    <div className={s.rail}>
      {nodes.map((n, i) => {
        const done = current > n
        const on = current === n
        return (
          <React.Fragment key={n}>
            <span className={`${s.node} ${done ? s.nodeDone : on ? s.nodeOn : ''}`}>
              {done ? '✓' : n}
            </span>
            {i < nodes.length - 1 && <span className={`${s.bar} ${current > n ? s.barDone : ''}`} />}
          </React.Fragment>
        )
      })}
    </div>
  )
}

// ── steps ──────────────────────────────────────────────────────────────────

function MethodStep({ onPick }: { onPick: () => void }) {
  const socials = ['Google', 'Facebook', 'Apple', 'Twitter', 'LINE', 'Steam', 'PlayStation', 'Xbox']
  return (
    <div className={s.col}>
      <h1 className={s.h1}>Sign Up</h1>
      <p className={s.sub}>Select the method of sign-up.</p>
      <button className={s.method} onClick={onPick}>
        <span className={s.mIcon} style={{ color: '#0a2a52' }}>nc</span> Sign-up with e-mail address
      </button>
      <button className={s.method} onClick={onPick}>
        <span className={s.mIcon}>☎</span> Sign-up with Phone Number
      </button>
      <div className={s.orline}>or</div>
      {socials.map((p) => (
        <button key={p} className={s.method} onClick={onPick}>
          <span className={s.mIcon}>{p[0]}</span> Sign-up with {p}
        </button>
      ))}
    </div>
  )
}

function TermsStep({
  agreed, setAgreed, onContinue,
}: {
  agreed: { tos: boolean; privacy: boolean; data: boolean; marketing: boolean }
  setAgreed: React.Dispatch<React.SetStateAction<{ tos: boolean; privacy: boolean; data: boolean; marketing: boolean }>>
  onContinue: () => void
}) {
  const allRequired = agreed.tos && agreed.privacy && agreed.data
  const all = allRequired && agreed.marketing
  const toggleAll = () => {
    const next = !all
    setAgreed({ tos: next, privacy: next, data: next, marketing: next })
  }
  const Row = ({ k, label, required }: { k: keyof typeof agreed; label: string; required?: boolean }) => (
    <div className={s.termsRow} onClick={() => setAgreed((a) => ({ ...a, [k]: !a[k] }))}>
      <span className={`${s.ck} ${agreed[k] ? s.ckOn : ''}`}>{agreed[k] ? '✓' : ''}</span>
      <span className={required ? s.req : s.opt}>[{required ? 'Required' : 'Optional'}]</span> {label}
      <span className={s.arrow}>›</span>
    </div>
  )
  return (
    <div className={s.col}>
      <h1 className={s.h1}>Sign Up</h1>
      <p className={s.sub}>Please agree to the terms to create your plaync account.</p>
      <div className={s.terms}>
        <div className={s.termsAll} onClick={toggleAll}>
          <span className={`${s.ck} ${all ? s.ckAll : ''}`}>{all ? '✓' : ''}</span> Agree to all
        </div>
        <Row k="tos" label="Terms of Service" required />
        <Row k="privacy" label="Privacy Policy" required />
        <Row k="data" label="Collection & use of personal data" required />
        <Row k="marketing" label="Receive marketing e-mails" />
      </div>
      <button className={s.btn} disabled={!allRequired} onClick={onContinue}>
        Agree &amp; Continue
      </button>
    </div>
  )
}

function InputStep({
  jurisdiction, setJurisdiction, year, month, day, setYear, setMonth, setDay,
  loading, error, onPreset, onNext,
}: {
  jurisdiction: string
  setJurisdiction: (v: string) => void
  year: string; month: string; day: string
  setYear: (v: string) => void; setMonth: (v: string) => void; setDay: (v: string) => void
  loading: boolean; error: string | null
  onPreset: (p: (typeof PRESETS)[number]) => void
  onNext: () => void
}) {
  return (
    <div className={s.col}>
      <h1 className={s.h1}>Sign Up</h1>
      <p className={s.sub}>Select your country and date of birth.</p>

      <div className={s.presets}>
        <span className={s.presetLabel}>Demo presets</span>
        {PRESETS.map((p) => (
          <button key={p.label} className={s.preset} onClick={() => onPreset(p)}>{p.label}</button>
        ))}
      </div>

      <div className={s.lab}>Country / Region</div>
      <select className={s.field} value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)}>
        {COUNTRIES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
      </select>

      <div className={s.lab}>Date of birth</div>
      <div className={s.dob}>
        <select className={s.field} value={year} onChange={(e) => setYear(e.target.value)}>
          {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select className={s.field} value={month} onChange={(e) => setMonth(e.target.value)}>
          {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select className={s.field} value={day} onChange={(e) => setDay(e.target.value)}>
          {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {error && <div className={s.errbox}>{error}</div>}
      <button className={s.btn} disabled={loading} onClick={onNext}>
        {loading ? 'Checking…' : 'Next'}
      </button>
    </div>
  )
}

function CopyMini({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = React.useState(false)
  return (
    <button
      type="button"
      className={s.miniBtn}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 1200)
        } catch { /* clipboard unavailable */ }
      }}
    >
      {copied ? 'Copied ✓' : label}
    </button>
  )
}

function fmtExpiry(iso?: string): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `expires ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// One screen exposing EVERY way a guardian can approve: scan a QR, open/copy the
// consent link, read the OTP aloud, or have it emailed — plus the live approval
// status (webhook/poll/simulate). All come from the same parental-consent challenge.
function GuardianStep({
  jurisdiction, consentUrl, qrDataUrl, otp, otpExpiresAt,
  email, setEmail, emailSentTo, testMode, loading, error,
  onSend, onPoll, onSimulate,
}: {
  jurisdiction: string
  consentUrl?: string
  qrDataUrl: string | null
  otp?: string
  otpExpiresAt?: string
  email: string; setEmail: (v: string) => void
  emailSentTo: string | null
  testMode: boolean; loading: boolean; error: string | null
  onSend: () => void; onPoll: () => void; onSimulate: () => void
}) {
  const exp = fmtExpiry(otpExpiresAt)
  return (
    <div className={s.col}>
      <h1 className={s.h1}>Guardian Consent</h1>
      <p className={s.sub}>
        You&apos;re under the digital consent age in {jurisdiction}, so a parent or
        guardian must approve your account. Use whichever option is easiest for them.
      </p>
      <div className={s.callout}>
        <span className={s.calloutI}>i</span>
        <div>Your account stays on hold until a guardian approves. No personal data is shared until consent is granted.</div>
      </div>

      <div className={s.methodGrid}>
        {/* QR */}
        <div className={s.mCard}>
          <div className={s.mHead}><span className={s.mTag}>QR</span> Scan with a phone</div>
          <p className={s.mDesc}>Have your guardian scan this with their phone camera to open the approval page.</p>
          <div className={s.qrRow}>
            <div className={s.qrBox}>
              {qrDataUrl
                ? <img src={qrDataUrl} alt="Consent QR code" />
                : <div style={{ fontSize: 11, color: '#b6bbc4', display: 'grid', placeItems: 'center', height: '100%' }}>Generating…</div>}
            </div>
            <p className={s.mDesc} style={{ margin: 0 }}>
              The QR opens the secure k-ID consent page where your guardian confirms their identity and approves.
            </p>
          </div>
        </div>

        {/* Link */}
        <div className={s.mCard}>
          <div className={s.mHead}><span className={s.mTag}>LINK</span> Share the approval link</div>
          <p className={s.mDesc}>Send this link to your guardian through any messenger.</p>
          <div className={s.linkRow}>
            <input className={s.linkInput} readOnly value={consentUrl ?? ''} />
            {consentUrl && <CopyMini text={consentUrl} />}
            {consentUrl && (
              <a className={s.miniBtn} href={consentUrl} target="_blank" rel="noreferrer" style={{ display: 'grid', placeItems: 'center', textDecoration: 'none' }}>Open ↗</a>
            )}
          </div>
        </div>

        {/* OTP */}
        {otp && (
          <div className={s.mCard}>
            <div className={s.mHead}><span className={s.mTag}>OTP</span> One-time code</div>
            <p className={s.mDesc}>Your guardian can enter this code on the k-ID consent page.</p>
            <div className={s.otpBig}>
              <span className={s.code}>{otp}</span>
              <CopyMini text={otp} />
              {exp && <span className={s.exp}>{exp}</span>}
            </div>
          </div>
        )}

        {/* Email */}
        <div className={s.mCard}>
          <div className={s.mHead}><span className={s.mTag}>EMAIL</span> Email the request</div>
          <p className={s.mDesc}>We&apos;ll email the approval link straight to your guardian.</p>
          <div className={s.emailRow}>
            <input className={s.field} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="parent@example.com" />
            <button className={s.miniBtn} disabled={loading || !email} onClick={onSend}>
              {loading ? 'Sending…' : 'Send'}
            </button>
          </div>
          {emailSentTo && <div className={s.sent}>✓ Sent to {emailSentTo}</div>}
        </div>
      </div>

      <div className={s.divider} />

      <div className={s.statusBar}><span className={s.spin} /> Waiting for guardian approval…</div>
      {error && <div className={s.errbox}>{error}</div>}
      <button className={s.btn} disabled={loading} onClick={onPoll}>
        {loading ? 'Checking…' : 'My guardian approved — check now'}
      </button>
      {testMode && (
        <button className={s.btnAlt} disabled={loading} onClick={onSimulate}>
          ⚡ Simulate guardian approval (TEST)
        </button>
      )}
      <div className={s.kidNote}><span className={s.dot} /> Parental consent verified by k-ID</div>
    </div>
  )
}

function AgeAssuranceStep({
  url, testMode, loading, error, onPoll, onSimulate,
}: {
  url?: string; testMode: boolean; loading: boolean; error: string | null
  onPoll: () => void; onSimulate: () => void
}) {
  const openUrl = url
  return (
    <div className={s.col}>
      <h1 className={s.h1}>Verify your age</h1>
      <p className={s.sub}>
        Your region requires a quick age check before you can continue.<br />
        Complete the secure verification below.
      </p>
      {url ? (
        <iframe
          src={url}
          title="Age verification"
          style={{ width: '100%', height: 380, border: '1px solid #c6cfd8' }}
        />
      ) : (
        <div className={s.callout}><span className={s.calloutI}>i</span><div>Preparing secure verification…</div></div>
      )}
      {openUrl && (
        <a href={openUrl} target="_blank" rel="noreferrer" className={s.btnAlt} style={{ display: 'grid', placeItems: 'center', textDecoration: 'none' }}>
          Open in a new window ↗
        </a>
      )}
      {error && <div className={s.errbox}>{error}</div>}
      <button className={s.btn} disabled={loading} onClick={onPoll}>
        {loading ? 'Checking…' : 'I’ve finished — check now'}
      </button>
      {testMode && (
        <button className={s.btnAlt} disabled={loading} onClick={onSimulate}>
          ⚡ Simulate successful verification (TEST)
        </button>
      )}
      <div className={s.kidNote}><span className={s.dot} /> Age assurance by k-ID</div>
    </div>
  )
}

function DoneStep({ session, onRestart }: { session: KidSession | null; onRestart: () => void }) {
  return (
    <div className={s.col}>
      <div className={`${s.bigIcon} ${s.bigPass}`}>✓</div>
      <h1 className={s.h1}>Welcome to plaync</h1>
      <p className={s.sub}>Your account is ready. Age verification is complete.</p>
      {session && (
        <>
          <div className={s.lab}>Your account permissions</div>
          <div className={s.permList}>
            {session.permissions.slice(0, 8).map((p) => (
              <div key={p.name} className={s.permRow}>
                {p.name}
                <span className={`${s.permState} ${p.enabled ? s.permOn : s.permOff}`}>
                  {p.enabled ? 'ON' : 'OFF'}
                </span>
              </div>
            ))}
            {session.permissions.length === 0 && (
              <div className={s.permRow} style={{ color: '#9aa0aa' }}>No managed permissions returned.</div>
            )}
          </div>
        </>
      )}
      <button className={s.btnAlt} onClick={onRestart} style={{ marginTop: 24 }}>Start over</button>
    </div>
  )
}

function BlockedStep({ jurisdiction, onRestart }: { jurisdiction: string; onRestart: () => void }) {
  return (
    <div className={s.col}>
      <div className={`${s.bigIcon} ${s.bigBlock}`}>✕</div>
      <h1 className={s.h1}>Sign-up unavailable</h1>
      <p className={s.sub}>
        We&apos;re sorry — based on your date of birth, you don&apos;t meet the minimum age
        to create an account in {jurisdiction}.
      </p>
      <button className={s.btnAlt} onClick={onRestart} style={{ marginTop: 8 }}>Back to start</button>
    </div>
  )
}

function Footer() {
  return (
    <div className={s.foot}>
      <select defaultValue="English"><option>English</option></select>
      <div className={s.footLinks}>
        <a>Company Information</a><a><b>Privacy Policy</b></a><a>Operation Policy</a>
        <a>Right of data subjects</a><a>Cookie Policy</a><a>SUPPORT</a>
      </div>
      <div className={s.footCorp}>
        Company name NC Corporation · Co-CEO Kim Taek-Jin, Park Byung-Moo · Business Registration
        Number 220-81-43000 · © NC Corporation. All Rights Reserved.
      </div>
    </div>
  )
}
