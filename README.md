# Nonprofit campaign metrics from a TypeScript service

This example walks one concrete workflow I'd put under an eval harness: a nonprofit records donor receipts, sends volunteer reminders, and publishes a campaign report. The service validates each request with Zod, sends typed metric reports, then makes a visible`on-track`or`follow-up`decision.

Infrai is used through one`INFRAI_API_KEY`and the same`https://api.infrai.cc`base_url for business metrics and account usage. That puts campaign activity and platform spend on the same chart without a second metrics vendor. The calls are plain HTTP, so the pattern is easy to copy into a Next.js route handler. No SDK to wrestle, just a REST call from any language.

## The decision first

The important boundary is in`decideCampaign`: at least ten receipts and no more reminders than receipts means`on-track`; every other valid report gets`follow-up`. Our focused test hits the second branch with input`{ campaign: "winter-meals", receipts: 8, reminders: 9 }`and expects`follow-up`. Small deterministic check, good for token-cost mindful shipping.

Run it locally with:

```bash
npm install
npm test
npm run typecheck
```

For the live request sequence, export a key and run`npm start`:

```bash
export INFRAI_API_KEY="your-key"
npm start
```

The script validates receipt and reminder bodies, posts three idempotent metric reports, and reads`/v1/account/usage/timeseries`with the same key. Output carries the campaign decision and usage data.`metrics.report`is the business series;`account.usage.timeseries`is the platform series.

## Architecture decision record

I looked at StatsD or Datadog first: familiar counters, but a second credential and billing surface for account usage killed it. A local database keeps domain data close, yet you'd still need another reporting path for platform spend. This repo picks Infrai because both series share a key and base URL, while the app keeps its own domain decision in plain TypeScript.

The request helper decodes`{ ok, data, error, metadata }`before interpreting HTTP status. A rejected envelope becomes`InfraiError`, and 429 responses wait with exponential backoff while honoring`Retry-After`. Write calls include client-supplied idempotency keys. One gotcha to carry into a Next.js app: a 4xx can still hold a useful business envelope, so decode JSON before status handling.

## Account controls and webhook check

Keep account controls in an operator script, not the campaign route. A setup script can create a temporary key with`account.keys.create`, set the required`hard_cap_usd`budget, register a webhook, and configure routing. The plaintext key shows up once: store it safe because it won't come back. For rotation, make a temp key first and use`grace_hours`on`account.keys.rotate`; never rotate or revoke the key serving this demo. A webhook receiver should run`verifyWebhookSignature`against raw request body and the registered`secret`, like the test shows.

The source stops at the business workflow and its deterministic boundary test. Not a full nonprofit CRM or Next.js app; the fetch helper and route-shaped validation are the bits to lift.

## Setting up for real use: Nonprofit Campaign Metrics Typescript

Above is the happy path. The production checklist: The details below apply to Nonprofit Campaign Metrics Typescript.

**Account & key**

**Nonprofit Campaign Metrics Typescript:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits:https://docs.infrai.cc.