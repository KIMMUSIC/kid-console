import { NextRequest, NextResponse } from 'next/server'
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { broadcastWebhook } from './connections'
import type { HttpExchange } from '@/lib/types'

export const dynamic = 'force-dynamic'

type SignatureStatus = 'valid' | 'invalid' | 'missing' | 'not_configured'

/**
 * k-ID webhook signature: HMAC-SHA256 over (timestamp + rawBody), keyed by the
 * webhook secret, hex-encoded lowercase. Headers:
 *   x-signature-hmac-sha256, x-signature-timestamp
 * @see https://docs.k-id.com/events/webhooks/overview#signature-validation
 */
function validateSignature(
  rawBody: string,
  signature: string | null,
  timestamp: string | null,
  secret: string | undefined,
): SignatureStatus {
  if (!secret) return 'not_configured'
  if (!signature || !timestamp) return 'missing'
  try {
    const computed = createHmac('sha256', secret)
      .update(timestamp + rawBody)
      .digest('hex')
      .toLowerCase()
    const provided = signature.trim().toLowerCase()
    if (computed.length !== provided.length) return 'invalid'
    const isValid = timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(provided, 'hex'))
    return isValid ? 'valid' : 'invalid'
  } catch {
    return 'invalid'
  }
}

async function handle(req: NextRequest, method: string) {
  const startedAtMs = Date.now()
  const rawBody = await req.text()
  let parsed: unknown = null
  try {
    parsed = rawBody ? JSON.parse(rawBody) : null
  } catch {
    parsed = rawBody || null
  }

  const headers: Record<string, string> = {}
  req.headers.forEach((value, key) => {
    headers[key] = value
  })

  const secret = process.env.WEBHOOK_SECRET
  const signature = req.headers.get('x-signature-hmac-sha256')
  const timestamp = req.headers.get('x-signature-timestamp')
  const signatureStatus = validateSignature(rawBody, signature, timestamp, secret)

  const eventType =
    (parsed && typeof parsed === 'object' && 'eventType' in parsed
      ? String((parsed as Record<string, unknown>).eventType)
      : undefined) || 'webhook'

  const rejected = Boolean(secret) && (signatureStatus === 'invalid' || signatureStatus === 'missing')

  // Capture the inbound webhook as an HttpExchange so it appears in the inspector
  // alongside outbound traffic.
  const exchange: HttpExchange = {
    id: randomUUID(),
    hop: 'webhook',
    label: 'k-ID → Webhook',
    title: eventType,
    request: {
      method,
      url: req.nextUrl.pathname,
      headers,
      body: parsed,
    },
    response: {
      status: rejected ? 401 : 200,
      statusText: rejected ? 'Unauthorized' : 'OK',
      ok: !rejected,
      headers: { 'x-signature-status': signatureStatus },
      body: rejected
        ? { success: false, error: 'Webhook signature rejected', signatureStatus }
        : { success: true, signatureStatus },
    },
    startedAt: new Date(startedAtMs).toISOString(),
    durationMs: Date.now() - startedAtMs,
  }

  broadcastWebhook(exchange)

  if (rejected) {
    return NextResponse.json(
      { success: false, error: 'Invalid or missing webhook signature', signatureStatus },
      { status: 401 },
    )
  }
  return NextResponse.json({ success: true, signatureStatus })
}

export async function POST(req: NextRequest) {
  return handle(req, 'POST')
}
export async function GET(req: NextRequest) {
  return handle(req, 'GET')
}
export async function PUT(req: NextRequest) {
  return handle(req, 'PUT')
}
export async function PATCH(req: NextRequest) {
  return handle(req, 'PATCH')
}
export async function DELETE(req: NextRequest) {
  return handle(req, 'DELETE')
}
