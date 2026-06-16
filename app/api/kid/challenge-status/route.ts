import { NextRequest, NextResponse } from 'next/server'
import { kidCall } from '@/lib/kid'
import type { ChallengeStatusResponse, ProxyResult } from '@/lib/types'

export const dynamic = 'force-dynamic'

// Authoritative consent result: GET /api/v1/challenge/get-status?challengeId=...
// PENDING / IN_PROGRESS until a trusted adult approves, then PASS or FAIL.
export async function GET(req: NextRequest) {
  const query = Object.fromEntries(req.nextUrl.searchParams.entries())

  const { ok, status, data, error, exchange } = await kidCall<ChallengeStatusResponse>({
    method: 'GET',
    path: '/challenge/get-status',
    title: 'challenge/get-status',
    productId: req.headers.get('x-kid-product'),
    query,
  })

  const result: ProxyResult<ChallengeStatusResponse> = { ok, status, data, error, exchanges: [exchange] }
  return NextResponse.json(result)
}
