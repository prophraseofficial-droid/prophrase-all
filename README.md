# ProPhrase

Turn rough work messages into clear professional replies.

## Local Development

Install dependencies:

```bash
npm install
```

Create `.env.local`:

```bash
cp .env.local.example .env.local
```

Fill in the Supabase, Gemini, and Razorpay values in `.env.local`. Never commit
real keys. If a key is printed in logs or shared in chat, rotate it in the
provider dashboard before using the app in production.

## Credit billing

The credit ledger is additive and disabled by default. Apply
`supabase/migrations/003_credit_subscription_system.sql` to a test Supabase
project before enabling it. The permanent commercial catalog is:

- Free: 15 credits daily, up to 1,200 characters
- Plus: 300 credits monthly, ₹99/month or ₹899/year, up to 2,500 characters
- Pro: 1,500 credits monthly, ₹249/month or ₹1,999/year, up to 5,000 characters

Annual subscribers receive one monthly credit bucket, not the whole annual
allowance. Unused credits expire at the daily or monthly boundary.

Credit tiers are 1 credit for 1–500 characters, 2 for 501–1,200, 4 for
1,201–2,500, and 8 for 2,501–5,000. Counting trims surrounding whitespace,
normalises line endings, and counts Unicode code points. Failed generation and
provider retries do not create usage charges.

Safe initial rollout:

```bash
CREDIT_BILLING_ENABLED=false
CREDIT_BILLING_SHADOW_MODE=true
PAID_CHECKOUT_ENABLED=false
PLAN_FEATURE_GATING_ENABLED=false
CREDIT_USAGE_HISTORY_ENABLED=false
```

Configure four Razorpay plans using `RAZORPAY_PLUS_MONTHLY_PLAN_ID`,
`RAZORPAY_PLUS_ANNUAL_PLAN_ID`, `RAZORPAY_PRO_MONTHLY_PLAN_ID`, and
`RAZORPAY_PRO_ANNUAL_PLAN_ID`. Set the Razorpay webhook URL to
`https://prophrase.in/api/webhooks/razorpay` and subscribe to activation,
charged/renewal, pause/halt, resume, cancellation/completion, refund, and dispute
events. Checkout return does not activate a plan without a signed webhook or a
verified Razorpay lookup.

`RAZORPAY_PLAN_MONTHLY_ID` and `RAZORPAY_PLAN_YEARLY_ID` are legacy recognition
values only. They are never used to create new checkout sessions.

For a dry-run reconciliation or a support inspection:

```bash
npm run billing:admin -- inspect USER_UUID
npm run billing:admin -- reconcile USER_UUID
npm run billing:admin -- reconcile USER_UUID --apply
npm run billing:admin -- reconcile-all
npm run billing:admin -- reconcile-all --apply
```

Goodwill adjustments require an acting administrator UUID, reason code, support
reference, and human-readable reason. There is no unrestricted browser balance
mutation endpoint. See `docs/credit-subscription-implementation.md` for migration,
privacy, deployment, and rollback details.

Outcome Assistant is feature-flagged and disabled by default:

```bash
NEXT_PUBLIC_OUTCOME_ASSISTANT_ENABLED=false
OUTCOME_ASSISTANT_ENABLED=false
```

Set both values to `true` to show the workspace mode and enable
`/api/outcome-assistant`. It uses the existing server-side Gemini configuration
and does not store Outcome Assistant message content by default.

Run the web app:

```bash
npm run dev
```

## Auth URLs

Supabase Auth URL Configuration should include both the server callback and the
browser fallback route:

```text
Site URL: https://prophrase.in

Redirect URLs:
https://prophrase.in/api/auth/callback
https://prophrase.in/auth/finish
https://prophrase.in/workspace
http://localhost:3000/api/auth/callback
http://localhost:3000/auth/finish
http://localhost:3000/workspace
```

Use `NEXT_PUBLIC_APP_URL=http://localhost:3000` for local development and
`NEXT_PUBLIC_APP_URL=https://prophrase.in` in Vercel production.

## Mobile App

The Expo mobile app lives in `mobile/`.

```bash
npm run mobile:install
npm run mobile:start
```

Create `mobile/.env` from `mobile/.env.example` and point
`EXPO_PUBLIC_API_BASE_URL` to this Next.js backend.

Mobile requests use Supabase bearer tokens, so the existing backend APIs work
for browser cookies and native mobile sessions.

## Testing

```bash
npm run lint
npm test
npm run build
npm run security:client-bundle
```

The Outcome Assistant tests cover deterministic fact protection, commitment
detection, schema validation, risk ordering, and analytics sanitisation.
Billing tests cover exact character boundaries, Unicode, plan prices and
entitlements, IST reset boundaries, month-end anchors, and bucket allocation.
Run the transactional SQL suite against an isolated migrated database as
documented in `tests/sql/README.md`.

## Privacy Notes

ProPhrase provides communication guidance based on message context. Users should
review important messages before sending. Do not send message content, generated
content, locked facts, voice transcripts, or custom recipient/intent text to
analytics.

Credit records contain only request identifiers, operation type, character
count, cost bucket, model tier, plan metadata, and timestamps. They never contain
the message, generated output, voice transcript, locked facts, recipient, or
intent. On account deletion, application credit records cascade with the profile;
provider payment records remain subject to Razorpay and legal retention rules.
