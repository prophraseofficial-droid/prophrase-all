import { useEffect, useMemo, useState } from "react";
import { browser } from "wxt/browser";
import { clearToken, connect, getToken } from "../../lib/auth";
import { loadCredits, prepareOutcome, rephrase, revokeToken } from "../../lib/api";
import { readSelection, replaceSelection } from "../../lib/page";
import type { CreditsResponse, Mode, OutcomeVersion } from "../../lib/types";

const tones = [
  "Professional", "Polite", "Shorter", "Short & Crisp", "Human", "Email",
  "Slack", "Teams", "Jira Comment", "WhatsApp", "Client-safe",
  "Manager-friendly", "Firmer",
];
const recipients = [
  ["manager", "Manager"], ["senior_leader", "Senior leader"], ["client", "Client"],
  ["customer", "Customer"], ["colleague", "Colleague"], ["direct_report", "Direct report"],
  ["recruiter", "Recruiter"], ["vendor", "Vendor"], ["friend", "Friend"],
] as const;
const intents = [
  ["request", "Request something"], ["follow_up", "Follow up"], ["approval", "Ask for approval"],
  ["status_update", "Give an update"], ["escalation", "Escalate a problem"],
  ["disagreement", "Disagree respectfully"], ["rejection", "Say no"], ["apology", "Apologize"],
  ["clarification", "Correct a misunderstanding"], ["extension_request", "Ask for more time"],
] as const;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("rephrase");
  const [text, setText] = useState("");
  const [tone, setTone] = useState("Professional");
  const [recipient, setRecipient] = useState("manager");
  const [intent, setIntent] = useState("request");
  const [relationship, setRelationship] = useState("regular");
  const [urgency, setUrgency] = useState("none");
  const [channel, setChannel] = useState("email");
  const [desiredResponse, setDesiredResponse] = useState("");
  const [lockedFacts, setLockedFacts] = useState("");
  const [languageMode, setLanguageMode] = useState(false);
  const [result, setResult] = useState("");
  const [variants, setVariants] = useState<OutcomeVersion[]>([]);
  const [variantId, setVariantId] = useState<OutcomeVersion["id"]>("balanced");
  const [replaceable, setReplaceable] = useState(false);
  const [credits, setCredits] = useState<CreditsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const activeVariant = useMemo(
    () => variants.find((variant) => variant.id === variantId) ?? variants[0],
    [variants, variantId],
  );
  const output = mode === "rephrase" ? result : activeVariant?.message ?? "";

  useEffect(() => {
    void (async () => {
      const storedToken = await getToken();
      setToken(storedToken);
      const pending = await browser.storage.local.get("prophrase_pending_text");
      if (typeof pending.prophrase_pending_text === "string" && pending.prophrase_pending_text) {
        setText(pending.prophrase_pending_text);
        await browser.storage.local.remove("prophrase_pending_text");
      } else {
        try {
          const selection = await readSelection();
          setText(selection.text);
          setReplaceable(selection.replaceable);
        } catch {
          // Restricted browser pages still allow typing or pasting into the popup.
        }
      }
      await (browser.action ?? browser.browserAction).setBadgeText({ text: "" });
    })();
  }, []);

  useEffect(() => {
    if (!token) return;
    void loadCredits(token).then(setCredits).catch(() => undefined);
  }, [token, result, variants]);

  async function signIn() {
    setLoading(true);
    setError("");
    try {
      setToken(await connect());
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  async function disconnect() {
    if (token) await revokeToken(token).catch(() => undefined);
    await clearToken();
    setToken(null);
    setCredits(null);
    setResult("");
    setVariants([]);
  }

  async function submit() {
    if (!token || text.trim().length < 3) return;
    setLoading(true);
    setError("");
    try {
      if (mode === "rephrase") {
        const response = await rephrase(token, text.trim(), tone);
        setResult(response.result);
        setVariants([]);
      } else {
        const response = await prepareOutcome(token, {
          originalText: text.trim(), recipient, intent,
          relationshipLevel: relationship, urgency, channel,
          desiredResponse: desiredResponse.trim() || undefined,
          lockedFacts: lockedFacts.split("\n").map((fact) => fact.trim()).filter(Boolean),
          languageMode: languageMode ? "indian_workplace" : "standard",
        });
        setVariants(response.variants);
        setVariantId("balanced");
        setResult("");
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  async function copyOutput() {
    if (!output) return;
    await navigator.clipboard.writeText(output);
  }

  async function replaceOutput() {
    if (!output) return;
    setError("");
    try {
      await replaceSelection(output);
      window.close();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  if (!token) {
    return (
      <main className="shell signed-out">
        <div className="brand-mark">P</div>
        <h1>Your communication workspace, right in the page</h1>
        <p>Rewrite selected text or use Outcome Assistant to prepare the right message without breaking your flow.</p>
        <ul className="feature-list">
          <li><strong>13 styles</strong><span>Email, Slack, Teams, Jira, clients, and more</span></li>
          <li><strong>Outcome Assistant</strong><span>Safer, balanced, and firmer versions</span></li>
          <li><strong>Works everywhere</strong><span>Copy or replace text directly on supported pages</span></li>
        </ul>
        {error && <div className="error">{error}</div>}
        <button className="primary wide" onClick={signIn} disabled={loading}>
          {loading ? "Opening sign-in..." : "Connect ProPhrase"}
        </button>
        <small>Connect the same account used on web, desktop, and mobile. Access remains limited to text you choose and pages where you open the extension.</small>
      </main>
    );
  }

  return (
    <main className="shell">
      <header>
        <div className="brand"><span className="brand-mark small">P</span><strong>ProPhrase</strong></div>
        <button className="quiet" onClick={disconnect}>Disconnect</button>
      </header>

      <nav className="mode-switch" aria-label="Writing mode">
        <button className={mode === "rephrase" ? "active" : ""} onClick={() => setMode("rephrase")}>Rephrase</button>
        <button className={mode === "outcome" ? "active" : ""} onClick={() => setMode("outcome")}>Outcome Assistant</button>
      </nav>

      <section className="composer">
        <label htmlFor="message">Your message</label>
        <textarea id="message" maxLength={5000} value={text} onChange={(event) => setText(event.target.value)}
          placeholder="Select text on the page, or type it here..." />
        <div className="count">{text.length}/5000</div>
      </section>

      {mode === "rephrase" ? (
        <section className="options">
          <span className="section-label">Style</span>
          <div className="chips">
            {tones.map((value) => <button key={value} className={tone === value ? "selected" : ""} onClick={() => setTone(value)}>{value}</button>)}
          </div>
        </section>
      ) : (
        <section className="outcome-grid">
          <label>Recipient<select value={recipient} onChange={(event) => setRecipient(event.target.value)}>
            {recipients.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label>
          <label>Outcome<select value={intent} onChange={(event) => setIntent(event.target.value)}>
            {intents.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label>
          <label>Relationship<select value={relationship} onChange={(event) => setRelationship(event.target.value)}>
            <option value="new">New</option><option value="formal">Formal</option><option value="regular">Regular</option>
            <option value="comfortable">Comfortable</option><option value="difficult">Difficult</option>
          </select></label>
          <label>Urgency<select value={urgency} onChange={(event) => setUrgency(event.target.value)}>
            <option value="none">No urgency</option><option value="today">Today</option><option value="few_days">Within a few days</option>
            <option value="urgent">Urgent</option><option value="critical">Critical</option>
          </select></label>
          <label>Channel<select value={channel} onChange={(event) => setChannel(event.target.value)}>
            <option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="slack_teams">Slack or Teams</option>
            <option value="sms">SMS</option><option value="linkedin">LinkedIn</option><option value="other">Other</option>
          </select></label>
          <label>Response wanted<input value={desiredResponse} onChange={(event) => setDesiredResponse(event.target.value)} placeholder="e.g. Approve the request" /></label>
          <label className="full">Details that must not change<textarea className="compact" value={lockedFacts} onChange={(event) => setLockedFacts(event.target.value)} placeholder="One name, date or amount per line" /></label>
          <label className="check full"><input type="checkbox" checked={languageMode} onChange={(event) => setLanguageMode(event.target.checked)} /> Natural Indian workplace English</label>
        </section>
      )}

      {error && <div className="error">{error}</div>}
      <button className="primary wide" onClick={submit} disabled={loading || text.trim().length < 3}>
        {loading ? "Preparing..." : mode === "rephrase" ? "Rephrase message" : "Prepare my message"}
      </button>

      {output && (
        <section className="result">
          {mode === "outcome" && <div className="variant-tabs">
            {variants.map((variant) => <button key={variant.id} className={variant.id === activeVariant?.id ? "selected" : ""} onClick={() => setVariantId(variant.id)}>{variant.label || variant.id}</button>)}
          </div>}
          <span className="section-label">Result</span>
          <div className="result-text">{output}</div>
          <div className="result-actions">
            <button onClick={copyOutput}>Copy</button>
            {replaceable && <button className="primary" onClick={replaceOutput}>Replace selection</button>}
          </div>
        </section>
      )}

      <footer>
        <span>{credits?.enabled && credits.balance ? `${credits.balance.available} credits available` : "Connected securely"}</span>
        <a href="https://prophrase.in/workspace" target="_blank" rel="noreferrer">Open workspace</a>
      </footer>
    </main>
  );
}
