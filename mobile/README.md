# ProPhrase Mobile

Expo/React Native clients for Android and iOS. The mobile app uses the existing
ProPhrase API and Supabase project; no website code is required for native
builds.

## Mobile feature set

- Google OAuth, magic-link, and email/password sign-in
- Secure native session storage
- Rewrite composer, tones, Quick Styles, and preferences
- Outcome Assistant with recipient, goal, channel, risk, and variants
- History with full conversation details and copying
- Template search and reuse
- Universal Copy create/latest/claim flow
- Synced plan, credits, subscription status, and account settings
- Privacy, terms, support, and account-deletion request controls
- Offline, timeout, loading, empty, limit, and workspace-retry states

## Subscription behavior

The App Store and Play Store builds are consumption-only clients. They do not
open Razorpay or a web checkout from the native UI. A user who already has a
paid ProPhrase account receives the correct entitlements after signing in; the
app refreshes these entitlements whenever it returns to the foreground.

Adding native subscription purchasing later requires StoreKit/Google Play
Billing plus server-side receipt verification and entitlement reconciliation.

## Local setup

```bash
cd mobile
nvm use
npm install
cp .env.example .env
```

Set these public client values in `.env`:

```bash
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_WEB_BASE_URL=https://prophrase.in
```

The native callback is fixed to `prophrase://auth/callback`, and production
builds always use the intended ProPhrase API and Supabase project. Environment
values cannot redirect production credentials to a different host.

`EXPO_PUBLIC_*` values are compiled into the app and must never contain a
service-role key, Razorpay secret, Gemini key, or other server secret.

Run a simulator:

```bash
npm run ios
npm run android
```

For a physical device, run the web API from the repository root with LAN
access, then start Expo from this directory:

```bash
npm run dev -- --hostname 0.0.0.0
cd mobile
npm run start:device -- --clear
```

Add the exact `exp://` callback shown by the device script to Supabase Auth URL
Configuration. Keep `prophrase://**` registered for preview and production
builds.

## EAS environments

Create `preview` and `production` EAS environment variables for:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

The non-secret production URL values are already declared in `eas.json`. Keep
all server-only variables in Vercel; they do not belong in EAS.

## Validation and builds

```bash
npm run typecheck
npm run doctor
npm run release:check
npm run build:preview
npm run build:android
npm run build:ios
```

Production Android builds are AAB files. Preview Android builds are internal
APK files. EAS manages remote build numbers and signing credentials after the
project is linked with `npx --yes eas-cli@21.0.2 init`. Use Node 22.13.0 as
declared in `.nvmrc` before running release checks or builds.

## Store release gate

The current in-app deletion control prepares a request email. Before public
Play Store or App Store submission, add a server-authenticated self-service
account-deletion endpoint and connect this control to it. Store review expects
users to be able to initiate deletion without relying only on an email request.

## Store review access

Create a restricted Supabase email/password account containing only reviewer
sample data. Put those credentials in Play Console App Access and App Store
Connect Review Notes. Do not submit your own admin account or any server secret.

Before review, verify sign-in, rewrite, Outcome Assistant, Universal Copy,
history, preference persistence, foreground plan refresh, deletion request,
privacy/terms links, sign-out, and a clean reinstall on both platforms.
