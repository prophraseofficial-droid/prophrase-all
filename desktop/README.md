# ProPhrase Desktop

Electron shell for the hosted ProPhrase web application. The desktop bundle
contains no Supabase, Gemini, Razorpay, or other server secrets.

## Development

Start the web app in one terminal, then the desktop shell in another:

```bash
npm run dev
npm run desktop:dev
```

`desktop:dev` loads `http://localhost:3000`. `desktop:start` and packaged apps
load `https://prophrase.in`. To test another HTTPS deployment:

```bash
PROPHRASE_APP_URL=https://staging.example.com npm run desktop:start
```

Google sign-in opens in the user's default browser so an existing Chrome or
browser session can be reused, then returns to the app through
`prophrase://auth/callback`. Add that callback to the Supabase Auth redirect
allowlist before shipping a production build.

## Packaging

```bash
npm run desktop:build:mac
npm run desktop:build:win
```

Artifacts are written to `desktop/dist/`. macOS packages should be built on
macOS and Windows packages on Windows in CI. Production distribution also needs
an Apple Developer ID certificate/notarization and a Windows code-signing
certificate; electron-builder discovers standard signing environment variables.

The Windows installer is an interactive NSIS installer. macOS builds produce a
DMG and ZIP, with hardened runtime enabled.
