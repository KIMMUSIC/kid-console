# K-ID VPC Console

A developer console for the **k-ID** API. Run **Age Assurance** and **Verifiable
Parental Consent (VPC)** flows against the real k-ID API and watch **every HTTP
request and response** between the browser, the Next.js proxy, and k-ID — with a
built-in, Postman/DevTools-style traffic inspector.

Built with Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS.
UI design system via `ui-ux-pro-max` (dev-tool dark + run-green, JetBrains Mono / IBM Plex Sans).

---

## Why this exists

k-ID is a **server-to-server** API: the API key must never reach the browser.
That makes the actual HTTP traffic invisible during development. This console makes
it explicit — every hop is captured and rendered:

```
Browser  ──①──▶  Next.js proxy  ──②──▶  k-ID API
   ▲                   │                    │
   └────────④──────────┘◀────────③──────────┘
                ⑤  k-ID ──▶ Webhook (HMAC-verified, streamed via SSE)
```

The Authorization header is **redacted** before it is ever sent to the browser, so
the secret stays on the server while you still see the full request shape.

---

## Quick start

```bash
cd kid-web
npm install

# 1. configure your key
cp .env.local.example .env.local
#    then edit .env.local and set K_ID_API_KEY=...

# 2. run
npm run dev          # http://localhost:3000
```

Open <http://localhost:3000>. The status bar shows `TEST MODE` / `key ✓` when the
key is recognised.

### Environment variables (`.env.local`)

| Variable | Required | Notes |
|---|---|---|
| `K_ID_API_KEY` | ✅ | Server-only. From the k-ID Compliance Studio. Never sent to the browser. |
| `K_ID_API_URL` | ✅ | `https://game-api.test.k-id.com` (test) or `https://game-api.k-id.com` (live). **Must match the key's mode.** |
| `WEBHOOK_SECRET` | optional | Enables HMAC-SHA256 webhook signature verification. |
| `NEXT_PUBLIC_APP_URL` | optional | Public URL of this app (used for docs / webhook target). |

> Test keys only work with the test URL and vice-versa — a mismatch returns `401`.

---

## What you can do

The console has two selectable flows (tabs at the top of the center panel).

### Flow A — AgeKit+ Access Age Verification
A standalone age-verification product, separate from the CDK age gate.

1. `POST /age-verification/perform-access-age-verification` — body `{ jurisdiction, criteria:{age | ageCategory}, subject?, options? }` → `{ id, url, shortUrl }`.
2. The user completes the hosted AgeKit+ check (facial age estimation, ID, etc.). The console shows it **both** ways: a QR code + link from `shortUrl` (open on a phone, no embed) and an `iframe` of `url`. A verification UI is intrinsic to this step — there is no pure-API alternative.
3. `GET /age-verification/get-status?id=...` → `PASS`/`FAIL`/`PENDING`/`IN_PROGRESS`, with the verified age range and the method used.

### Flow B — CDK Age-gate + VPC

#### Age Assurance — `POST /age-gate/check`
Enter a jurisdiction + date of birth (or age). k-ID returns:

| Status | Meaning |
|---|---|
| `PASS` | Player may continue; a session is created/returned. |
| `CHALLENGE` | Parental consent required; a challenge (with OTP + consent URL) is created. |
| `PROHIBITED` | Below the minimum age; block the player. |

When a `CHALLENGE` comes back you can poll `GET /challenge/get-status` and, once
approved, inspect the resulting session with `GET /session/get`.

### VPC — pure API flow (no widget)
Verifiable Parental Consent is composed from server-to-server API calls, not a hosted
widget. The console drives it as a 5-step flow, each step a single captured request:

1. `GET /age-gate/get-requirements` — jurisdiction rules (consent age, civil age, minimum age, approved collection methods).
2. `POST /age-gate/check` — the decision; a `CHALLENGE` returns a parental-consent challenge (challengeId + OTP + link).
3. `POST /challenge/send-email` — **the VPC trigger**: emails the consent challenge to the parent/guardian.
4. `GET /challenge/get-status` — poll until the trusted adult approves (`PENDING`/`IN_PROGRESS` → `PASS`/`FAIL`).
5. `GET /session/get` — inspect the resulting permissions/allowances.

Each step unlocks when its prerequisite is met (e.g. step 3 needs a `CHALLENGE` from
step 2 plus a parent email). Inbound webhooks still appear live in the inspector.

---

## Architecture

```
app/
  page.tsx                       → renders <Console/>
  components/
    Console.tsx                  client orchestrator: flow tabs, state, SSE, proxy calls
    FlowPanel.tsx                left: inputs (jurisdiction, criteria, DOB, age, email, kuid)
    AgeVerificationFlow.tsx      center A: AgeKit+ verify (perform → QR/iframe → get-status)
    FlowStepper.tsx              center B: the 5-step age-gate + VPC flow
    InspectorPanel.tsx           right: timeline of every HttpExchange (expandable)
    ui.tsx                       badges, JSON viewer, header table, color helpers
  api/
    kid/access-age-verification/route.ts  POST /age-verification/perform-access-age-verification
    kid/verification-status/route.ts      GET  /age-verification/get-status
    kid/requirements/route.ts             GET  /age-gate/get-requirements
    kid/age-gate-check/route.ts           POST /age-gate/check
    kid/send-email/route.ts               POST /challenge/send-email
    kid/challenge-status/route.ts         GET  /challenge/get-status
    kid/session-get/route.ts              GET  /session/get
    kid/config/route.ts                   non-secret runtime config for the UI
    webhook/route.ts                 inbound webhook + HMAC-SHA256 verify
    webhook/events/route.ts          SSE stream to the inspector
    webhook/connections.ts           in-memory SSE client registry
lib/
  kid.ts                         SERVER-ONLY: kidCall() wraps every k-ID request,
                                 redacts Authorization, captures the HttpExchange
  types.ts                       shared types (client + server)
```

**How traffic is captured.** Every `/api/kid/*` route calls `kidCall()`, which
records the outbound `proxy→kid` exchange (method, URL, redacted headers, body,
status, response headers, response body, duration) and returns it alongside the
data. The client adds its own `browser→proxy` exchange. Webhooks are captured as a
`webhook` exchange and pushed over SSE. All three hop types render in the inspector,
color-coded and newest-first.

---

## Webhooks (optional)

k-ID pushes `Challenge.StateChange` and `Session.ChangePermissions` to your webhook
endpoint. To receive them locally, expose `http://localhost:3000/api/webhook` with a
tunnel (e.g. `ngrok http 3000`) and register that URL in the Compliance Studio.

Signature scheme: `HMAC-SHA256( timestamp + rawBody )`, hex lowercase, headers
`x-signature-hmac-sha256` and `x-signature-timestamp`. Set `WEBHOOK_SECRET` to
verify; without it the console accepts and labels events `not_configured`.

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Dev server on :3000 |
| `npm run build` | Production build |
| `npm run start` | Serve the production build on :3000 |
| `npm run typecheck` | `tsc --noEmit` |

---

## Reference

- k-ID Developer Hub: <https://docs.k-id.com>
- API overview: <https://docs.k-id.com/api/overview/>
- VPC guide: <https://docs.k-id.com/get-started/quickstart-guides/vpc/>
- Official reference explorer: <https://github.com/kidentify/k-id-dev-explorer>
