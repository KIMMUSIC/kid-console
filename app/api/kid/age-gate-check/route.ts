import { NextRequest, NextResponse } from 'next/server'
import { kidCall } from '@/lib/kid'
import type { AgeGateCheckResponse, ProxyResult } from '@/lib/types'

export const dynamic = 'force-dynamic'

// Age Assurance core: POST /api/v1/age-gate/check
// Decides PASS / PROHIBITED / CHALLENGE from jurisdiction + age/DOB and
// (when consent is required) returns a parental-consent challenge.
export async function POST(req: NextRequest) {
  const input = await req.json().catch(() => ({}))
  const body: Record<string, unknown> =
    input && typeof input === 'object' && !Array.isArray(input) ? input : {}

  const { ok, status, data, error, exchange } = await kidCall<AgeGateCheckResponse>({
    method: 'POST',
    path: '/age-gate/check',
    title: 'age-gate/check',
    productId: req.headers.get('x-kid-product'),
    body,
  })

  const result: ProxyResult<AgeGateCheckResponse> = { ok, status, data, error, exchanges: [exchange] }
  return NextResponse.json(result)
}
