// SERVER-ONLY webhook event store.
//
// On Vercel the webhook POST and the inspector's event fetch run in different
// serverless invocations, so events must live in shared storage. When Upstash
// Redis credentials are present (UPSTASH_REDIS_REST_URL / KV_REST_API_URL) we
// keep a capped Redis list; otherwise we fall back to process memory, which is
// fine for `npm run dev` / `npm start` where everything is one process.

import type { HttpExchange } from './types'

const KEY = 'kid:webhook:events'
const MAX_EVENTS = 200

export type StoredWebhookEvent = HttpExchange & {
  /** Server receipt time (ms epoch) — the polling cursor. */
  receivedAt: number
}

function redisCreds(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN
  return url && token ? { url: url.replace(/\/$/, ''), token } : null
}

export function storeBackend(): 'redis' | 'memory' {
  return redisCreds() ? 'redis' : 'memory'
}

/** Run commands against the Upstash REST pipeline endpoint (no SDK needed). */
async function redisPipeline(commands: (string | number)[][]): Promise<{ result: unknown }[]> {
  const creds = redisCreds()
  if (!creds) throw new Error('Redis is not configured')
  const res = await fetch(`${creds.url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${creds.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Redis pipeline failed: ${res.status} ${await res.text()}`)
  return (await res.json()) as { result: unknown }[]
}

// In-memory fallback, newest first. Stashed on globalThis to survive dev hot-reloads.
const globalForStore = globalThis as unknown as { __kidWebhookEvents?: StoredWebhookEvent[] }
const memoryEvents: StoredWebhookEvent[] = globalForStore.__kidWebhookEvents ?? []
globalForStore.__kidWebhookEvents = memoryEvents

/** Record an inbound webhook so every inspector (any instance) can pick it up. */
export async function appendEvent(exchange: HttpExchange): Promise<void> {
  const event: StoredWebhookEvent = { ...exchange, receivedAt: Date.now() }
  if (redisCreds()) {
    await redisPipeline([
      ['LPUSH', KEY, JSON.stringify(event)],
      ['LTRIM', KEY, 0, MAX_EVENTS - 1],
    ])
  } else {
    memoryEvents.unshift(event)
    if (memoryEvents.length > MAX_EVENTS) memoryEvents.length = MAX_EVENTS
  }
}

/**
 * Events received at/after `since` (ms epoch), newest first, plus the server
 * time to use as the next cursor. `since < 0` means "cursor only, no backlog"
 * — the client's first poll, so old events don't flood a fresh inspector.
 * Clients overlap cursors and dedupe by exchange id, so `>=` double-delivery
 * at the boundary is harmless while missed events are not.
 */
export async function eventsSince(
  since: number,
): Promise<{ events: StoredWebhookEvent[]; now: number }> {
  const now = Date.now()
  if (since < 0) return { events: [], now }

  let all: StoredWebhookEvent[]
  if (redisCreds()) {
    const [{ result }] = await redisPipeline([['LRANGE', KEY, 0, MAX_EVENTS - 1]])
    all = ((result as string[]) ?? []).flatMap((raw) => {
      try {
        return [JSON.parse(raw) as StoredWebhookEvent]
      } catch {
        return []
      }
    })
  } else {
    all = memoryEvents
  }
  return { events: all.filter((e) => e.receivedAt >= since), now }
}
