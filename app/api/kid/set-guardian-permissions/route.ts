import { NextRequest, NextResponse } from 'next/server'
import { kidCall } from '@/lib/kid'
import type { ProxyResult } from '@/lib/types'

export const dynamic = 'force-dynamic'

// POST /api/v1/session/set-guardian-managed-permissions
// Sets the FULL set of enabled guardian-managed permissions on a session.
// The console uses it in TEST mode to emulate the parent ticking a permission
// on the consent page (a simulated challenge PASS alone doesn't enable any).
export async function POST(req: NextRequest) {
  const input = await req.json().catch(() => ({}))

  const body: Record<string, unknown> = {}
  if (input.sessionId) body.sessionId = String(input.sessionId)
  if (Array.isArray(input.enabledPermissions)) {
    body.enabledPermissions = input.enabledPermissions.map(String)
  }

  const { ok, status, data, error, exchange } = await kidCall<{
    sessionId: string
    enabledPermissions: string[]
  }>({
    method: 'POST',
    path: '/session/set-guardian-managed-permissions',
    title: 'session/set-guardian-managed-permissions',
    productId: req.headers.get('x-kid-product'),
    body,
  })

  const result: ProxyResult<{ sessionId: string; enabledPermissions: string[] }> = {
    ok,
    status,
    data,
    error,
    exchanges: [exchange],
  }
  return NextResponse.json(result)
}
