# Razorpay live-mode rollout

Test and live Razorpay data are isolated. Live keys cannot access test plans,
customers, subscriptions, payments, or webhooks, so all provider objects below
must be created again while the Razorpay Dashboard is in **Live Mode**.

## 1. Prepare the Razorpay account

1. Complete account activation/KYC, settlement bank details, and website review.
2. Confirm `https://prophrase.in` is approved/whitelisted in Razorpay.
3. Confirm Razorpay Subscriptions and the intended recurring methods are enabled.
4. In **Live Mode**, generate the API key ID and secret. Save the secret when it
   is shown; it cannot be viewed again.

## 2. Recreate the four plans in Live Mode

Create four separate live plans. The live plan IDs are different from all test
plan IDs.

| Vercel variable | Amount | Razorpay period | Interval |
| --- | ---: | --- | ---: |
| `RAZORPAY_PLUS_MONTHLY_PLAN_ID` | 9900 paise (₹99) | monthly | 1 |
| `RAZORPAY_PLUS_ANNUAL_PLAN_ID` | 89900 paise (₹899) | yearly | 1 |
| `RAZORPAY_PRO_MONTHLY_PLAN_ID` | 24900 paise (₹249) | monthly | 1 |
| `RAZORPAY_PRO_ANNUAL_PLAN_ID` | 199900 paise (₹1,999) | yearly | 1 |

If the prices change, update both the Razorpay plan and its corresponding
`*_PRICE_PAISE` variable. The server rejects checkout when the amount, currency,
or billing period does not match.

## 3. Create the Live Mode webhook

Create a new webhook while the Dashboard is in **Live Mode**:

- URL: `https://prophrase.in/api/webhooks/razorpay`
- Secret: generate a new strong random value; do not reuse the API key secret.
- Alert email: an address that is actively monitored.
- Events:
  - `subscription.authenticated`
  - `subscription.activated`
  - `subscription.charged`
  - `subscription.completed`
  - `subscription.updated`
  - `subscription.pending`
  - `subscription.halted`
  - `subscription.paused`
  - `subscription.resumed`
  - `subscription.cancelled`
  - `payment.failed`
  - `refund.processed`
  - `payment.dispute.created`

Put the exact webhook secret in `RAZORPAY_WEBHOOK_SECRET`. Test and live webhooks
are separate. Before replacing the production secret, disable any test webhook
that points to the production URL so its retries are not mixed with live events.

## 4. Update Vercel Production variables

Set these on the **Production** environment only:

```text
RAZORPAY_MODE=live
RAZORPAY_KEY_ID=rzp_live_...
RAZORPAY_KEY_SECRET=<live key secret>
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_live_...  # exactly equal to RAZORPAY_KEY_ID
RAZORPAY_WEBHOOK_SECRET=<live webhook secret>
RAZORPAY_PLUS_MONTHLY_PLAN_ID=plan_...
RAZORPAY_PLUS_ANNUAL_PLAN_ID=plan_...
RAZORPAY_PRO_MONTHLY_PLAN_ID=plan_...
RAZORPAY_PRO_ANNUAL_PLAN_ID=plan_...
PLUS_MONTHLY_PRICE_PAISE=9900
PLUS_ANNUAL_PRICE_PAISE=89900
PRO_MONTHLY_PRICE_PAISE=24900
PRO_ANNUAL_PRICE_PAISE=199900
BILLING_CURRENCY=INR
APP_ENV=production
NEXT_PUBLIC_APP_ENV=production
NEXT_PUBLIC_APP_URL=https://prophrase.in
```

Keep `RAZORPAY_MODE=test`, test keys, test plan IDs, and a test webhook secret in
local and Preview environments. Never place `RAZORPAY_KEY_SECRET` or
`RAZORPAY_WEBHOOK_SECRET` in a `NEXT_PUBLIC_*` variable.

`RAZORPAY_PLAN_MONTHLY_ID` and `RAZORPAY_PLAN_YEARLY_ID` are legacy recognition
variables. Leave them unset in Production unless you have genuine older **live**
plans that still need webhook recognition. Never copy test legacy IDs into the
live configuration.

Do not enable checkout in the same deployment that first introduces unverified
credentials. Initially keep:

```text
PAID_CHECKOUT_ENABLED=false
```

Redeploy after every `NEXT_PUBLIC_*` change because public variables are embedded
in the browser bundle at build time.

Once the live canary is verified, the final commercial flags should be:

```text
PRICING_PAGE_ENABLED=true
CREDIT_BILLING_ENABLED=true
CREDIT_BILLING_SHADOW_MODE=false
PAID_CHECKOUT_ENABLED=true
PLAN_FEATURE_GATING_ENABLED=true
CREDIT_USAGE_HISTORY_ENABLED=true
```

`CREDIT_USAGE_HISTORY_ENABLED` is optional UI visibility; the other values make
the paid catalog, credit enforcement, checkout, and plan entitlements operate as
one coherent commercial system. Apply all Supabase billing migrations before
turning these flags on.

## 5. Check stored test billing data

If test payments used the same production Supabase project, test subscription
rows and `profiles.razorpay_*` IDs remain in the database but do not exist in
Razorpay Live Mode. Do not delete them blindly: first identify test accounts and
confirm that none represents a real entitlement. Either use a clean production
database or reconcile those explicitly selected test users back to the free plan
before enabling live checkout. Existing test subscriptions cannot be converted
to live subscriptions; users must complete a new live mandate.

## 6. Verify and launch

With the intended production variables available in a secure local shell, run:

```bash
npm run billing:verify-razorpay
```

The command reads all four plans from Razorpay and checks mode, key consistency,
amounts, INR currency, intervals, unique plan IDs, and webhook-secret presence.
It never prints credential values.

Then:

1. Deploy with `PAID_CHECKOUT_ENABLED=false` and confirm the deployment is healthy.
2. Use a restricted internal/canary path or brief controlled window for one real
   low-value payment; Razorpay has no live-mode dummy card.
3. Confirm the payment is captured, the live subscription is active, the signed
   webhook returned 2xx, the local profile changed to the paid plan, and exactly
   one credit grant was recorded.
4. Test cancellation-at-cycle-end and confirm the Razorpay and local states agree.
5. Set `PAID_CHECKOUT_ENABLED=true`, redeploy, and monitor webhook failures,
   payments, subscriptions, settlements, refunds, and disputes.

Rollback is `PAID_CHECKOUT_ENABLED=false` followed by a redeploy. This blocks new
checkouts but does not cancel existing live subscriptions; manage or reconcile
those separately.
