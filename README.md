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

The V1 app stores recent rewrites only in browser `localStorage` under
`prophrase_history`.
