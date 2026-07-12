# Credit Subscription Implementation

## Existing architecture

ProPhrase is a Next.js 16 App Router application deployed on Vercel. Server route
handlers use Supabase Auth, Supabase Postgres, and the service-role client as the
query layer. Gemini is the only AI provider. Razorpay is the existing payment
provider. The browser and Expo mobile client share the same authenticated APIs.
There is no ORM, background-job runner, transactional email provider, admin UI,
or external analytics/error-monitoring SDK. The existing in-memory rate limiter
is retained, with database idempotency and wallet locking added for billing.

Existing billing uses `profiles`, `subscriptions`, and `webhook_events`, with
legacy `pro_monthly` and `pro_yearly` identifiers. Existing AI usage is enforced
through `usage_daily`. Credit billing is additive and disabled by default, so
these counters remain authoritative until rollout exits shadow mode.

## Provider integration

Razorpay remains the only payment provider. Checkout is created by trusted server
routes from internal plan and interval identifiers. Four secure Razorpay plan IDs
map Plus/Pro monthly/annual products. Browser return verification never trusts
price or plan data and activation requires a signed webhook or verified provider
lookup. Raw webhook payloads are not retained by the new processing path.

## AI endpoints

`POST /api/rewrite` and `POST /api/outcome-assistant` currently invoke Gemini and
are credit-consuming. Rephrase includes follow-ups and regeneration through the
same endpoint. Outcome Assistant includes Safe, Balanced, and Firm variants in
one base charge. Voice transcription is not presently a server AI endpoint and
is zero-credit but entitlement-gated when added.

## Database changes

Migration `003_credit_subscription_system.sql` extends subscriptions and profiles,
adds wallets, expiring grant buckets, reservations, usage, allocations,
adjustments, safe shadow estimates, and billing audit fields. Postgres functions
perform grant, reserve, commit, release, and reconciliation operations while
locking the wallet row. Unique constraints prevent duplicate grants, webhook
events, wallets, and per-user idempotency keys.

Legacy paid plans are explicitly mapped to Plus while preserving interval,
provider subscription, and paid-period dates. Existing message, thread, auth, and
usage data is not removed. Wallets and Free daily grants remain lazy.

## APIs and UI

The current routes remain. New canonical routes expose the server-approved plan
catalog, checkout, subscription state, credit balance, estimates, usage history,
and billing management. AI responses include authoritative credit metadata when
credit billing is enabled. The pricing page uses Free, Plus, and Pro with a
keyboard-accessible monthly/annual control. Workspace and mobile surfaces show
balance, cost preview, low-credit state, and input-limit guidance without storing
message text in billing records.

## Credit lifecycle

On authenticated activity the service resolves the plan and lazily creates the
current expiring grant. A generation request calculates Unicode code points on
the server, verifies input and entitlement, then atomically reserves available
credits. A successful verified generation commits the reservation and allocates
usage against earliest-expiring buckets. Any failure releases the reservation.
Stale reservations are releasable by reconciliation. Shadow mode only stores
character bucket, operation, expected cost, and request identifier.

Free grants reset at midnight Asia/Kolkata and never stack. Paid monthly and
annual subscriptions receive one monthly allocation; annual payment never grants
the full annual quantity. Unused credits expire at the entitlement boundary.

## Subscription lifecycle

Verified provider events map into stable internal statuses. Activation expires
Free credits and grants the paid allowance. Plus-to-Pro grants only the 1,200
credit difference for the same entitlement month. Downgrades and cancellations
are scheduled for period end. Annual cancellation continues monthly grants until
the annual term ends. Failed renewals enter a three-day grace period with no new
grant; recovery grants once. Confirmed full refunds and chargebacks expire unused
associated credits without creating a negative balance. Partial refunds are
audited and preserve access until a full-refund or terminal provider event.

## Feature gating

Plan entitlements live in the central catalog. Server checks are authoritative;
UI hiding is supplementary. Fact preservation, output validation, promise
detection, and safety checks are not weakened by plan. Feature gating has its own
rollout flag and is disabled initially.

## Security and privacy

The server ignores client prices, costs, balances, subscriptions, entitlements,
provider IDs, and discounts. Razorpay signatures use constant-time comparison.
Wallet mutations run in database transactions with row locks. Idempotency is
scoped to user, operation, and request hash. Billing records store counts,
buckets, safe identifiers, and timestamps only; never messages, generated output,
locked facts, recipient text, or payment secrets.

## Testing

Pure tests cover exact character boundaries, Unicode, catalog values, INR
formatting, entitlements, Free dates, monthly anchors, FIFO allocation, safe
analytics, provider event mapping, and webhook signature verification. The SQL
integration test covers grant, duplicate-grant prevention, reserve, idempotent
commit/release, admin audit, reconciliation, and non-negative balances. Existing
Outcome Assistant tests, lint, type checking, and production build remain
regression gates. The admin script supports one-user and dry-run batch
reconciliation.

## Rollout

1. Back up billing tables and apply the additive migration.
2. Deploy with credit billing disabled, shadow mode enabled, checkout disabled,
   feature gating disabled, and usage history disabled.
3. Configure four Razorpay plan IDs and webhook secret in test mode.
4. Enable credit calculations in shadow mode for internal accounts and reconcile.
5. Enable checkout, then enforcement for a limited cohort.
6. Enable plan gating and usage history after ledger and webhook verification.

## Rollback

Set `CREDIT_BILLING_ENABLED=false`, `PAID_CHECKOUT_ENABLED=false`, and
`PLAN_FEATURE_GATING_ENABLED=false`. Existing generation immediately returns to
the legacy usage counters. Do not drop credit tables or revert subscription data;
retain them for reconciliation and audit. The migration is additive and does not
delete legacy fields.

## Assumptions

- Existing ₹99 monthly and ₹699 annual subscribers map to Plus and retain their
  paid period; the ₹699 legacy price is not offered to new customers.
- No billing email is sent because no transactional email system exists.
- Provider-hosted management is used only where Razorpay exposes a safe link;
  otherwise cancellation/change routes call Razorpay from the server.
- `Asia/Kolkata` is the only grant timezone in the initial rollout.
