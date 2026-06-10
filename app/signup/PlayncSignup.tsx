'use client'

// A plaync-look-alike signup whose age gate is powered by the real k-ID API.
// Flow:  방법 선택 -> 정보 입력(국가 + 생년월일/나이 + 약관) -> [age-gate/check] -> 분기
// Branch comes straight from the live age-gate/check response — the decisions k-ID
// actually makes at a signup age gate, all session-linked:
//   PASS        -> 계정 생성
//   CHALLENGE_PARENTAL_CONSENT       -> 보호자 동의(VPC)
//   CHALLENGE_AGE_GATE_AGE_ASSURANCE -> 호스티드 연령 확인 (challenge.url, 세션 연결)
//   PROHIBITED  -> 차단
// The standalone AgeKit+ Access Age Verification product is NOT used (no kuid/session).
// Every hop is captured in the docked HTTP inspector (kept dark for contrast).

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

type Step = 'method' | 'input' | 'guardian' | 'ageassurance' | 'done' | 'blocked'
type AgeMode = 'dob' | 'slider'

const COUNTRIES: [string, string][] = [
  ['KR', 'Korea, Republic of'],
  ['US', 'United States'],
  ['US-CA', 'United States — California'],
  ['GB', 'United Kingdom'],
  ['DE', 'Germany'],
  ['FR', 'France'],
  ['AU', 'Australia'],
  ['BR', 'Brazil'],
  ['JP', 'Japan'],
]

// Demo presets. The branch still comes from the live response; presets only prefill
// the inputs (and the product, since age assurance is configured on product 18887).
type Preset = { label: string; jurisdiction: string; dob: string; productId?: string }
const PRESETS: Preset[] = [
  { label: '성인 · 통과(PASS)', jurisdiction: 'KR', dob: '2000-01-15' },
  { label: '아동 · 보호자 동의(VPC)', jurisdiction: 'US-CA', dob: '2015-06-10' },
  { label: '브라질 · 연령확인(Age Assurance)', jurisdiction: 'BR', dob: '2000-01-15', productId: '18887' },
]

const DOB_RE = /^\d{4}-\d{2}-\d{2}$/

function ageFromDob(dob: string): number {
  const m = DOB_RE.exec(dob)
  if (!m) return 0
  const [y, mo, d] = dob.split('-').map(Number)
  const birth = new Date(y, mo - 1, d)
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const md = now.getMonth() - birth.getMonth()
  if (md < 0 || (md === 0 && now.getDate() < birth.getDate())) age--
  return Math.max(0, age)
}

export default function PlayncSignup() {
  const [step, setStep] = React.useState<Step>('method')
  const [jurisdiction, setJurisdiction] = React.useState('KR')
  const [dob, setDob] = React.useState('')
  const [ageMode, setAgeMode] = React.useState<AgeMode>('dob')
  const [sliderAge, setSliderAge] = React.useState(20)
  const [methods, setMethods] = React.useState<string[]>([])
  const [agree, setAgree] = React.useState({ tos: false, privacy: false })
  const [showWhy, setShowWhy] = React.useState(false)

  const [guardianEmail, setGuardianEmail] = React.useState('parent@example.com')
  const [ageGate, setAgeGate] = React.useState<AgeGateCheckResponse | null>(null)
  const [challenge, setChallenge] = React.useState<KidChallenge | null>(null)
  const [challengeStatus, setChallengeStatus] = React.useState<ChallengeStatusResponse | null>(null)
  const [session, setSession] = React.useState<KidSession | null>(null)
  const [qrDataUrl, setQrDataUrl] = React.useState<string | null>(null)
  const [emailSentTo, setEmailSentTo] = React.useState<string | null>(null)

  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [inspectorOpen, setInspectorOpen] = React.useState(true)

  const challengeIdRef = React.useRef<string | null>(null)
  React.useEffect(() => {
    challengeIdRef.current = challenge?.challengeId ?? null
  }, [challenge])

  React.useEffect(() => {
    const url = challenge?.url
    if (!url) { setQrDataUrl(null); return }
    let cancelled = false
    QRCode.toDataURL(url, { margin: 1, width: 240 })
      .then((d) => { if (!cancelled) setQrDataUrl(d) })
      .catch(() => { if (!cancelled) setQrDataUrl(null) })
    return () => { cancelled = true }
  }, [challenge?.url])

  const onChallengeWebhook = React.useCallback((ev: ChallengeWebhook) => {
    if (!challengeIdRef.current || ev.challengeId !== challengeIdRef.current) return
    setChallengeStatus({ status: ev.status, sessionId: ev.sessionId, approverEmail: ev.approverEmail })
  }, [])

  const { config, productId, setProductId, exchanges, clearExchanges, webhookLive, proxyCall } =
    useKidTraffic(onChallengeWebhook)
  const testMode = config?.testMode ?? false
  const defaultProduct = config?.defaultProduct ?? ''

  // Age-collection methods depend on jurisdiction (and product). Fetch the
  // jurisdiction's requirements whenever the user lands on / edits the input step,
  // so we know whether to offer date-of-birth, an age slider, or both.
  React.useEffect(() => {
    if (step !== 'input' || !productId) return
    let cancelled = false
    ;(async () => {
      const res = await proxyCall<AgeGateRequirements>(
        `/api/kid/requirements?jurisdiction=${encodeURIComponent(jurisdiction)}`,
        { method: 'GET' },
        'age-gate/get-requirements',
      )
      if (cancelled) return
      const m = res?.data?.approvedAgeCollectionMethods ?? []
      setMethods(m)
      setAgeMode(m.includes('date-of-birth') ? 'dob' : m.includes('age-slider') ? 'slider' : 'dob')
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, jurisdiction, productId])

  // Once the challenge passes (webhook, poll, or simulate), fetch the session and finish.
  React.useEffect(() => {
    if (challengeStatus?.status !== 'PASS') return
    const sessionId = challengeStatus.sessionId ?? ageGate?.session?.sessionId
    if (!sessionId) { setStep('done'); return }
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
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challengeStatus?.status])

  function resetFlowState() {
    setAgeGate(null); setChallenge(null); setChallengeStatus(null)
    setSession(null); setEmailSentTo(null); setError(null)
  }

  function applyPreset(p: Preset) {
    setJurisdiction(p.jurisdiction)
    setDob(p.dob)
    setAgeMode('dob')
    setProductId(p.productId ?? defaultProduct)
  }

  // available age-collection inputs
  const hasDob = methods.length === 0 || methods.includes('date-of-birth')
  const hasSlider = methods.includes('age-slider')
  const showToggle = hasDob && hasSlider
  const effMode: AgeMode = showToggle ? ageMode : hasSlider && !hasDob ? 'slider' : 'dob'
  const ageInputValid = effMode === 'slider' ? sliderAge > 0 : DOB_RE.test(dob)
  const canSubmit = agree.tos && agree.privacy && ageInputValid && !loading

  async function runAgeGate() {
    setLoading(true); setError(null); resetFlowState()
    const body: Record<string, unknown> =
      effMode === 'slider' ? { jurisdiction, age: sliderAge } : { jurisdiction, dateOfBirth: dob }
    try {
      const res = await proxyCall<AgeGateCheckResponse>(
        '/api/kid/age-gate-check',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
        'age-gate/check',
      )
      if (!res?.ok || !res.data) { setError(res?.error || '연령 확인에 실패했어요. 다시 시도해 주세요.'); return }
      const data = res.data
      setAgeGate(data)
      if (data.status === 'CHALLENGE' && data.challenge) {
        setChallenge(data.challenge)
        setStep(data.challenge.type === 'CHALLENGE_AGE_GATE_AGE_ASSURANCE' ? 'ageassurance' : 'guardian')
      } else if (data.status === 'PROHIBITED') {
        setStep('blocked')
      } else if (data.status === 'PASS') {
        if (data.session) setSession(data.session)
        setStep('done')
      } else {
        setError('연령 확인 응답이 올바르지 않습니다.')
      }
    } finally {
      setLoading(false)
    }
  }

  async function sendConsentEmail() {
    if (!challenge?.challengeId) return
    setLoading(true); setError(null)
    try {
      const res = await proxyCall<SendEmailResponse>(
        '/api/kid/send-email',
        { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ challengeId: challenge.challengeId, email: guardianEmail, locale: 'ko-KR' }) },
        'challenge/send-email',
      )
      if (res?.ok) setEmailSentTo(guardianEmail)
      else setError(res?.error || '동의 요청을 보내지 못했어요.')
    } finally { setLoading(false) }
  }

  async function pollStatus() {
    if (!challenge?.challengeId) return
    setLoading(true); setError(null)
    try {
      const res = await proxyCall<ChallengeStatusResponse>(
        `/api/kid/challenge-status?challengeId=${encodeURIComponent(challenge.challengeId)}`,
        { method: 'GET' },
        'challenge/get-status',
      )
      if (res?.ok && res.data) setChallengeStatus(res.data)
      else setError(res?.error || '상태를 확인하지 못했어요.')
    } finally { setLoading(false) }
  }

  // TEST 모드: 실제 부모/사용자 없이 챌린지를 통과 처리.
  async function simulateApproval() {
    if (!challenge?.challengeId) return
    setLoading(true); setError(null)
    const isAA = challenge.type === 'CHALLENGE_AGE_GATE_AGE_ASSURANCE'
    const age = isAA ? (effMode === 'slider' ? sliderAge : ageFromDob(dob) || 20) : ageFromDob(dob)
    try {
      const res = await proxyCall(
        '/api/kid/test-set-challenge-status',
        { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ challengeId: challenge.challengeId, status: 'PASS', age, jurisdiction,
            approverEmail: guardianEmail || 'parent@example.com' }) },
        'test/set-challenge-status',
      )
      if (res?.ok) await pollStatus()
      else setError(res?.error || '시뮬레이션에 실패했어요.')
    } finally { setLoading(false) }
  }

  function goBack() {
    if (step === 'input') setStep('method')
    else if (step === 'guardian' || step === 'ageassurance' || step === 'blocked') {
      resetFlowState(); setStep('input')
    }
  }
  function restart() { resetFlowState(); setStep('method') }

  return (
    <div className={s.shell}>
      <div className={s.main}>
        <header className={s.header}>
          <a className={s.back} href="/" title="k-ID 콘솔로 돌아가기">
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L9.06 10l3.71 3.71a.75.75 0 11-1.04 1.08l-4.25-4.25a.75.75 0 010-1.08l4.25-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
            </svg>
            콘솔
          </a>
          <span className={s.logo}>nc</span>
        </header>

        <div className={s.content}>
          {/* ── 방법 선택 ── */}
          {step === 'method' && (
            <div className={s.col}>
              <h1 className={s.h1}>회원가입</h1>
              <p className={s.sub}>회원가입 수단을 선택해 주세요.</p>
              <button className={s.method} onClick={() => setStep('input')}>
                <span className={s.mIcon} style={{ color: '#0a2a52' }}>nc</span> 이메일로 회원가입
              </button>
            </div>
          )}

          {/* ── 정보 입력 (국가 + 생년월일/나이 + 약관) ── */}
          {step === 'input' && (
            <div className={s.col}>
              <button className={s.stepBack} onClick={goBack}>‹ 이전</button>
              <h1 className={s.h1}>회원가입</h1>
              <p className={s.sub}>서비스 이용을 위해 다음 정보를 입력해 주세요.</p>

              <div className={s.presets}>
                <span className={s.presetLabel}>데모 프리셋</span>
                {PRESETS.map((p) => (
                  <button key={p.label} className={s.preset} onClick={() => applyPreset(p)}>{p.label}</button>
                ))}
              </div>

              <div className={s.lab}>현재 위치 및 생년월일</div>
              <select className={s.field} value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)}>
                {COUNTRIES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
              </select>

              <div style={{ height: 10 }} />

              {showToggle && (
                <div className={s.collToggle}>
                  <button className={`${s.collTab} ${effMode === 'dob' ? s.collTabOn : ''}`} onClick={() => setAgeMode('dob')}>생년월일</button>
                  <button className={`${s.collTab} ${effMode === 'slider' ? s.collTabOn : ''}`} onClick={() => setAgeMode('slider')}>나이 입력</button>
                </div>
              )}

              {effMode === 'dob' ? (
                <input
                  className={s.field}
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  placeholder="생년월일 (YYYY-MM-DD)"
                  inputMode="numeric"
                />
              ) : (
                <div className={s.sliderWrap}>
                  <div className={s.sliderTop}>
                    <span className={s.sliderVal}>{sliderAge}<span className={s.sliderUnit}> 세</span></span>
                    <span className={s.sliderUnit}>나이 슬라이더</span>
                  </div>
                  <input className={s.slider} type="range" min={0} max={100} value={sliderAge}
                    onChange={(e) => setSliderAge(Number(e.target.value))} />
                </div>
              )}
              {showToggle && (
                <p className={s.mDesc} style={{ marginTop: 8 }}>
                  이 지역은 생년월일과 나이 입력을 모두 지원해요. 원하는 방식을 선택하세요.
                </p>
              )}

              <div className={s.consentList}>
                <div className={s.consentRow}>
                  <span className={`${s.ck} ${s.ckc} ${agree.tos ? s.ckOn : ''}`} onClick={() => setAgree((a) => ({ ...a, tos: !a.tos }))}>{agree.tos ? '✓' : ''}</span>
                  <span className={s.req}>(필수)</span> 게임서비스 이용약관 동의
                  <a className={s.detailLink} style={{ marginLeft: 'auto' }}>자세히 보기 ›</a>
                </div>
                <div className={s.consentRow}>
                  <span className={`${s.ck} ${s.ckc} ${agree.privacy ? s.ckOn : ''}`} onClick={() => setAgree((a) => ({ ...a, privacy: !a.privacy }))}>{agree.privacy ? '✓' : ''}</span>
                  <span className={s.req}>(필수)</span> 개인정보 수집 및 이용 동의
                  <a className={s.detailLink} style={{ marginLeft: 'auto' }}>자세히 보기 ›</a>
                  <span className={s.minorBadge}>아동 청소년용 안내</span>
                </div>
              </div>

              {error && <div className={s.errbox}>{error}</div>}
              <button className={s.btn} disabled={!canSubmit} onClick={runAgeGate}>
                {loading ? '확인 중…' : '다음'}
              </button>

              <button className={s.infoToggle} onClick={() => setShowWhy((v) => !v)}>
                <span className={s.ic}>i</span> 이 정보가 필요한 이유가 궁금하세요?
                <span className={s.chev}>{showWhy ? '⌃' : '⌄'}</span>
              </button>
              {showWhy && (
                <div className={s.infoBody}>
                  거주 국가의 법령에 따라 디지털 서비스 이용에 필요한 최소 연령과 보호자 동의 여부가
                  달라집니다. 입력하신 위치와 생년월일은 연령 확인 목적에만 사용됩니다.
                </div>
              )}
            </div>
          )}

          {/* ── 보호자 동의 (VPC) ── */}
          {step === 'guardian' && (
            <div className={s.col}>
              <button className={s.stepBack} onClick={goBack}>‹ 이전</button>
              <h1 className={s.h1}>보호자 동의</h1>
              <p className={s.sub}>
                {jurisdiction} 기준 디지털 동의 연령 미만이라, 보호자가 계정 생성을 승인해야 해요.
                편한 방법을 선택해 주세요.
              </p>
              <div className={s.callout}>
                <span className={s.calloutI}>i</span>
                <div>보호자가 승인할 때까지 계정은 보류 상태로 유지돼요. 동의 전에는 어떤 개인정보도 공유되지 않습니다.</div>
              </div>

              <div className={s.methodGrid}>
                <div className={s.mCard}>
                  <div className={s.mHead}><span className={s.mTag}>QR</span> 휴대폰으로 스캔</div>
                  <p className={s.mDesc}>보호자가 휴대폰 카메라로 스캔하면 승인 페이지가 열려요.</p>
                  <div className={s.qrRow}>
                    <div className={s.qrBox}>
                      {qrDataUrl ? <img src={qrDataUrl} alt="동의 QR 코드" />
                        : <div style={{ fontSize: 11, color: '#b6bbc4', display: 'grid', placeItems: 'center', height: '100%' }}>생성 중…</div>}
                    </div>
                    <p className={s.mDesc} style={{ margin: 0 }}>QR을 열면 보호자가 본인 확인 후 동의하는 안전한 k-ID 동의 페이지로 이동해요.</p>
                  </div>
                </div>

                <div className={s.mCard}>
                  <div className={s.mHead}><span className={s.mTag}>LINK</span> 승인 링크 공유</div>
                  <p className={s.mDesc}>메신저로 보호자에게 이 링크를 보내세요.</p>
                  <div className={s.linkRow}>
                    <input className={s.linkInput} readOnly value={challenge?.url ?? ''} />
                    {challenge?.url && <CopyMini text={challenge.url} />}
                    {challenge?.url && (
                      <a className={s.miniBtn} href={challenge.url} target="_blank" rel="noreferrer" style={{ display: 'grid', placeItems: 'center', textDecoration: 'none' }}>열기 ↗</a>
                    )}
                  </div>
                </div>

                {challenge?.oneTimePassword && (
                  <div className={s.mCard}>
                    <div className={s.mHead}><span className={s.mTag}>OTP</span> 일회용 코드</div>
                    <p className={s.mDesc}>보호자가 k-ID 동의 페이지에 입력할 수 있어요.</p>
                    <div className={s.otpBig}>
                      <span className={s.code}>{challenge.oneTimePassword}</span>
                      <CopyMini text={challenge.oneTimePassword} />
                      {fmtExpiry(challenge.otpExpiresAt) && <span className={s.exp}>{fmtExpiry(challenge.otpExpiresAt)}</span>}
                    </div>
                  </div>
                )}

                <div className={s.mCard}>
                  <div className={s.mHead}><span className={s.mTag}>EMAIL</span> 이메일로 요청</div>
                  <p className={s.mDesc}>보호자 이메일로 승인 링크를 보내드려요.</p>
                  <div className={s.emailRow}>
                    <input className={s.field} type="email" value={guardianEmail} onChange={(e) => setGuardianEmail(e.target.value)} placeholder="parent@example.com" />
                    <button className={s.miniBtn} disabled={loading || !guardianEmail} onClick={sendConsentEmail}>{loading ? '전송 중…' : '보내기'}</button>
                  </div>
                  {emailSentTo && <div className={s.sent}>✓ {emailSentTo} 으로 전송됨</div>}
                </div>
              </div>

              <div className={s.divider} />
              <div className={s.statusBar}><span className={s.spin} /> 보호자 승인 대기 중…</div>
              {error && <div className={s.errbox}>{error}</div>}
              <button className={s.btn} disabled={loading} onClick={pollStatus}>{loading ? '확인 중…' : '보호자가 승인했어요 — 확인'}</button>
              {testMode && <button className={s.btnAlt} disabled={loading} onClick={simulateApproval}>⚡ 보호자 승인 시뮬레이션 (TEST)</button>}
              <div className={s.kidNote}><span className={s.dot} /> 보호자 동의는 k-ID로 검증됩니다</div>
            </div>
          )}

          {/* ── 연령 확인 (Age Assurance) ── */}
          {step === 'ageassurance' && (
            <div className={s.col}>
              <button className={s.stepBack} onClick={goBack}>‹ 이전</button>
              <h1 className={s.h1}>연령 확인</h1>
              <p className={s.sub}>이 지역은 가입 전 간단한 연령 확인이 필요해요. 아래에서 안전하게 완료해 주세요.</p>
              {challenge?.url ? (
                <iframe src={challenge.url} title="연령 확인" style={{ width: '100%', height: 540, border: '1px solid #c6cfd8' }} />
              ) : (
                <div className={s.callout}><span className={s.calloutI}>i</span><div>안전한 확인 페이지를 준비 중이에요…</div></div>
              )}
              {challenge?.url && (
                <a href={challenge.url} target="_blank" rel="noreferrer" className={s.btnAlt} style={{ display: 'grid', placeItems: 'center', textDecoration: 'none' }}>새 창에서 열기 ↗</a>
              )}
              {error && <div className={s.errbox}>{error}</div>}
              <button className={s.btn} disabled={loading} onClick={pollStatus}>{loading ? '확인 중…' : '확인을 완료했어요 — 확인'}</button>
              {testMode && <button className={s.btnAlt} disabled={loading} onClick={simulateApproval}>⚡ 연령 확인 시뮬레이션 (TEST)</button>}
              <div className={s.kidNote}><span className={s.dot} /> 연령 확인은 k-ID로 처리됩니다</div>
            </div>
          )}

          {/* ── 완료 ── */}
          {step === 'done' && (
            <div className={s.col}>
              <div className={`${s.bigIcon} ${s.bigPass}`}>✓</div>
              <h1 className={s.h1}>plaync에 오신 것을 환영합니다</h1>
              <p className={s.sub}>계정이 준비되었어요. 연령 확인이 완료되었습니다.</p>
              {session && (
                <>
                  <div className={s.lab}>내 계정 권한</div>
                  <div className={s.permList}>
                    {session.permissions.slice(0, 8).map((p) => (
                      <div key={p.name} className={s.permRow}>
                        {p.name}
                        <span className={`${s.permState} ${p.enabled ? s.permOn : s.permOff}`}>{p.enabled ? 'ON' : 'OFF'}</span>
                      </div>
                    ))}
                    {session.permissions.length === 0 && (
                      <div className={s.permRow} style={{ color: '#9aa0aa' }}>반환된 관리 권한이 없습니다.</div>
                    )}
                  </div>
                </>
              )}
              <button className={s.btnAlt} onClick={restart} style={{ marginTop: 24 }}>처음으로</button>
            </div>
          )}

          {/* ── 차단 ── */}
          {step === 'blocked' && (
            <div className={s.col}>
              <button className={s.stepBack} onClick={goBack}>‹ 이전</button>
              <div className={`${s.bigIcon} ${s.bigBlock}`}>✕</div>
              <h1 className={s.h1}>가입할 수 없습니다</h1>
              <p className={s.sub}>입력하신 생년월일 기준 {jurisdiction} 지역의 최소 가입 연령에 미치지 못해요.</p>
              <button className={s.btnAlt} onClick={restart} style={{ marginTop: 8 }}>처음으로</button>
            </div>
          )}
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
                <span className="rounded-full border border-pending/40 bg-pending/10 px-2 py-0.5 font-mono text-[10px] text-pending">TEST MODE</span>
              )}
              {productId && (
                <span className="rounded-full border border-ink-700 bg-ink-900/60 px-2 py-0.5 font-mono text-[10px] text-ink-400">product {productId}</span>
              )}
              <button type="button" onClick={() => setInspectorOpen(false)} className="ml-auto cursor-pointer rounded-full border border-ink-700 px-2 py-0.5 font-mono text-[11px] text-ink-300 hover:border-action/50 hover:text-action">Hide ›</button>
            </div>
            <div className="min-h-0 flex-1">
              <InspectorPanel exchanges={exchanges} onClear={clearExchanges} />
            </div>
          </div>
        ) : (
          <button type="button" className={s.reopen} onClick={() => setInspectorOpen(true)}>‹ HTTP Inspector ({exchanges.length})</button>
        )}
      </div>

      <div className={s.dmPill}>🌙 OFF</div>
    </div>
  )
}

function CopyMini({ text, label = '복사' }: { text: string; label?: string }) {
  const [copied, setCopied] = React.useState(false)
  return (
    <button type="button" className={s.miniBtn} onClick={async () => {
      try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1200) } catch { /* clipboard unavailable */ }
    }}>{copied ? '복사됨 ✓' : label}</button>
  )
}

function fmtExpiry(iso?: string): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `만료 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function Footer() {
  return (
    <div className={s.foot}>
      <select defaultValue="ko"><option value="ko">한국어</option></select>
      <div className={s.footLinks}>
        <a>회사소개</a><a>이용약관</a><a><b>개인정보처리방침</b></a>
        <a><b>청소년 보호정책</b></a><a>운영정책</a><a>정보주체의 권리보장</a><a>고객지원</a>
      </div>
      <div className={s.footCorp}>
        (주)엔씨소프트 · 대표 김택진, 박병무 · 사업자등록번호 220-81-43000 · © NC Corporation. All Rights Reserved.
      </div>
    </div>
  )
}
