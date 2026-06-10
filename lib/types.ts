// Shared types used by BOTH server route handlers and client components.
// Keep this file free of any server-only imports (no node:crypto, no env reads).

/** Which leg of the round-trip an exchange represents. */
export type Hop =
  | 'browser->proxy' // request the browser sent to our Next.js proxy route
  | 'proxy->kid' // request our server made to the real k-ID API
  | 'webhook' // inbound webhook the k-ID platform pushed to us

export interface HttpMessageRequest {
  method: string
  url: string
  headers: Record<string, string>
  body?: unknown
}

export interface HttpMessageResponse {
  status: number
  statusText: string
  ok: boolean
  headers: Record<string, string>
  body?: unknown
}

/** One fully-captured request/response pair, the atom of the inspector. */
export interface HttpExchange {
  id: string
  hop: Hop
  /** Short human label, e.g. "Browser → Proxy" or "Proxy → k-ID". */
  label: string
  /** What this exchange is about, e.g. "age-gate/check". */
  title: string
  request: HttpMessageRequest
  response: HttpMessageResponse | null
  error?: string
  /** ISO timestamp when the request started. */
  startedAt: string
  durationMs: number
}

/** Envelope every /api/kid/* route returns to the browser. */
export interface ProxyResult<T = unknown> {
  ok: boolean
  status: number
  data: T | null
  error?: string
  /** Server-side exchanges (proxy -> k-ID). The client prepends its own hop. */
  exchanges: HttpExchange[]
}

// ── k-ID domain types (subset we use) ───────────────────────────────────────

export type AgeGateStatus = 'PASS' | 'PROHIBITED' | 'CHALLENGE'
export type ChallengeStatus = 'PASS' | 'FAIL' | 'PENDING' | 'IN_PROGRESS'
export type AgeStatus = 'DIGITAL_MINOR' | 'DIGITAL_YOUTH' | 'LEGAL_ADULT'

export interface KidPermission {
  name: string
  enabled: boolean
  managedBy: 'PLAYER' | 'GUARDIAN' | 'PROHIBITED'
  verifiedAgeThreshold?: number
}

export interface KidSession {
  sessionId: string
  kuid?: string
  etag: string
  status: 'ACTIVE' | 'HOLD'
  permissions: KidPermission[]
  allowances: { name: string; type: 'numerical' | 'selection' }[]
  ageStatus: AgeStatus
  ageCategory: 'digital-minor' | 'digital-youth' | 'adult'
  dateOfBirth: string
  jurisdiction: string
  managedBy: 'PLAYER' | 'GUARDIAN'
  hasApproverEmail?: boolean
}

export interface KidChallenge {
  challengeId: string
  type:
    | 'CHALLENGE_PARENTAL_CONSENT'
    | 'CHALLENGE_AGE_GATE_AGE_ASSURANCE'
    | 'CHALLENGE_SESSION_UPGRADE'
    | 'CHALLENGE_SESSION_UPGRADE_BY_AGE_ASSURANCE'
    | 'CHALLENGE_BULK_APPROVAL_REQUEST'
    | 'CHALLENGE_UPDATE_JURISDICTION'
  url?: string
  oneTimePassword?: string
  childLiteAccessEnabled: boolean
  kuid?: string
  jurisdiction?: string
  age?: number
  dateOfBirth?: string
  otpExpiresAt?: string
}

export interface AgeGateCheckResponse {
  status: AgeGateStatus
  session?: KidSession
  challenge?: KidChallenge
}

export interface ChallengeStatusResponse {
  status: ChallengeStatus
  sessionId?: string
  approverEmail?: string
}

/**
 * POST /session/upgrade — request extra permissions on a live session.
 * PLAYER-managed permissions enable instantly (session only); GUARDIAN-managed
 * ones return a CHALLENGE_SESSION_UPGRADE challenge; verified-age permissions
 * return CHALLENGE_SESSION_UPGRADE_BY_AGE_ASSURANCE (AgeKit+ instead of consent).
 */
export interface SessionUpgradeResponse {
  session?: KidSession
  challenge?: KidChallenge
}

// ── AgeKit+ Access Age Verification ──────────────────────────────────────────

export interface AccessAgeVerificationResponse {
  id: string
  url: string
  shortUrl: string
}

export type VerificationMethod =
  | 'age-estimation'
  | 'id-document'
  | 'credit-card'
  | 'personal-details'
  | 'kws'
  | 'age-attestation'
  | 'email-estimation'

export interface VerificationStatusResponse {
  id: string
  status: ChallengeStatus // PASS | FAIL | PENDING | IN_PROGRESS
  age?: { low?: number; high?: number }
  ageCategory?: 'digital-minor' | 'digital-youth' | 'adult'
  method?: VerificationMethod
  failureReason?: string
}

export interface AgeGateRequirements {
  shouldDisplay: boolean
  ageAssuranceRequired: boolean
  digitalConsentAge: number
  civilAge: number
  minimumAge: number
  approvedAgeCollectionMethods: string[]
  permissions?: KidPermission[]
}

// /challenge/send-email returns an empty 200 body on success.
export type SendEmailResponse = Record<string, never>

export interface KidProductInfo {
  id: string
  label: string
  /** Whether an API key is configured for this product on the server. */
  hasKey: boolean
}

export interface KidConfig {
  apiUrl: string
  testMode: boolean
  hasApiKey: boolean
  webhookConfigured: boolean
  appUrl: string
  apiVersion: string
  /** Selectable products; the browser picks one per request (X-Kid-Product). */
  products: KidProductInfo[]
  /** Product id the UI should start on. */
  defaultProduct: string
}
