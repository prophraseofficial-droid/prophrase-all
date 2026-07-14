# ProPhrase Browser Extension

One WXT/React codebase produces installable builds for Chrome, Microsoft Edge,
and Firefox.

## Features

- Secure ProPhrase connection with a revocable, scoped device token
- Read selected text only when the extension is opened or its context menu is used
- Rephrase using the existing ProPhrase styles
- Prepare Safe, Balanced, and Firm Outcome Assistant messages
- Copy a result or replace the selected editable text
- Show the current ProPhrase credit balance

## Local development

1. Apply `supabase/migrations/006_extension_api_tokens.sql` to the Supabase project.
2. Copy `.env.example` to `.env.development` and use
   `VITE_PROPHRASE_APP_URL=http://localhost:3000` for local web authentication.
3. From the repository root, run `npm run extension:install` once.
4. Run `npm run dev` for the web app and `npm run extension:dev` for Chrome.
5. For Firefox development, run `npm --prefix extension run dev:firefox`.

WXT opens a temporary browser profile during development. Sign in through the
extension's **Connect ProPhrase** button so the callback returns to that extension.

Before deploying the web connection flow, set `EXTENSION_REDIRECT_ORIGINS` in
Vercel to the exact comma-separated origins returned by
`browser.identity.getRedirectURL("connected")` in each published extension. Do
not use wildcard origins. Chrome and Edge use `*.chromiumapp.org`; Firefox uses
`*.extensions.allizom.org`.

## Production builds

Run:

```bash
npm run extension:build
```

Outputs:

- `extension/.output/chrome-mv3`
- `extension/.output/edge-mv3`
- `extension/.output/firefox-mv2`

Create store-ready archives with `npm run extension:zip`. The Chrome package is
submitted to the Chrome Web Store, the Edge package to Microsoft Edge Add-ons,
and the Firefox package to Mozilla Add-ons.

## Permissions

- `activeTab` and `scripting`: read or replace text only on the active page after a user action
- `contextMenus`: expose **Rephrase with ProPhrase** for selected text
- `identity`: complete the browser-owned sign-in callback
- `storage`: store the revocable ProPhrase device token locally
- `https://prophrase.in/*`: call ProPhrase APIs and open the connection page

The extension does not request browsing-history or all-sites background access.
It transmits user-selected message text to ProPhrase for processing, along with
the device credential required to authenticate the request.
