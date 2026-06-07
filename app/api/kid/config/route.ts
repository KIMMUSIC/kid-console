import { NextResponse } from 'next/server'
import { API_HOST, API_VERSION, DEFAULT_PRODUCT_ID, hasAnyApiKey, isTestMode, listProducts } from '@/lib/kid'
import type { KidConfig } from '@/lib/types'

export const dynamic = 'force-dynamic'

// Exposes NON-SECRET runtime config so the UI can show what mode it's in and
// which products are selectable. Never returns any API key or webhook secret.
export function GET() {
  const config: KidConfig = {
    apiUrl: API_HOST,
    testMode: isTestMode,
    hasApiKey: hasAnyApiKey,
    webhookConfigured: Boolean(process.env.WEBHOOK_SECRET),
    appUrl: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    apiVersion: API_VERSION,
    products: listProducts(),
    defaultProduct: DEFAULT_PRODUCT_ID,
  }
  return NextResponse.json(config)
}
