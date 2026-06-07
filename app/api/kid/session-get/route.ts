import { NextRequest, NextResponse } from 'next/server'
import { kidCall } from '@/lib/kid'
import type { KidSession, ProxyResult } from '@/lib/types'

export const dynamic = 'force-dynamic'

// Inspect the resulting session: GET /api/v1/session/get?sessionId=...
// Shows the permissions/allowances the player ends up with.
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('sessionId') || ''
  const kuid = req.nextUrl.searchParams.get('kuid') || ''

  const { ok, status, data, error, exchange } = await kidCall<KidSession>({
    method: 'GET',
    path: '/session/get',
    title: 'session/get',
    productId: req.headers.get('x-kid-product'),
    query: { sessionId, kuid },
  })

  const result: ProxyResult<KidSession> = { ok, status, data, error, exchanges: [exchange] }
  return NextResponse.json(result)
}
