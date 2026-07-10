# ProPhrase Mobile

Expo/React Native mobile app for ProPhrase.

## Screens Implemented

- ProPhrase Mobile app shell
- Splash Screen
- Onboarding: Value Prop
- Onboarding: Tone Choice
- Onboarding: Get Started
- Home: Write
- Output: Result
- Tone Selection Sheet
- History: Recent Rewrites
- Templates: Library
- Template: Bug Update Detail
- Account: Settings
- Subscription: Upgrade Flow
- Alert: Limit Reached

## Backend Wiring

The app uses the existing Next.js backend:

- Supabase mobile auth session is sent as `Authorization: Bearer <access_token>`.
- `/api/workspace/bootstrap` loads profile, usage, templates, and history.
- `/api/rewrite` performs AI rewriting and stores conversations.
- `/api/threads/:id` loads full conversation history.
- `/api/universal-clipboard` creates one-device universal copy items.
- `/api/billing/create-subscription` starts the Razorpay subscription flow.

## Setup

```bash
cd mobile
npm install
cp .env.example .env
```

Fill:

```bash
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
```

For physical devices, replace `localhost` with your Mac LAN IP or a production
URL, for example:

```bash
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.10:3000
```

Run:

```bash
npm run ios
npm run android
```

From the repo root:

```bash
npm run mobile:start
```

## Notes

- Mobile auth uses Supabase magic links with the `prophrase://` app scheme.
- Universal Copy is wired to the same backend claim model as web.
- Native Razorpay checkout SDK integration is the next step for fully in-app
  payment. The current flow creates the backend subscription and opens pricing
  checkout fallback.
- Silent laptop `Ctrl+V` requires the planned ProPhrase desktop agent, which
  should use the same universal clipboard create/latest/claim API contract.
