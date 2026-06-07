// SERVER-ONLY module. Holds the k-ID API keys and performs the server-to-server
// calls. Every call is wrapped so we capture a fully-detailed HttpExchange that
// the browser can render in the inspector — with the Authorization header
// redacted so the secret never reaches the client.
//
// Multiple products are supported: each product has its own API key. The browser
// selects which product to use per request (X-Kid-Product header); the server
// maps that id to the matching key here. Keys never leave the server.

import 'server-only'
import { randomUUID } from 'node:crypto'
import type { HttpExchange } from './types'

const RAW_API_URL = process.env.K_ID_API_URL || 'https://game-api.test.k-id.com'
export const API_VERSION = 'v1'

/** Normalised base, e.g. https://game-api.test.k-id.com (no trailing slash). */
export const API_HOST = RAW_API_URL.replace(/\/+$/, '')
export const isTestMode = /(?:^|\.)test\.k-id\.com/.test(API_HOST)

// ── Product registry ─────────────────────────────────────────────────────────
// Each product carries its own k-ID API key, read from a dedicated env var.
export interface KidProduct {
  id: string
  label: string
  apiKey: string
}

const PRODUCT_DEFS: { id: string; label: string; envKey: string }[] = [
  { id: '18419', label: 'Product 18419', envKey: 'K_ID_PRODUCT_18419_KEY' },
  { id: '18887', label: 'Product 18887', envKey: 'K_ID_PRODUCT_18887_KEY' },
]

const PRODUCTS: KidProduct[] = PRODUCT_DEFS.map((p) => ({
  id: p.id,
  label: p.label,
  apiKey: (process.env[p.envKey] || '').trim(),
}))

// Legacy single-key fallback. Used when a selected product has no dedicated key.
const FALLBACK_KEY = (process.env.K_ID_API_KEY || '').trim()

/** Product the UI starts on (configurable; first keyed product otherwise). */
export const DEFAULT_PRODUCT_ID =
  (process.env.K_ID_DEFAULT_PRODUCT || '').trim() ||
  PRODUCTS.find((p) => p.apiKey)?.id ||
  PRODUCTS[0]?.id ||
  ''

/** True when at least one product (or the fallback) has a key configured. */
export const hasAnyApiKey = PRODUCTS.some((p) => p.apiKey) || FALLBACK_KEY.length > 0

/** Resolve the API key + product for a requested product id. */
function resolveProduct(productId?: string | null): { product: KidProduct | null; apiKey: string } {
  const id = (productId || '').trim() || DEFAULT_PRODUCT_ID
  const product = PRODUCTS.find((p) => p.id === id) ?? null
  return { product, apiKey: product?.apiKey || FALLBACK_KEY }
}

/** Non-secret view of the configured products, safe to send to the browser. */
export function listProducts(): { id: string; label: string; hasKey: boolean }[] {
  return PRODUCTS.map((p) => ({
    id: p.id,
    label: p.label,
    hasKey: Boolean(p.apiKey || FALLBACK_KEY),
  }))
}

function redactHeaders(headers: Record<string, string>, apiKey: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === 'authorization') {
      // Show the scheme + that a key is present, but never the key itself.
      const hint = apiKey ? `${apiKey.slice(0, 3)}…(${apiKey.length} chars)` : 'EMPTY'
      out[k] = `Bearer ••••••••••••  [redacted · ${hint}]`
    } else {
      out[k] = v
    }
  }
  return out
}

function safeJson(text: string): unknown {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export interface KidCallOptions {
  method: 'GET' | 'POST'
  /** Path after /api/v1, e.g. "/age-gate/check". */
  path: string
  /** Human title for the inspector, e.g. "age-gate/check". */
  title: string
  body?: unknown
  query?: Record<string, string | number | undefined | null>
  /** Which product (and therefore which API key) to use. Defaults to DEFAULT_PRODUCT_ID. */
  productId?: string | null
}

export interface KidCallResult<T = unknown> {
  ok: boolean
  status: number
  data: T | null
  error?: string
  exchange: HttpExchange
}

/**
 * Perform one authenticated call to the real k-ID API and capture it.
 */
export async function kidCall<T = unknown>(opts: KidCallOptions): Promise<KidCallResult<T>> {
  const { product, apiKey } = resolveProduct(opts.productId)
  const hasKey = apiKey.length > 0
  const productLabel = product ? ` (${product.id})` : ''

  const url = new URL(`${API_HOST}/api/${API_VERSION}${opts.path}`)
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v))
    }
  }

  const requestHeaders: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Bearer ${apiKey}`,
  }
  if (opts.method === 'POST') requestHeaders['Content-Type'] = 'application/json'

  const startedAtMs = Date.now()
  const startedAt = new Date(startedAtMs).toISOString()

  const exchange: HttpExchange = {
    id: randomUUID(),
    hop: 'proxy->kid',
    label: `Proxy → k-ID${productLabel}`,
    title: opts.title,
    request: {
      method: opts.method,
      url: url.toString(),
      headers: redactHeaders(requestHeaders, apiKey),
      body: opts.body ?? null,
    },
    response: null,
    startedAt,
    durationMs: 0,
  }

  // Guard: a missing key would produce a confusing network 401. Surface it clearly
  // while STILL showing the exact request that would have been sent.
  if (!hasKey) {
    exchange.durationMs = Date.now() - startedAtMs
    exchange.error = product
      ? `No API key configured for product ${product.id}. Set its key in .env.local and restart the server.`
      : 'No k-ID API key is set on the server. Copy .env.local.example to .env.local and add your keys.'
    return { ok: false, status: 0, data: null, error: exchange.error, exchange }
  }

  try {
    const res = await fetch(url.toString(), {
      method: opts.method,
      headers: requestHeaders,
      body: opts.method === 'POST' ? JSON.stringify(opts.body ?? {}) : undefined,
      cache: 'no-store',
    })
    const text = await res.text()
    const data = safeJson(text)
    exchange.durationMs = Date.now() - startedAtMs
    exchange.response = {
      status: res.status,
      statusText: res.statusText,
      ok: res.ok,
      headers: Object.fromEntries(res.headers.entries()),
      body: data,
    }
    return {
      ok: res.ok,
      status: res.status,
      data: (data as T) ?? null,
      error: res.ok ? undefined : `k-ID returned ${res.status} ${res.statusText}`,
      exchange,
    }
  } catch (err) {
    exchange.durationMs = Date.now() - startedAtMs
    exchange.error = err instanceof Error ? err.message : 'Network error calling k-ID'
    return { ok: false, status: 0, data: null, error: exchange.error, exchange }
  }
}
