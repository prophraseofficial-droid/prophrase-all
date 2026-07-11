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
```

The Outcome Assistant tests cover deterministic fact protection, commitment
detection, schema validation, risk ordering, and analytics sanitisation.

## Privacy Notes

ProPhrase provides communication guidance based on message context. Users should
review important messages before sending. Do not send message content, generated
content, locked facts, voice transcripts, or custom recipient/intent text to
analytics.
