import { NextRequest, NextResponse } from 'next/server'
import { kidCall, isTestMode } from '@/lib/kid'
import type { ProxyResult } from '@/lib/types'

export const dynamic = 'force-dynamic'

// TEST MODE ONLY: POST /api/v1/test/set-age-verification-status
// Simulates the result of an AgeKit+ verification without completing the web flow.
export async function POST(req: NextRequest) {
  if (!isTestMode) {
    return NextResponse.json(
      { ok: false, status: 0, data: null, error: 'Test endpoints are only available in TEST mode.', exchanges: [] },
      { status: 400 },
    )
  }

  const input = await req.json().catch(() => ({}))
  const body: Record<string, unknown> = {}
  if (input.verificationId) body.verificationId = String(input.verificationId)
  body.status = input.status === 'FAIL' ? 'FAIL' : 'PASS'

  const low = input.ageLow
  const high = input.ageHigh
  if (low !== undefined || high !== undefined) {
    body.age = {
      ...(low !== undefined && low !== '' ? { low: Number(low) } : {}),
      ...(high !== undefined && high !== '' ? { high: Number(high) } : {}),
    }
  }
  if (input.ageCategory) body.ageCategory = String(input.ageCategory)
  if (input.method) body.method = String(input.method)
  if (input.failureReason) body.failureReason = String(input.failureReason)

  const { ok, status, data, error, exchange } = await kidCall({
    method: 'POST',
    path: '/test/set-age-verification-status',
    title: 'test/set-age-verification-status',
    productId: req.headers.get('x-kid-product'),
    body,
  })

  const result: ProxyResult = { ok, status, data, error, exchanges: [exchange] }
  return NextResponse.json(result)
}
