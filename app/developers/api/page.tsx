import type { Metadata } from "next";
import Link from "next/link";
import { AuthAwarePublicHeader } from "@/components/AuthAwarePublicHeader";

export const metadata: Metadata = {
  title: "ProPhrase API Documentation",
  description: "Integrate ProPhrase rephrasing and Outcome Assistant into your application.",
};

const rephraseCurl = `curl https://prophrase.in/api/v1/rephrase \\
  -H "Authorization: Bearer $PROPHRASE_TOKEN" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: rewrite-2026-001" \\
  -d '{
    "text": "send me update today",
    "tone": "Professional"
  }'`;

const outcomeCurl = `curl https://prophrase.in/api/v1/outcome-assistant \\
  -H "Authorization: Bearer $PROPHRASE_TOKEN" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: outcome-2026-001" \\
  -d '{
    "originalText": "I need two more days to finish this safely.",
    "recipient": "manager",
    "intent": "extension_request",
    "relationshipLevel": "regular",
    "urgency": "today",
    "desiredResponse": "Approve the extension",
    "channel": "email",
    "lockedFacts": ["two more days"],
    "languageMode": "standard"
  }'`;

function CodeBlock({ children }: { children: string }) {
  return <pre className="overflow-x-auto rounded-lg bg-[#111] p-5 text-sm leading-6 text-white"><code>{children}</code></pre>;
}

function Field({ name, type, required, children }: { name: string; type: string; required?: boolean; children: React.ReactNode }) {
  return <div className="grid gap-1 border-b border-border-subtle py-3 md:grid-cols-[180px_150px_1fr] md:gap-4"><code className="text-sm font-semibold">{name}</code><span className="text-xs font-semibold uppercase text-text-muted">{type}{required ? " · required" : ""}</span><p className="text-sm leading-6 text-text-muted">{children}</p></div>;
}

export default function ApiDocumentationPage() {
  return (
    <main className="min-h-screen bg-[#fbfbfb] text-primary">
      <AuthAwarePublicHeader active="api" ctaLabel="Get started" />
      <div className="mx-auto grid max-w-[1280px] gap-10 px-5 pb-20 pt-28 md:grid-cols-[220px_minmax(0,1fr)] md:px-10">
        <aside className="hidden md:block"><nav className="sticky top-24 space-y-1 text-sm"><p className="mb-3 font-bold">API reference</p>{[["overview","Overview"],["authentication","Authentication"],["rephrase","Rephrase"],["outcome","Outcome Assistant"],["credits","Credits"],["errors","Errors"]].map(([href,label]) => <a className="block rounded-md px-3 py-2 text-text-muted hover:bg-white hover:text-primary" href={`#${href}`} key={href}>{label}</a>)}</nav></aside>

        <article className="min-w-0 max-w-4xl">
          <section className="border-b border-border-subtle pb-10" id="overview">
            <p className="text-sm font-semibold">ProPhrase API v1</p>
            <h1 className="mt-3 text-4xl font-bold md:text-5xl">Build clearer communication into your product.</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-text-muted">Use the same rephrasing, semantic safeguards, protected details, and Outcome Assistant available in the ProPhrase workspace.</p>
            <div className="mt-7 flex flex-wrap gap-3"><a className="rounded-md bg-primary px-5 py-3 text-sm font-semibold text-white" href="#rephrase">Make a request</a><a className="rounded-md border border-border-subtle bg-white px-5 py-3 text-sm font-semibold" href="/api/v1/openapi.json">OpenAPI JSON</a></div>
          </section>

          <section className="py-10" id="authentication">
            <h2 className="text-2xl font-bold">Authentication</h2>
            <p className="mt-3 leading-7 text-text-muted">Every v1 endpoint requires the signed-in user&apos;s Supabase access token. Send it as <code>Authorization: Bearer TOKEN</code>. Never use or expose the Supabase service-role key.</p>
            <CodeBlock>{`const { data } = await supabase.auth.getSession();
const token = data.session?.access_token;

fetch("https://prophrase.in/api/v1/rephrase", {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${token}\`,
    "Content-Type": "application/json",
    "Idempotency-Key": crypto.randomUUID()
  },
  body: JSON.stringify({ text: "send update today", tone: "Professional" })
});`}</CodeBlock>
            <p className="mt-4 text-sm leading-6 text-text-muted">Access tokens expire. Use the Supabase client&apos;s session refresh support. API requests consume the authenticated user&apos;s credits and follow their plan permissions.</p>
          </section>

          <section className="border-t border-border-subtle py-10" id="rephrase">
            <p className="font-mono text-sm font-semibold">POST /api/v1/rephrase</p><h2 className="mt-2 text-3xl font-bold">Rephrase a message</h2>
            <p className="mt-3 leading-7 text-text-muted">Correct spelling and grammar, then rewrite the message using the selected communication style while preserving meaning and protected facts.</p>
            <div className="mt-6"><Field name="text" type="string" required>3–5,000 characters.</Field><Field name="tone" type="enum" required>Professional, Polite, Shorter, Short &amp; Crisp, Human, Email, Slack, Teams, Jira Comment, WhatsApp, Client-safe, Manager-friendly, or Firmer.</Field><Field name="instruction" type="string">Optional custom instruction, 3–240 characters.</Field><Field name="threadId" type="uuid">Continue an existing ProPhrase conversation. Omit it to create a new thread.</Field></div>
            <h3 className="mb-3 mt-8 text-lg font-bold">Example</h3><CodeBlock>{rephraseCurl}</CodeBlock>
            <h3 className="mb-3 mt-8 text-lg font-bold">Successful response</h3><CodeBlock>{`{
  "requestId": "uuid",
  "result": "Please send me the update today.",
  "warnings": [],
  "promptVersion": "prophrase-prompt-v2.1",
  "repaired": false,
  "threadId": "uuid",
  "usage": { "rewriteRemaining": 24 },
  "credits": { "charged": 1, "remaining": 299 }
}`}</CodeBlock>
          </section>

          <section className="border-t border-border-subtle py-10" id="outcome">
            <p className="font-mono text-sm font-semibold">POST /api/v1/outcome-assistant</p><h2 className="mt-2 text-3xl font-bold">Prepare an outcome-focused message</h2>
            <p className="mt-3 leading-7 text-text-muted">Returns Safe, Balanced, and Firm alternatives with reader interpretation, risks, protected-detail verification, and commitment warnings.</p>
            <div className="mt-6"><Field name="originalText" type="string" required>3–5,000 characters.</Field><Field name="recipient" type="enum" required>manager, senior_leader, client, customer, colleague, direct_report, recruiter, vendor, friend, family, or other.</Field><Field name="intent" type="enum" required>request, follow_up, approval, status_update, escalation, disagreement, rejection, boundary, payment_request, apology, clarification, negotiation, extension_request, feedback, criticism_response, or other.</Field><Field name="customRecipient" type="string">Required when recipient is <code>other</code>.</Field><Field name="customIntent" type="string">Required when intent is <code>other</code>.</Field><Field name="relationshipLevel" type="enum">new, formal, regular, comfortable, or difficult.</Field><Field name="urgency" type="enum">none, today, few_days, urgent, or critical.</Field><Field name="desiredResponse" type="string">The response or action you want from the recipient.</Field><Field name="channel" type="enum">whatsapp, email, slack_teams, sms, linkedin, or other. Defaults to email.</Field><Field name="lockedFacts" type="string[]">Up to 30 values that must remain exact.</Field><Field name="languageMode" type="enum">standard or indian_workplace.</Field></div>
            <h3 className="mb-3 mt-8 text-lg font-bold">Example</h3><CodeBlock>{outcomeCurl}</CodeBlock>
            <h3 className="mb-3 mt-8 text-lg font-bold">Successful response</h3><CodeBlock>{`{
  "requestId": "uuid",
  "understoodIntent": "Request two additional days.",
  "variants": [
    { "id": "safe", "message": "...", "risks": [], "factVerification": [] },
    { "id": "balanced", "message": "...", "risks": [], "factVerification": [] },
    { "id": "firm", "message": "...", "risks": [], "factVerification": [] }
  ],
  "globalWarnings": [],
  "missingInformation": [],
  "credits": { "charged": 1, "remaining": 298 },
  "metadata": { "repaired": false, "fallback": false }
}`}</CodeBlock>
          </section>

          <section className="border-t border-border-subtle py-10" id="credits"><p className="font-mono text-sm font-semibold">GET /api/v1/credits</p><h2 className="mt-2 text-3xl font-bold">Credit balance</h2><p className="mt-3 leading-7 text-text-muted">Returns whether credit billing is enabled and the authenticated user&apos;s allowance, available balance, reservations, billing period, and next refresh time.</p><div className="mt-5"><CodeBlock>{`curl https://prophrase.in/api/v1/credits \\
  -H "Authorization: Bearer $PROPHRASE_TOKEN"`}</CodeBlock></div><p className="mt-4 text-sm leading-6 text-text-muted">Rephrase and Outcome Assistant cost 1 credit up to 500 characters, 2 up to 1,200, 4 up to 2,500, and 8 up to 5,000. Failed generation is not charged.</p></section>

          <section className="border-t border-border-subtle py-10" id="errors"><h2 className="text-3xl font-bold">Errors and limits</h2><p className="mt-3 leading-7 text-text-muted">Errors use a consistent JSON body: <code>{`{ "code": "ERROR_CODE", "message": "Human-readable message" }`}</code>.</p><div className="mt-5 grid gap-3 sm:grid-cols-2">{[["400","Invalid request body"],["401","Missing, expired, or invalid token"],["402","Insufficient credits or plan limit"],["403","Feature or input unavailable on the plan"],["409","Duplicate request still processing"],["422","AI output could not be safely validated"],["429","Rate or fair-use limit reached"],["502","AI provider unavailable"]].map(([status,label]) => <div className="rounded-md border border-border-subtle bg-white p-4" key={status}><code className="font-bold">{status}</code><p className="mt-1 text-sm text-text-muted">{label}</p></div>)}</div><p className="mt-5 text-sm leading-6 text-text-muted">Rate limits: 20 rephrase requests per minute and 12 Outcome Assistant requests per minute per user. Send a unique <code>Idempotency-Key</code> for safe retries. Maximum input length is 5,000 characters.</p></section>

          <footer className="border-t border-border-subtle pt-8 text-sm text-text-muted"><p>API version: v1 · Updated July 2026 · <Link className="font-semibold text-primary" href="/legal">Terms and privacy</Link></p></footer>
        </article>
      </div>
    </main>
  );
}
