import { NextRequest, NextResponse } from 'next/server'
import { kidCall } from '@/lib/kid'
import type { AccessAgeVerificationResponse, ProxyResult } from '@/lib/types'

export const dynamic = 'force-dynamic'

// AgeKit+ entrypoint: POST /api/v1/age-verification/perform-access-age-verification
// Creates an age-verification request and returns { id, url, shortUrl }. The url
// hosts the AgeKit+ waterfall (facial age estimation, ID, etc.); shortUrl is QR-friendly.
export async function POST(req: NextRequest) {
  const input = await req.json().catch(() => ({}))

  const body: Record<string, unknown> = {}
  if (input.jurisdiction) body.jurisdiction = String(input.jurisdiction)

  // criteria is required: either an age threshold or an age category.
  const criteria: Record<string, unknown> = {}
  if (input.criteriaMode === 'ageCategory') {
    if (input.criteriaCategory) criteria.ageCategory = String(input.criteriaCategory)
  } else if (input.criteriaAge !== undefined && input.criteriaAge !== '' && input.criteriaAge !== null) {
    criteria.age = Number(input.criteriaAge)
  }
  if (Object.keys(criteria).length > 0) body.criteria = criteria

  // optional subject hints
  const subject: Record<string, unknown> = {}
  if (input.email) subject.email = String(input.email)
  if (input.claimedDateOfBirth) subject.claimedDateOfBirth = String(input.claimedDateOfBirth)
  if (input.claimedAge !== undefined && input.claimedAge !== '' && input.claimedAge !== null) {
    subject.claimedAge = Number(input.claimedAge)
  }
  if (Object.keys(subject).length > 0) body.subject = subject

  // optional options
  const options: Record<string, unknown> = {}
  const fae: Record<string, unknown> = {}
  if (input.passIfOver) fae.passIfOver = Number(input.passIfOver)
  if (input.failIfUnder) fae.failIfUnder = Number(input.failIfUnder)
  if (Object.keys(fae).length > 0) options.facialAgeEstimation = fae
  if (input.redirectUrl) options.redirectUrl = String(input.redirectUrl)
  if (input.locale) options.locale = String(input.locale)
  if (Object.keys(options).length > 0) body.options = options

  const { ok, status, data, error, exchange } = await kidCall<AccessAgeVerificationResponse>({
    method: 'POST',
    path: '/age-verification/perform-access-age-verification',
    title: 'age-verification/perform-access-age-verification',
    productId: req.headers.get('x-kid-product'),
    body,
  })

  const result: ProxyResult<AccessAgeVerificationResponse> = {
    ok,
    status,
    data,
    error,
    exchanges: [exchange],
  }
  return NextResponse.json(result)
}
