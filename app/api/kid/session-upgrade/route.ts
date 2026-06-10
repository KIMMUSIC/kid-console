import { NextRequest, NextResponse } from 'next/server'
import { kidCall } from '@/lib/kid'
import type { ProxyResult, SessionUpgradeResponse } from '@/lib/types'

export const dynamic = 'force-dynamic'

// Session upgrade: POST /api/v1/session/upgrade
// Requests extra permissions on a live session. PLAYER-managed permissions
// enable instantly; GUARDIAN-managed ones come back as a
// CHALLENGE_SESSION_UPGRADE challenge a trusted adult must resolve.
export async function POST(req: NextRequest) {
  const input = await req.json().catch(() => ({}))

  const body: Record<string, unknown> = {}
  if (input.sessionId) body.sessionId = String(input.sessionId)
  if (input.kuid) body.kuid = String(input.kuid)
  if (Array.isArray(input.requestedPermissions)) {
    body.requestedPermissions = input.requestedPermissions
      .map((p: unknown) =>
        typeof p === 'string'
          ? { name: p }
          : p && typeof p === 'object' && 'name' in p
            ? { name: String((p as { name: unknown }).name) }
            : null,
      )
      .filter(Boolean)
  }

  const { ok, status, data, error, exchange } = await kidCall<SessionUpgradeResponse>({
    method: 'POST',
    path: '/session/upgrade',
    title: 'session/upgrade',
    productId: req.headers.get('x-kid-product'),
    body,
  })

  const result: ProxyResult<SessionUpgradeResponse> = { ok, status, data, error, exchanges: [exchange] }
  return NextResponse.json(result)
}
