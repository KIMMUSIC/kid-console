'use client'

// Client hook that owns the HTTP-traffic side of a k-ID flow: it calls the
// /api/kid/* proxy routes, captures every hop as an HttpExchange (the
// browser->proxy leg plus the proxy->k-ID legs the server returns), and polls
// the shared webhook store so inbound k-ID webhooks appear live in the inspector.
//
// This is the same capture contract the main Console uses, factored out so the
// plaync signup experience can reuse it without duplicating the wiring.

import React from 'react'
import type {
  ChallengeStatusResponse,
  HttpExchange,
  KidConfig,
  ProxyResult,
} from '@/lib/types'

function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `id-${Date.now()}-${Math.floor(Math.random() * 1e9)}`
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return s
  }
}

export interface ChallengeWebhook {
  challengeId: string
  status: ChallengeStatusResponse['status']
  sessionId?: string
  approverEmail?: string
}

export function useKidTraffic(onChallengeWebhook?: (ev: ChallengeWebhook) => void) {
  const [config, setConfig] = React.useState<KidConfig | null>(null)
  const [productId, setProductId] = React.useState<string>('')
  const [exchanges, setExchanges] = React.useState<HttpExchange[]>([])
  const [webhookLive, setWebhookLive] = React.useState(false)

  // Keep the callback in a ref so the polling effect never re-binds on re-render.
  const cbRef = React.useRef(onChallengeWebhook)
  React.useEffect(() => {
    cbRef.current = onChallengeWebhook
  }, [onChallengeWebhook])

  React.useEffect(() => {
    fetch('/api/kid/config')
      .then((r) => r.json())
      .then((c: KidConfig) => {
        setConfig(c)
        setProductId((prev) => prev || c.defaultProduct || c.products?.[0]?.id || '')
      })
      .catch(() => setConfig(null))
  }, [])

  const pushHops = React.useCallback((hops: HttpExchange[]) => {
    if (hops.length > 0) setExchanges((prev) => [...hops, ...prev])
  }, [])

  // Keep productId readable inside proxyCall without re-creating it each render.
  const productIdRef = React.useRef(productId)
  React.useEffect(() => {
    productIdRef.current = productId
  }, [productId])

  const proxyCall = React.useCallback(
    async function proxyCall<T>(
      path: string,
      init: RequestInit,
      title: string,
    ): Promise<ProxyResult<T> | null> {
      const pid = productIdRef.current
      const startedMs = Date.now()
      const startedAt = new Date(startedMs).toISOString()
      const initWithProduct: RequestInit = {
        ...init,
        headers: { ...(init.headers as Record<string, string> | undefined), 'X-Kid-Product': pid },
      }
      const baseReq = {
        method: (init.method || 'GET').toUpperCase(),
        url: path,
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          'x-kid-product': pid,
        },
        body: init.body ? safeParse(init.body as string) : null,
      }
      try {
        const res = await fetch(path, initWithProduct)
        const json = (await res.json()) as ProxyResult<T>
        pushHops([
          {
            id: uid(),
            hop: 'browser->proxy',
            label: 'Browser → Proxy',
            title,
            request: baseReq,
            response: {
              status: res.status,
              statusText: res.statusText,
              ok: res.ok,
              headers: Object.fromEntries(res.headers.entries()),
              body: json,
            },
            startedAt,
            durationMs: Date.now() - startedMs,
          },
          ...(json.exchanges ?? []),
        ])
        return json
      } catch (err) {
        pushHops([
          {
            id: uid(),
            hop: 'browser->proxy',
            label: 'Browser → Proxy',
            title,
            request: baseReq,
            response: null,
            error: err instanceof Error ? err.message : 'Network error',
            startedAt,
            durationMs: Date.now() - startedMs,
          },
        ])
        return null
      }
    },
    [pushHops],
  )

  // Webhook feed: poll the shared event store (SSE doesn't survive Vercel's
  // serverless split). Dedupe by exchange id; surface Challenge.StateChange to
  // the caller so the flow can advance in place.
  React.useEffect(() => {
    let cursor = -1
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const processed = new Set<string>()

    async function poll() {
      if (stopped) return
      if (document.visibilityState === 'visible') {
        try {
          const res = await fetch(`/api/webhook/events?since=${cursor}`, { cache: 'no-store' })
          const json = (await res.json()) as { ok: boolean; events?: HttpExchange[]; now?: number }
          if (json.ok && typeof json.now === 'number') {
            setWebhookLive(true)
            cursor = json.now - 2000
            const fresh = (json.events ?? []).filter((e) => !processed.has(e.id))
            if (fresh.length > 0) {
              fresh.forEach((e) => processed.add(e.id))
              setExchanges((prev) => {
                const seen = new Set(prev.map((e) => e.id))
                const next = fresh.filter((e) => !seen.has(e.id))
                return next.length > 0 ? [...next, ...prev] : prev
              })
              for (let i = fresh.length - 1; i >= 0; i--) {
                const ev = fresh[i]
                if (ev.hop !== 'webhook' || ev.response?.ok === false) continue
                const body = ev.request.body as
                  | { eventType?: string; data?: { id?: string; status?: string; sessionId?: string; approverEmail?: string } }
                  | null
                if (body?.eventType === 'Challenge.StateChange' && body.data?.id && body.data.status) {
                  cbRef.current?.({
                    challengeId: body.data.id,
                    status: body.data.status as ChallengeStatusResponse['status'],
                    sessionId: body.data.sessionId,
                    approverEmail: body.data.approverEmail,
                  })
                }
              }
            }
          } else {
            setWebhookLive(false)
          }
        } catch {
          setWebhookLive(false)
        }
      }
      timer = setTimeout(poll, 3000)
    }

    poll()
    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
    }
  }, [])

  const clearExchanges = React.useCallback(() => setExchanges([]), [])

  return { config, productId, setProductId, exchanges, clearExchanges, webhookLive, proxyCall }
}
