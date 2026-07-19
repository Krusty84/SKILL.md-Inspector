---
name: api-error-triage
description: Diagnose failing HTTP API calls - 4xx/5xx responses, timeouts, TLS errors, and auth failures - by isolating the fault layer and producing a minimal reproduction. Use when the user reports an API request failing, pastes an HTTP error response or status code, or asks why a request works in one client but not another. Do not use for designing new APIs or for performance tuning of requests that already succeed.
---

# API Error Triage

Find *which layer* broke — network, TLS, auth, request shape, or server — and
prove it with a minimal reproduction. Resist the urge to change code before the
fault layer is known.

## Step 1: Capture the actual failure

Get the exact request and response, not a paraphrase. Ask for (or reproduce
with `curl -v`) the method, URL, headers (secrets redacted), body, and the full
response including status and body. Error *bodies* usually name the real
problem; status codes alone often lie (see table below).

## Step 2: Walk the layers in order

Test each layer with the simplest possible probe; stop at the first one that
fails.

| Layer | Probe | If it fails |
|---|---|---|
| DNS / network | `curl -sv https://host/ -o /dev/null` | wrong host, VPN, firewall, proxy env vars |
| TLS | same probe, read handshake output | corporate MITM proxy, expired cert, old TLS version |
| Auth | minimal authenticated GET to a cheap endpoint | expired/wrong key, wrong header scheme, wrong environment's key |
| Request shape | real endpoint, minimal valid body | missing required field, wrong content-type, encoding |
| Server / data | original request | resource state, rate limit, genuine server bug |

## Step 3: Decode the status honestly

Common misdirections to check before trusting the code at face value:

- **401 vs 403**: 401 = who are you (credentials); 403 = you, specifically, may
  not (permissions/scopes). Rotating the key fixes only the first.
- **404**: often means "exists but you lack access" (deliberate masking), or a
  path typo — check for a stray trailing slash or missing API version segment.
- **400 with vague body**: diff the failing request against a known-good one
  from the docs, field by field, including header casing and content-type.
- **429**: read `Retry-After`; check whether the limit is per-key or per-IP
  before concluding the client is too chatty.
- **5xx**: not always the server's fault — malformed bodies that crash parsers
  frequently surface as 500. If a minimal valid body succeeds, it's the
  request.
- **Timeout**: distinguish connect timeout (network layer) from read timeout
  (server slow) — the fix lives in different places.

## Step 4: Minimal reproduction

Reduce to the smallest `curl` that still fails, then confirm the inverse: the
same command with one thing changed succeeds. That pair — failing command plus
passing command — *is* the diagnosis.

```bash
# fails: 400 {"error":"invalid_date"}
curl -s https://api.example.com/v2/bookings -H "$AUTH" \
  -d '{"date":"07/19/2026"}'
# passes: only the date format changed
curl -s https://api.example.com/v2/bookings -H "$AUTH" \
  -d '{"date":"2026-07-19"}'
```

## Step 5: Report

Deliver: the fault layer, the failing/passing pair, the fix, and — if the bug
was in client code — why it worked before, if it did. If the fault is on the
server side, draft the support ticket with the reproduction included.

## Rules

- Never print or log credentials; redact keys in every reproduction you show.
- Do not retry mutating requests (POST/DELETE) blindly during triage — probe
  with GETs or idempotent calls wherever possible.
- One variable per experiment. A probe that changes two things proves nothing.
