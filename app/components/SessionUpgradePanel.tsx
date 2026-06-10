'use client'

import React from 'react'
import QRCode from 'qrcode'
import type {
  ChallengeStatusResponse,
  KidPermission,
  KidSession,
  SessionUpgradeResponse,
} from '@/lib/types'
import { ActionButton, Badge, CopyButton, MethodBadge, ageGateStatusColor } from './ui'

// ── state owned by Console, rendered here ────────────────────────────────────

export interface UpgradeState {
  /** Permission currently being requested (game action that was locked). */
  permission: string | null
  /** Session snapshot taken when the request started — the "before" of the diff. */
  before: KidSession | null
  response: SessionUpgradeResponse | null
  emailSentTo: string | null
  challengeStatus: ChallengeStatusResponse | null
  challengeStatusSource?: 'api' | 'webhook'
  /** Refreshed session after the upgrade resolved — the "after" of the diff. */
  upgraded: KidSession | null
  error?: string
  consentSimulated: boolean
}

export const EMPTY_UPGRADE: UpgradeState = {
  permission: null,
  before: null,
  response: null,
  emailSentTo: null,
  challengeStatus: null,
  upgraded: null,
  consentSimulated: false,
}

export interface UpgradeHandlers {
  onRequest: (permission: string) => void
  onSendEmail: () => void
  onPoll: () => void
  onSimulateConsent: () => void
}

// ── permission name → game action presentation ──────────────────────────────

function actionMeta(name: string): { icon: string; label: string } {
  const n = name.toLowerCase()
  if (n.includes('voice')) return { icon: '🎤', label: 'Voice Chat' }
  if (n.includes('chat') || n.includes('text')) return { icon: '💬', label: 'Text Chat' }
  if (n.includes('purchase') || n.includes('iap') || n.includes('pay') || n.includes('spend') || n.includes('moneti'))
    return { icon: '💰', label: 'Purchase' }
  if (n.includes('profile')) return { icon: '👤', label: 'Public Profile' }
  if (n.includes('online') || n.includes('presence') || n.includes('status'))
    return { icon: '🟢', label: 'Online Status' }
  if (n.includes('ugc') || n.includes('content') || n.includes('share'))
    return { icon: '🎨', label: 'Share Content' }
  if (n.includes('ad')) return { icon: '📢', label: 'Personalized Ads' }
  if (n.includes('push') || n.includes('notif')) return { icon: '🔔', label: 'Notifications' }
  if (n.includes('friend') || n.includes('social')) return { icon: '🤝', label: 'Friends' }
  return { icon: '🎮', label: name }
}

function actionSuccessLine(name: string): string {
  const n = name.toLowerCase()
  if (n.includes('voice')) return 'Voice chat connected — mic is live.'
  if (n.includes('chat') || n.includes('text')) return 'Message sent to the lobby.'
  if (n.includes('purchase') || n.includes('iap') || n.includes('pay') || n.includes('spend'))
    return 'Purchase completed — 100 gems added.'
  return 'Action performed.'
}

// ── panel ────────────────────────────────────────────────────────────────────

export default function SessionUpgradePanel({
  session,
  upgrade,
  handlers,
  parentEmail,
  testMode,
  loadingStep,
  onHoverStep,
}: {
  /** The latest session (post-upgrade when one resolved). */
  session: KidSession | null
  upgrade: UpgradeState
  handlers: UpgradeHandlers
  parentEmail: string
  testMode: boolean
  loadingStep: string | null
  onHoverStep?: (key: string | null) => void
}) {
  // Local, purely cosmetic: feedback when an ALLOWED game action is clicked.
  const [actionFeedback, setActionFeedback] = React.useState<string | null>(null)

  if (!session) {
    return (
      <div className="rounded-xl border border-dashed border-ink-700/70 bg-ink-950/20 p-4">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-ink-500">
            🔒 In-game · Session Upgrade
          </span>
        </div>
        <p className="mt-1 text-[12.5px] text-ink-500">
          Needs a session — finish step 5 first. Then the player can hit a locked game action
          (chat, purchase…) and request more permissions via <code className="font-mono">POST /session/upgrade</code>.
        </p>
      </div>
    )
  }

  const challenge = upgrade.response?.challenge ?? null
  const instantSession = upgrade.response && !upgrade.response.challenge ? upgrade.response.session : null
  const resolved = upgrade.upgraded ?? instantSession ?? null
  const isAgeAssurance = challenge?.type === 'CHALLENGE_SESSION_UPGRADE_BY_AGE_ASSURANCE'
  const passed = upgrade.challengeStatus?.status === 'PASS' || Boolean(instantSession)
  const failed = upgrade.challengeStatus?.status === 'FAIL'
  const requestedThreshold = (upgrade.before ?? session)?.permissions.find(
    (p) => p.name === upgrade.permission,
  )?.verifiedAgeThreshold

  return (
    <div className="space-y-3">
      {/* ① mock game HUD — the entry point of the whole stage */}
      <div
        onMouseEnter={() => onHoverStep?.('session/upgrade')}
        onMouseLeave={() => onHoverStep?.(null)}
        className="rounded-xl border border-ink-700/70 bg-ink-950/40 p-4"
      >
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[13.5px] font-semibold tracking-apple text-ink-50">Game Actions</h3>
          <span className="font-mono text-[11px] text-ink-500">
            built from session.permissions — click a locked action to request an upgrade
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {session.permissions.map((p) => (
            <GameActionButton
              key={p.name}
              permission={p}
              requesting={upgrade.permission === p.name && !resolved && !failed}
              onClick={() => {
                if (p.enabled) {
                  setActionFeedback(`${actionMeta(p.name).icon} ${actionSuccessLine(p.name)}`)
                } else if (p.managedBy !== 'PROHIBITED') {
                  setActionFeedback(null)
                  handlers.onRequest(p.name)
                }
              }}
            />
          ))}
          {session.permissions.length === 0 && (
            <p className="font-mono text-[11.5px] text-ink-500">
              This session has no permissions configured — add game permissions in the Compliance
              Studio product settings.
            </p>
          )}
        </div>

        {actionFeedback && (
          <p className="mt-3 animate-fade-up rounded-lg border border-pass/40 bg-pass/5 px-3 py-2 font-mono text-[12px] text-pass">
            {actionFeedback} <span className="text-ink-500">(simulated in-game action)</span>
          </p>
        )}
      </div>

      {/* ② upgrade request + approval */}
      {upgrade.permission && (
        <div
          onMouseEnter={() => onHoverStep?.('session/upgrade')}
          onMouseLeave={() => onHoverStep?.(null)}
          className={`rounded-xl border p-4 transition-all duration-300 ease-apple ${
            failed
              ? 'border-prohibited/40 bg-prohibited/[0.04]'
              : passed
                ? 'border-pass/30 bg-pass/[0.04]'
                : 'border-challenge/40 bg-challenge/[0.04]'
          }`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[13.5px] font-semibold tracking-apple text-ink-50">
              Upgrade request — {actionMeta(upgrade.permission).icon}{' '}
              {actionMeta(upgrade.permission).label}
            </h3>
            <MethodBadge method="POST" />
            <span className="font-mono text-[11px] text-ink-500">session/upgrade</span>
          </div>
          <p className="mt-1 font-mono text-[11.5px] text-ink-500">
            requestedPermissions: [{'{'}&quot;name&quot;: &quot;{upgrade.permission}&quot;{'}'}]
          </p>

          {upgrade.error && (
            <div className="mt-3 animate-fade-up rounded-lg border border-prohibited/40 bg-prohibited/10 px-3 py-2 font-mono text-[12px] text-prohibited">
              {upgrade.error}
            </div>
          )}

          {/* instant PASS — PLAYER-managed */}
          {instantSession && (
            <div className="mt-3 flex items-center gap-2 animate-fade-up">
              <span className={`font-mono text-base font-bold ${ageGateStatusColor('PASS')}`}>PASS</span>
              <Badge className="border-pass/50 bg-pass/10 text-pass">enabled instantly</Badge>
              <span className="text-[12px] text-ink-400">
                PLAYER-managed permission — no guardian needed.
              </span>
            </div>
          )}

          {/* challenge path — guardian approval or age assurance */}
          {challenge && !passed && !failed && (
            <div className="mt-3 space-y-3 animate-fade-up">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="border-challenge/50 bg-challenge/10 text-challenge">
                  {isAgeAssurance
                    ? `Age Assurance required${requestedThreshold ? ` · ${requestedThreshold}+` : ''}`
                    : 'Guardian approval required'}
                </Badge>
                <span className="font-mono text-[11px] text-ink-500">{challenge.type}</span>
                <span className="font-mono text-[11px] text-ink-500">
                  childLiteAccessEnabled: {String(challenge.childLiteAccessEnabled)}
                </span>
              </div>

              <ChallengeTarget
                url={challenge.url}
                otp={challenge.oneTimePassword}
                otpExpiresAt={challenge.otpExpiresAt}
                allowIframe={isAgeAssurance}
              />

              {isAgeAssurance ? (
                <p className="font-mono text-[11px] text-ink-500">
                  The player verifies their OWN age via AgeKit+ (facial estimation, ID…) — no
                  parental consent involved. On a verified age
                  {requestedThreshold ? ` of ${requestedThreshold}+` : ''}, k-ID enables the
                  permission and the challenge resolves.
                </p>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <ActionButton
                    onClick={handlers.onSendEmail}
                    running={loadingStep === 'upgrade-email'}
                    disabled={!parentEmail}
                    title={!parentEmail ? 'Set the parent email in step 3' : undefined}
                  >
                    {upgrade.emailSentTo ? 'Resend email' : 'Email the guardian'}
                  </ActionButton>
                  {upgrade.emailSentTo && (
                    <span className="font-mono text-[11.5px] text-pass">sent to {upgrade.emailSentTo}</span>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <ActionButton onClick={handlers.onPoll} running={loadingStep === 'upgrade-poll'}>
                  Poll status
                </ActionButton>
                {testMode && (
                  <ActionButton
                    variant="amber"
                    onClick={handlers.onSimulateConsent}
                    running={loadingStep === 'upgrade-sim'}
                  >
                    {upgrade.consentSimulated
                      ? 'Simulated ✓'
                      : isAgeAssurance
                        ? 'Simulate verification'
                        : 'Simulate approval'}
                  </ActionButton>
                )}
                <span className="font-mono text-[11px] text-ink-500">
                  …or wait — the ⚡ Challenge.StateChange webhook resolves this automatically.
                </span>
              </div>

              {upgrade.challengeStatus && (
                <p className={`font-mono text-sm font-bold ${ageGateStatusColor(upgrade.challengeStatus.status)}`}>
                  {upgrade.challengeStatus.status}
                </p>
              )}
            </div>
          )}

          {/* resolved status line for the challenge path */}
          {challenge && (passed || failed) && (
            <div className="mt-3 flex flex-wrap items-center gap-2 animate-fade-up">
              <span
                className={`font-mono text-base font-bold ${ageGateStatusColor(upgrade.challengeStatus?.status ?? 'PASS')}`}
              >
                {upgrade.challengeStatus?.status}
              </span>
              {upgrade.challengeStatusSource === 'webhook' && (
                <Badge className="border-action/50 bg-action/10 text-action">
                  ⚡ via Challenge.StateChange webhook
                </Badge>
              )}
              {upgrade.challengeStatus?.approverEmail && (
                <span className="font-mono text-[11.5px] text-ink-400">
                  approved by {upgrade.challengeStatus.approverEmail}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* ③ result — permission diff after the refreshed session arrives */}
      {upgrade.permission && resolved && (
        <div
          onMouseEnter={() => onHoverStep?.('session/get')}
          onMouseLeave={() => onHoverStep?.(null)}
          className="rounded-xl border border-pass/30 bg-pass/[0.03] p-4 animate-fade-up"
        >
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[13.5px] font-semibold tracking-apple text-ink-50">
              Permissions after upgrade
            </h3>
            <MethodBadge method="GET" />
            <span className="font-mono text-[11px] text-ink-500">session/get</span>
            <span className="font-mono text-[11px] text-ink-500">etag {resolved.etag.slice(0, 12)}…</span>
          </div>
          <PermissionDiff before={upgrade.before} after={resolved} highlight={upgrade.permission} />
          <p className="mt-2 font-mono text-[11.5px] text-ink-500">
            ↑ the game action above is now unlocked — click it.
          </p>
        </div>
      )}
    </div>
  )
}

// ── game action button ───────────────────────────────────────────────────────

function GameActionButton({
  permission: p,
  requesting,
  onClick,
}: {
  permission: KidPermission
  requesting: boolean
  onClick: () => void
}) {
  const meta = actionMeta(p.name)
  const prohibited = p.managedBy === 'PROHIBITED'
  const needsAge = !p.enabled && p.verifiedAgeThreshold !== undefined
  const needsGuardian = !p.enabled && !needsAge && p.managedBy === 'GUARDIAN'

  const tone = p.enabled
    ? 'border-pass/50 bg-pass/5 text-ink-50 hover:border-pass hover:shadow-glow'
    : prohibited
      ? 'cursor-not-allowed border-ink-800 bg-ink-950/40 text-ink-600'
      : 'border-challenge/40 bg-challenge/5 text-ink-200 hover:border-challenge'

  const hint = p.enabled
    ? 'allowed'
    : prohibited
      ? 'prohibited at this age'
      : needsAge
        ? `needs verified age ${p.verifiedAgeThreshold}+`
        : needsGuardian
          ? 'needs guardian approval'
          : 'tap to enable'

  return (
    <button
      type="button"
      disabled={prohibited}
      onClick={onClick}
      title={p.name}
      className={`group flex min-w-[120px] cursor-pointer flex-col items-start gap-0.5 rounded-xl border px-3.5 py-2.5 text-left transition-all duration-200 ease-apple active:scale-95 ${tone}`}
    >
      <span className="flex items-center gap-1.5 text-[13px] font-semibold tracking-apple">
        <span className="text-base leading-none">{requesting ? '⏳' : p.enabled ? meta.icon : prohibited ? '🚫' : '🔒'}</span>
        {meta.label}
      </span>
      <span className="font-mono text-[10px] text-ink-500">{p.name}</span>
      <span
        className={`font-mono text-[10px] ${
          p.enabled ? 'text-pass' : prohibited ? 'text-ink-600' : 'text-challenge'
        }`}
      >
        {requesting ? 'requesting…' : hint}
      </span>
    </button>
  )
}

// ── consent / verification target (link + OTP + QR) ─────────────────────────

function ChallengeTarget({
  url,
  otp,
  otpExpiresAt,
  allowIframe,
}: {
  url?: string
  otp?: string
  otpExpiresAt?: string
  /** Age-assurance challenges host an AgeKit+ flow the player can run inline. */
  allowIframe?: boolean
}) {
  const [view, setView] = React.useState<'qr' | 'iframe'>('qr')
  const [qr, setQr] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!url) return
    let alive = true
    QRCode.toDataURL(url, { margin: 1, width: 132, color: { dark: '#0F172A', light: '#F8FAFC' } })
      .then((d) => alive && setQr(d))
      .catch(() => alive && setQr(null))
    return () => {
      alive = false
    }
  }, [url])

  if (!url && !otp) return null

  return (
    <div className="space-y-3 rounded-lg border border-ink-700/60 bg-ink-950/40 p-3">
      {allowIframe && url && (
        <div className="flex gap-1 border-b border-ink-700/70">
          <TargetTab active={view === 'qr'} onClick={() => setView('qr')}>
            QR / link
          </TargetTab>
          <TargetTab active={view === 'iframe'} onClick={() => setView('iframe')}>
            iframe
          </TargetTab>
        </div>
      )}

      {allowIframe && url && view === 'iframe' ? (
        <div className="animate-fade-up space-y-1">
          <div className="overflow-hidden rounded-lg border border-ink-700/70 bg-white shadow-product">
            <iframe
              title="k-ID AgeKit+ age verification"
              src={url}
              className="h-[480px] w-full"
              allow="camera; microphone; payment; publickey-credentials-get *; publickey-credentials-create *"
            />
          </div>
          <p className="font-mono text-[11px] text-ink-500">
            The player verifies in place — then poll status (or let the ⚡webhook resolve it).
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-4">
          {qr && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="QR code for the challenge link" className="h-[132px] w-[132px] rounded-md" />
          )}
          <div className="min-w-0 space-y-2">
            {url && (
              <div className="flex items-center gap-2">
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="cursor-pointer font-mono text-[12px] text-action underline-offset-2 transition-colors hover:underline"
                >
                  open challenge link ↗
                </a>
                <CopyButton getText={() => url} />
              </div>
            )}
            {otp && (
              <div>
                <p className="mb-0.5 font-mono text-[11px] text-ink-500">One-time password</p>
                <p className="font-mono text-lg font-bold tracking-[0.3em] text-challenge">{otp}</p>
                {otpExpiresAt && (
                  <p className="mt-0.5 font-mono text-[10.5px] text-ink-500">expires {otpExpiresAt}</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function TargetTab({
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
      className={`-mb-px cursor-pointer rounded-t-md border-b-2 px-3 py-1.5 font-mono text-[11.5px] transition-colors ${
        active
          ? 'border-action text-action'
          : 'border-transparent text-ink-500 hover:text-ink-200'
      }`}
    >
      {children}
    </button>
  )
}

// ── before → after permission diff ──────────────────────────────────────────

function PermissionDiff({
  before,
  after,
  highlight,
}: {
  before: KidSession | null
  after: KidSession
  highlight: string
}) {
  const beforeMap = new Map((before?.permissions ?? []).map((p) => [p.name, p]))
  return (
    <div className="mt-3 overflow-hidden rounded-lg ring-1 ring-inset ring-ink-700/60">
      <table className="w-full border-collapse font-mono text-[11.5px]">
        <thead>
          <tr className="border-b border-ink-700/60 text-ink-500">
            <th className="px-2 py-1 text-left font-medium">permission</th>
            <th className="px-2 py-1 text-left font-medium">before</th>
            <th className="px-2 py-1 text-left font-medium">after</th>
          </tr>
        </thead>
        <tbody>
          {after.permissions.map((p) => {
            const prev = beforeMap.get(p.name)
            const changed = (prev?.enabled ?? false) !== p.enabled
            return (
              <tr
                key={p.name}
                className={`border-b border-ink-800 last:border-0 ${
                  changed ? 'bg-pass/10' : ''
                } ${p.name === highlight ? 'font-bold' : ''}`}
              >
                <td className="px-2 py-1 text-ink-200">{p.name}</td>
                <td className={`px-2 py-1 ${prev?.enabled ? 'text-pass' : 'text-ink-500'}`}>
                  {prev ? (prev.enabled ? 'enabled' : 'off') : '—'}
                </td>
                <td className={`px-2 py-1 ${p.enabled ? 'text-pass' : 'text-ink-500'}`}>
                  {p.enabled ? 'enabled' : 'off'}
                  {changed && ' ✨'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
