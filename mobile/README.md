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
nvm use
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

### Actual iPhone

During Expo's SDK 57 transition, the public iOS Expo Go app supports SDK 54 for
physical-device projects. The ProPhrase mobile package is therefore pinned to
SDK 54-compatible modules for App Store Expo Go testing while the web/backend
remain unchanged.

Install the latest Expo Go from the App Store, connect the iPhone and Mac to the
same Wi-Fi, and run:

```bash
npm run iphone -- --clear
```

This command detects the Mac LAN address, points mobile API requests at the
local Next.js server, and starts Metro for Expo Go. Add the exact `exp://`
callback printed by the command to Supabase Dashboard -> Authentication -> URL
Configuration -> Redirect URLs. Then scan the QR code with the iPhone Camera.

From the repo root:

```bash
npm run mobile:start
npm run mobile:ios
```

The default simulator scripts are emulator-safe: they use `EXPO_OFFLINE=1`,
`--localhost`, `REACT_NATIVE_PACKAGER_HOSTNAME=127.0.0.1`, and IPv4-first DNS.
This avoids the Expo GraphQL session request that can print
`UnexpectedServerData` and prevents Metro from binding to IPv6 `::1` while
Expo Go tries `127.0.0.1`. The `iphone`/`*:device` script uses the detected LAN
address for Metro, the API, and the Expo Go OAuth callback.

## Notes

- Mobile auth supports Google OAuth and Supabase magic links. Both persist the
  same Supabase session and return through the `prophrase://auth/callback` app
  scheme in development/production builds.
- In Supabase Dashboard -> Authentication -> URL Configuration, add
  `prophrase://**` for development/production builds and the exact `exp://`
  callback printed by `npm run iphone` for Expo Go testing.
- Google must remain enabled in Supabase Dashboard -> Authentication -> Providers.
- Universal Copy is wired to the same backend claim model as web.
- Native Razorpay checkout SDK integration is the next step for fully in-app
  payment. The current flow creates the backend subscription and opens pricing
  checkout fallback.
- Silent laptop `Ctrl+V` requires the planned ProPhrase desktop agent, which
  should use the same universal clipboard create/latest/claim API contract.
