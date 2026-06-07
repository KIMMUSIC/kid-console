import { NextRequest, NextResponse } from 'next/server'
import { kidCall } from '@/lib/kid'
import type { ProxyResult, VerificationStatusResponse } from '@/lib/types'

export const dynamic = 'force-dynamic'

// AgeKit+ result: GET /api/v1/age-verification/get-status?id=...
// PASS / FAIL / PENDING / IN_PROGRESS, plus the verified age range and method used.
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id') || ''

  const { ok, status, data, error, exchange } = await kidCall<VerificationStatusResponse>({
    method: 'GET',
    path: '/age-verification/get-status',
    title: 'age-verification/get-status',
    productId: req.headers.get('x-kid-product'),
    query: { id },
  })

  const result: ProxyResult<VerificationStatusResponse> = { ok, status, data, error, exchanges: [exchange] }
  return NextResponse.json(result)
}
