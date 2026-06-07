import { NextRequest, NextResponse } from 'next/server'
import { kidCall, isTestMode } from '@/lib/kid'
import type { ProxyResult } from '@/lib/types'

export const dynamic = 'force-dynamic'

// TEST MODE ONLY: POST /api/v1/test/set-challenge-status
// Simulates parental approval (or denial) so the full VPC pipeline can be
// experienced without a real trusted adult completing the consent flow.
export async function POST(req: NextRequest) {
  if (!isTestMode) {
    return NextResponse.json(
      { ok: false, status: 0, data: null, error: 'Test endpoints are only available in TEST mode.', exchanges: [] },
      { status: 400 },
    )
  }

  const input = await req.json().catch(() => ({}))
  const body: Record<string, unknown> = {}
  if (input.challengeId) body.challengeId = String(input.challengeId)
  body.status = input.status === 'FAIL' ? 'FAIL' : 'PASS'
  if (input.age !== undefined && input.age !== '' && input.age !== null) body.age = Number(input.age)
  if (input.jurisdiction) body.jurisdiction = String(input.jurisdiction)
  if (input.approverEmail) body.approverEmail = String(input.approverEmail)

  const { ok, status, data, error, exchange } = await kidCall({
    method: 'POST',
    path: '/test/set-challenge-status',
    title: 'test/set-challenge-status',
    productId: req.headers.get('x-kid-product'),
    body,
  })

  const result: ProxyResult = { ok, status, data, error, exchanges: [exchange] }
  return NextResponse.json(result)
}
