import { NextRequest, NextResponse } from 'next/server'
import { kidCall } from '@/lib/kid'
import type { ProxyResult, SendEmailResponse } from '@/lib/types'

export const dynamic = 'force-dynamic'

// Step 3 (VPC trigger, no widget) — POST /api/v1/challenge/send-email
// Emails the parental-consent challenge (link + OTP) to a trusted adult.
// This is how VPC is initiated via the API instead of the hosted widget.
export async function POST(req: NextRequest) {
  const input = await req.json().catch(() => ({}))
  const body: Record<string, unknown> =
    input && typeof input === 'object' && !Array.isArray(input) ? input : {}

  const { ok, status, data, error, exchange } = await kidCall<SendEmailResponse>({
    method: 'POST',
    path: '/challenge/send-email',
    title: 'challenge/send-email',
    productId: req.headers.get('x-kid-product'),
    body,
  })

  const result: ProxyResult<SendEmailResponse> = { ok, status, data, error, exchanges: [exchange] }
  return NextResponse.json(result)
}
