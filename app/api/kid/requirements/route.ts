import { NextRequest, NextResponse } from 'next/server'
import { kidCall } from '@/lib/kid'
import type { AgeGateRequirements, ProxyResult } from '@/lib/types'

export const dynamic = 'force-dynamic'

// Step 1 — jurisdiction rules: GET /api/v1/age-gate/get-requirements?jurisdiction=...
// Tells you the digital-consent age, civil (adult) age, minimum age, and which
// age-collection methods are approved before you ever check a player.
export async function GET(req: NextRequest) {
  const query = Object.fromEntries(req.nextUrl.searchParams.entries())

  const { ok, status, data, error, exchange } = await kidCall<AgeGateRequirements>({
    method: 'GET',
    path: '/age-gate/get-requirements',
    title: 'age-gate/get-requirements',
    productId: req.headers.get('x-kid-product'),
    query,
  })

  const result: ProxyResult<AgeGateRequirements> = { ok, status, data, error, exchanges: [exchange] }
  return NextResponse.json(result)
}
