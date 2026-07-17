import type { Metadata } from "next";
import Link from "next/link";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { getCurrentUser } from "@/lib/supabase/server";

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

const apiNavigation = [
  ["overview", "Overview"],
  ["authentication", "Authentication"],
  ["rephrase", "Rephrase"],
  ["outcome", "Outcome Assistant"],
  ["credits", "Credits"],
  ["errors", "Errors"],
] as const;

function CodeBlock({ children }: { children: string }) {
  return (
    <div className="api-code-block">
      <div className="api-code-bar" aria-hidden="true"><span /><span /><span /></div>
      <pre><code>{children}</code></pre>
    </div>
  );
}

function Field({ name, type, required, children }: { name: string; type: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="api-field">
      <code>{name}</code>
      <span>{type}{required ? " · required" : ""}</span>
      <p>{children}</p>
    </div>
  );
}

export default async function ApiDocumentationPage() {
  const user = await getCurrentUser();
  const isAuthenticated = Boolean(user);
  const appHref = isAuthenticated ? "/workspace" : "/login";

  return (
    <main className="landing-page api-page" id="top">
      <LandingHeader appHref={appHref} isAuthenticated={isAuthenticated} />

      <section className="api-hero" id="overview">
        <div className="landing-shell api-hero-grid">
          <div className="api-hero-copy">
            <span className="landing-eyebrow api-eyebrow"><span aria-hidden="true">{`</>`}</span> ProPhrase API v1</span>
            <h1>Clearer communication.<br />Built into your product.</h1>
            <p>Bring ProPhrase rewriting, protected details, semantic safeguards and Outcome Assistant into the tools your team already uses.</p>
            <div className="api-hero-actions">
              <a className="landing-button landing-button-dark" href="#rephrase">Make a request <span aria-hidden="true">↓</span></a>
              <a className="landing-button landing-button-light" href="/api/v1/openapi.json">OpenAPI JSON</a>
            </div>
          </div>

          <div className="api-hero-code" aria-label="API request example">
            <div className="api-hero-code-header"><span>POST</span><code>/api/v1/rephrase</code></div>
            <pre><code>{`{
  "text": "send me update today",
  "tone": "Professional"
}`}</code></pre>
            <div className="api-hero-code-response"><span>200 OK</span><p>Please send me the update today.</p></div>
          </div>
        </div>
      </section>

      <section className="api-reference">
        <div className="landing-shell api-reference-grid">
          <aside className="api-sidebar">
            <nav aria-label="API reference sections">
              <p>API reference</p>
              {apiNavigation.map(([href, label], index) => (
                <a href={`#${href}`} key={href}><span>0{index + 1}</span>{label}</a>
              ))}
            </nav>
          </aside>

          <article className="api-document">
            <section className="api-doc-section" id="authentication">
              <div className="api-section-heading"><span>Get connected</span><h2>Authentication</h2></div>
              <p className="api-section-lead">Every v1 endpoint requires the signed-in user&apos;s Supabase access token. Send it as <code>Authorization: Bearer TOKEN</code>. Never use or expose the Supabase service-role key.</p>
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
              <p className="api-note">Access tokens expire. Use the Supabase client&apos;s session refresh support. API requests consume the authenticated user&apos;s credits and follow their plan permissions.</p>
            </section>

            <section className="api-doc-section" id="rephrase">
              <div className="api-endpoint"><span>POST</span><code>/api/v1/rephrase</code></div>
              <div className="api-section-heading"><span>Core rewrite</span><h2>Rephrase a message</h2></div>
              <p className="api-section-lead">Correct spelling and grammar, then rewrite the message using the selected communication style while preserving meaning and protected facts.</p>
              <div className="api-fields">
                <Field name="text" type="string" required>3–5,000 characters.</Field>
                <Field name="tone" type="enum" required>Professional, Polite, Shorter, Short &amp; Crisp, Human, Email, Slack, Teams, Jira Comment, WhatsApp, Client-safe, Manager-friendly, or Firmer.</Field>
                <Field name="instruction" type="string">Optional custom instruction, 3–240 characters.</Field>
                <Field name="threadId" type="uuid">Continue an existing ProPhrase conversation. Omit it to create a new thread.</Field>
              </div>
              <h3 className="api-code-title">Example request</h3><CodeBlock>{rephraseCurl}</CodeBlock>
              <h3 className="api-code-title">Successful response</h3><CodeBlock>{`{
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

            <section className="api-doc-section" id="outcome">
              <div className="api-endpoint"><span>POST</span><code>/api/v1/outcome-assistant</code></div>
              <div className="api-section-heading"><span>Outcome control</span><h2>Prepare an outcome-focused message</h2></div>
              <p className="api-section-lead">Returns Safe, Balanced, and Firm alternatives with reader interpretation, risks, protected-detail verification, and commitment warnings.</p>
              <div className="api-fields">
                <Field name="originalText" type="string" required>3–5,000 characters.</Field>
                <Field name="recipient" type="enum" required>manager, senior_leader, client, customer, colleague, direct_report, recruiter, vendor, friend, family, or other.</Field>
                <Field name="intent" type="enum" required>request, follow_up, approval, status_update, escalation, disagreement, rejection, boundary, payment_request, apology, clarification, negotiation, extension_request, feedback, criticism_response, or other.</Field>
                <Field name="customRecipient" type="string">Required when recipient is <code>other</code>.</Field>
                <Field name="customIntent" type="string">Required when intent is <code>other</code>.</Field>
                <Field name="relationshipLevel" type="enum">new, formal, regular, comfortable, or difficult.</Field>
                <Field name="urgency" type="enum">none, today, few_days, urgent, or critical.</Field>
                <Field name="desiredResponse" type="string">The response or action you want from the recipient.</Field>
                <Field name="channel" type="enum">whatsapp, email, slack_teams, sms, linkedin, or other. Defaults to email.</Field>
                <Field name="lockedFacts" type="string[]">Up to 30 values that must remain exact.</Field>
                <Field name="languageMode" type="enum">standard or indian_workplace.</Field>
              </div>
              <h3 className="api-code-title">Example request</h3><CodeBlock>{outcomeCurl}</CodeBlock>
              <h3 className="api-code-title">Successful response</h3><CodeBlock>{`{
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

            <section className="api-doc-section" id="credits">
              <div className="api-endpoint"><span>GET</span><code>/api/v1/credits</code></div>
              <div className="api-section-heading"><span>Shared usage</span><h2>Credit balance</h2></div>
              <p className="api-section-lead">Returns whether credit billing is enabled and the authenticated user&apos;s allowance, available balance, reservations, billing period, and next refresh time.</p>
              <CodeBlock>{`curl https://prophrase.in/api/v1/credits \\
  -H "Authorization: Bearer $PROPHRASE_TOKEN"`}</CodeBlock>
              <p className="api-note">Rephrase and Outcome Assistant cost 1 credit up to 500 characters, 2 up to 1,200, 4 up to 2,500, and 8 up to 5,000. Failed generation is not charged.</p>
            </section>

            <section className="api-doc-section" id="errors">
              <div className="api-section-heading"><span>Predictable handling</span><h2>Errors and limits</h2></div>
              <p className="api-section-lead">Errors use a consistent JSON body: <code>{`{ "code": "ERROR_CODE", "message": "Human-readable message" }`}</code>.</p>
              <div className="api-error-grid">
                {[["400", "Invalid request body"], ["401", "Missing, expired, or invalid token"], ["402", "Insufficient credits or plan limit"], ["403", "Feature or input unavailable on the plan"], ["409", "Duplicate request still processing"], ["422", "AI output could not be safely validated"], ["429", "Rate or fair-use limit reached"], ["502", "AI provider unavailable"]].map(([status, label]) => (
                  <div key={status}><code>{status}</code><p>{label}</p></div>
                ))}
              </div>
              <p className="api-note">Rate limits: 20 rephrase requests per minute and 12 Outcome Assistant requests per minute per user. Send a unique <code>Idempotency-Key</code> for safe retries. Maximum input length is 5,000 characters.</p>
            </section>

            <div className="api-document-meta"><p>API version: v1 · Updated July 2026 · <Link href="/legal">Terms and privacy</Link></p></div>
          </article>
        </div>
      </section>

      <LandingFooter />
    </main>
  );
}
