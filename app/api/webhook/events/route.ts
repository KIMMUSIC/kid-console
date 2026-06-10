import { NextRequest, NextResponse } from 'next/server'
import { eventsSince, storeBackend } from '@/lib/webhookStore'

export const dynamic = 'force-dynamic'

// Polling endpoint for the inspector's webhook feed. The client passes the
// cursor from the previous response (`since=-1` on its first call) and dedupes
// by exchange id. Polling replaces SSE because on Vercel the webhook POST and
// a long-lived stream would run in separate instances with no shared memory.
export async function GET(req: NextRequest) {
  const sinceParam = req.nextUrl.searchParams.get('since')
  const since = sinceParam === null || sinceParam === '' ? -1 : Number(sinceParam)
  if (!Number.isFinite(since)) {
    return NextResponse.json({ ok: false, error: 'Invalid since cursor' }, { status: 400 })
  }

  try {
    const { events, now } = await eventsSince(since)
    return NextResponse.json(
      { ok: true, backend: storeBackend(), events, now },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Event store unavailable' },
      { status: 502 },
    )
  }
}
