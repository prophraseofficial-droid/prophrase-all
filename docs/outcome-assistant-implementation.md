# ProPhrase Outcome Assistant Implementation

## Existing Architecture Summary

- Frontend framework: Next.js App Router with React client components for the web app, plus a separate Expo React Native app under `mobile/`.
- Backend framework: Next.js route handlers under `app/api/*`.
- Routing structure: public pages live in `app/page.tsx`, `app/login`, `app/pricing`, `app/legal`; authenticated workspace is `app/workspace/page.tsx`; APIs are route handlers.
- State management: local React state in client components. No global store.
- Styling system: Tailwind CSS tokens from `app/globals.css` for web; React Native `StyleSheet` tokens under `mobile/src/theme.ts` for native.
- Component library: custom components only. No external UI kit.
- Authentication: Supabase SSR/browser clients, middleware protection for `/workspace`, and Google auth.
- Existing AI integration: Gemini API is called server-side from `lib/ai/gemini.ts`.
- Existing API routes: rewrite, threads, templates, usage, billing, webhooks, workspace bootstrap, universal clipboard.
- Existing rephrasing workflow: `components/workspace/WorkspaceClient.tsx` calls `/api/rewrite`, stores thread/message content in Supabase, and increments usage.
- Existing input/output components: workspace composer, tone selector, message bubbles, copy actions, voice input using browser speech recognition.
- Existing database/storage: Supabase tables for profiles, usage, threads, messages, templates, and universal clipboard.
- Existing analytics: no analytics abstraction is currently present. Outcome Assistant will include a sanitised no-op tracker that can be wired later.
- Existing test framework: none configured. This implementation adds Node's built-in test runner for deterministic utilities and schema contracts.
- Existing deployment configuration: Vercel/Next.js, environment variables in Vercel and `.env.local.example`.
- Environment-variable handling: server secrets through non-public env vars; public browser values through `NEXT_PUBLIC_*`.
- Error handling: route handlers return `{ error, message }` via `apiError`; UI displays friendly inline messages.
- Loading states: buttons disable while requests are pending; workspace shows text-based processing states.
- Toast/notification components: none. Existing copy feedback uses local inline text.
- Responsive breakpoints: Tailwind `md` and `sm` classes; current workspace has separate mobile web navigation.
- Accessibility patterns: semantic buttons, focus-visible global styles, ARIA labels where needed.
- Feature flags: no prior flag system. This implementation adds `lib/feature-flags.ts`.

## Files Modified

- `app/api/outcome-assistant/route.ts`: authenticated, feature-flagged server endpoint.
- `components/workspace/WorkspaceClient.tsx`: feature-flagged mode selector; Rephrase remains default.
- `lib/ai/gemini.ts`: extends existing provider service with structured Outcome Assistant generation.
- `lib/security/validation.ts`: adds request schema and error codes.
- `.env.local.example`: documents `NEXT_PUBLIC_OUTCOME_ASSISTANT_ENABLED` and `OUTCOME_ASSISTANT_ENABLED`.
- `README.md`: setup and verification notes.
- `package.json`: adds `test` script for Node test runner.

## New Files Added

- `docs/outcome-assistant-implementation.md`: this plan and implementation record.
- `lib/feature-flags.ts`: central feature flag access.
- `prompts/outcome-assistant-v1/system.ts`: versioned system prompt.
- `lib/outcome-assistant/types.ts`: typed request/response contracts and enumerations.
- `lib/outcome-assistant/facts.ts`: deterministic protected-detail extraction and verification.
- `lib/outcome-assistant/commitments.ts`: deterministic promise/commitment detection and comparison.
- `lib/outcome-assistant/risks.ts`: risk labels, sorting, and deterministic fallback checks.
- `lib/outcome-assistant/schema.ts`: Zod validation, JSON parsing, repair helpers.
- `lib/outcome-assistant/service.ts`: request construction, provider call, repair retry, post-processing.
- `components/outcome-assistant/OutcomeAssistantPanel.tsx`: feature UI.
- `fixtures/outcome-assistant/examples.ts`: local seed examples.
- `tests/outcome-assistant.test.ts`: deterministic and schema contract tests.

## Data Flow

1. Authenticated user opens `/workspace`.
2. If `NEXT_PUBLIC_OUTCOME_ASSISTANT_ENABLED=true`, a mode selector shows `Rephrase` and `Outcome Assistant`.
3. User enters text, selects recipient and intention, optionally adds context and locked facts.
4. UI validates required fields and character limits.
5. UI sends a sanitised request to `/api/outcome-assistant`.
6. API verifies authentication, feature flag, rate limit, request schema, and usage limit.
7. API calls the Outcome Assistant service. Content is not stored by default.
8. API returns three verified variants and updated usage.
9. UI renders editable version cards, warnings, copy/use actions, comparison, and feedback controls.

## AI Request Flow

1. `buildOutcomePrompt` combines the versioned system prompt, safe request metadata, locked facts, and original message as untrusted content.
2. `generateOutcomeAssistantWithGemini` calls Gemini server-side using `GEMINI_API_KEY`.
3. The service parses JSON only and validates with Zod.
4. If validation fails, one repair retry asks Gemini to return valid JSON matching the schema.
5. Deterministic post-processing verifies locked facts, introduced numbers, commitments, placeholders, channel length, and action clarity.
6. Unsafe findings are attached to the relevant version instead of silently hidden.

## Security Considerations

- No provider secrets are exposed to the browser.
- User messages and generated outputs are not logged by Outcome Assistant code.
- The API route does not persist Outcome Assistant content by default.
- Original text is treated as untrusted content in the prompt.
- Request body is schema-validated and length-limited.
- Feature flag disabled state blocks navigation and API access.
- Analytics tracking is a sanitised no-op placeholder and does not collect message content.
- Rendered outputs are plain text in textareas/pre-wrapped text, never raw HTML.

## Testing Plan

- Unit tests cover fact extraction/verification, number extraction, commitment detection, risk ordering, schema validation, character limits, channel checks, analytics sanitisation, and feature-flag helpers where practical.
- Contract tests cover valid three-version output, missing/duplicate versions, invalid severities/risk types, empty messages, markdown-wrapped JSON, malformed JSON, missing facts, introduced numbers, and new commitments.
- Build verification includes `npm run lint`, `npm test`, and `npm run build`.
- Manual checks cover disabled flag, Rephrase default flow, mobile web layout, copy feedback, edit flow, regenerated requests, and safe error handling.

## Rollback Plan

1. Set `NEXT_PUBLIC_OUTCOME_ASSISTANT_ENABLED=false` and `OUTCOME_ASSISTANT_ENABLED=false` in Vercel.
2. Redeploy. The UI navigation disappears and the API returns feature-disabled responses.
3. If a code rollback is needed, revert the Outcome Assistant commit. Existing Rephrase API and UI are not modified in behaviour.

## Assumptions

- Outcome Assistant shares the existing rewrite daily usage bucket until a dedicated product quota exists.
- No analytics provider exists yet, so metadata tracking is implemented as a no-op sanitisation layer.
- Server-side voice transcription is not added; the web UI reuses browser speech recognition only when supported.
- Native iOS/Android app screens are intentionally not changed for this web-focused workspace feature.
