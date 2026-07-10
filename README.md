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
