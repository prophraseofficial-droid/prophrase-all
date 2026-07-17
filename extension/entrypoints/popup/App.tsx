import { useEffect, useState } from "react";
import { browser } from "wxt/browser";
import { browserName, clearToken, connect, getToken } from "../../lib/auth";
import {
  APP_URL,
  claimUniversalCopy,
  createUniversalCopy,
  isAuthenticationError,
  loadCredits,
  loadUniversalCopy,
  rephrase,
  revokeToken,
} from "../../lib/api";
import { getDeviceId } from "../../lib/device";
import { readSelection, replaceSelection } from "../../lib/page";
import type { CreditsResponse, Mode, UniversalClipboardItem } from "../../lib/types";

const tones = [
  "Professional", "Polite", "Shorter", "Short & Crisp", "Human", "Email",
  "Slack", "Teams", "Jira Comment", "WhatsApp", "Client-safe",
  "Manager-friendly", "Firmer",
];

const reconnectMessage = "Your previous ProPhrase connection expired. Reconnect to continue.";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function formatExpiry(expiresAt: string) {
  const seconds = Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000));
  if (seconds < 60) return `${seconds}s remaining`;
  return `${Math.ceil(seconds / 60)} min remaining`;
}

export default function App() {
  const [initializing, setInitializing] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState("");
  const [mode, setMode] = useState<Mode>("rephrase");
  const [text, setText] = useState("");
  const [tone, setTone] = useState("Professional");
  const [result, setResult] = useState("");
  const [replaceable, setReplaceable] = useState(false);
  const [credits, setCredits] = useState<CreditsResponse | null>(null);
  const [universalItem, setUniversalItem] = useState<UniversalClipboardItem | null>(null);
  const [loadingAction, setLoadingAction] = useState<"connect" | "rephrase" | "share" | "claim" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const loading = loadingAction !== null;
  const deviceLabel = `${browserName()} extension`;
  const universalClaimable = Boolean(
    universalItem
      && universalItem.status === "available"
      && !universalItem.isExpired
      && universalItem.sourceDeviceId !== deviceId,
  );

  useEffect(() => {
    void (async () => {
      const [storedToken, storedDeviceId] = await Promise.all([getToken(), getDeviceId()]);
      setDeviceId(storedDeviceId);
      if (storedToken) {
        try {
          setCredits(await loadCredits(storedToken));
          setToken(storedToken);
        } catch (caught) {
          if (isAuthenticationError(caught)) {
            await clearToken(storedToken);
            setError(reconnectMessage);
          } else {
            setToken(storedToken);
            setError(errorMessage(caught));
          }
        }
      }
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
      setInitializing(false);
    })();
  }, []);

  useEffect(() => {
    if (!token) return;
    void loadCredits(token).then(setCredits).catch(async (caught) => {
      if (isAuthenticationError(caught) && await clearToken(token)) {
        setToken(null);
        setCredits(null);
        setResult("");
        setUniversalItem(null);
        setNotice("");
        setError(reconnectMessage);
      }
    });
  }, [token, result]);

  useEffect(() => {
    if (!token || !deviceId || mode !== "universal") return;
    setError("");
    void loadUniversalCopy(token, deviceId)
      .then((response) => setUniversalItem(response.item))
      .catch((caught) => void handleRequestFailure(caught, token));
  }, [token, deviceId, mode]);

  async function handleRequestFailure(caught: unknown, requestToken: string | null = token) {
    if (requestToken && isAuthenticationError(caught) && await clearToken(requestToken)) {
      setToken(null);
      setCredits(null);
      setResult("");
      setUniversalItem(null);
      setNotice("");
      setError(reconnectMessage);
      return;
    }
    setError(errorMessage(caught));
  }

  function selectMode(nextMode: Mode) {
    setMode(nextMode);
    setError("");
    setNotice("");
  }

  async function signIn() {
    setLoadingAction("connect");
    setError("");
    try {
      setToken(await connect());
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoadingAction(null);
    }
  }

  async function disconnect() {
    if (token) await revokeToken(token).catch(() => undefined);
    await clearToken();
    setToken(null);
    setCredits(null);
    setResult("");
    setUniversalItem(null);
    setNotice("");
  }

  async function submitRephrase() {
    if (!token || text.trim().length < 3) return;
    setLoadingAction("rephrase");
    setError("");
    setNotice("");
    try {
      const response = await rephrase(token, text.trim(), tone);
      setResult(response.result);
    } catch (caught) {
      await handleRequestFailure(caught, token);
    } finally {
      setLoadingAction(null);
    }
  }

  async function publishUniversalCopy() {
    if (!token || !deviceId || !text.trim()) return;
    setLoadingAction("share");
    setError("");
    setNotice("");
    try {
      const response = await createUniversalCopy(token, {
        deviceId,
        deviceLabel,
        text: text.trim(),
      });
      setUniversalItem(response.item);
      setNotice("Ready on your other devices for 10 minutes.");
    } catch (caught) {
      await handleRequestFailure(caught, token);
    } finally {
      setLoadingAction(null);
    }
  }

  async function refreshUniversalCopy() {
    if (!token || !deviceId) return;
    setError("");
    try {
      const response = await loadUniversalCopy(token, deviceId);
      setUniversalItem(response.item);
    } catch (caught) {
      await handleRequestFailure(caught, token);
    }
  }

  async function claimUniversalCopyItem() {
    if (!token || !deviceId || !universalItem || !universalClaimable) return;
    setLoadingAction("claim");
    setError("");
    setNotice("");
    try {
      const response = await claimUniversalCopy(token, universalItem.id, {
        deviceId,
        deviceLabel,
      });
      await navigator.clipboard.writeText(response.text);
      setText(response.text);
      setUniversalItem(response.item);
      setNotice("Copied to this device. Paste it wherever you need it.");
    } catch (caught) {
      await handleRequestFailure(caught, token);
    } finally {
      setLoadingAction(null);
    }
  }

  async function copyOutput() {
    if (!result) return;
    await navigator.clipboard.writeText(result);
    setNotice("Copied to clipboard.");
  }

  async function replaceOutput() {
    if (!result) return;
    setError("");
    try {
      await replaceSelection(result);
      window.close();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  if (initializing) {
    return (
      <main className="shell signed-out">
        <img className="brand-logo signed-out-logo" src="/icons/icon-96.png" alt="ProPhrase" />
        <div className="eyebrow">Checking connection...</div>
      </main>
    );
  }

  if (!token) {
    return (
      <main className="shell signed-out">
        <img className="brand-logo signed-out-logo" src="/icons/icon-96.png" alt="ProPhrase" />
        <div className="eyebrow">Write with confidence, anywhere</div>
        <h1>A lighter writing assistant, right in the page</h1>
        <p>Rephrase selected text and move copied content across your devices without breaking your flow.</p>
        <ul className="feature-list">
          <li><strong>Rephrase</strong><span>Select text on a page and open the ProPhrase wand for a quick rewrite</span></li>
          <li><strong>Universal Copy</strong><span>Continue copied text securely on your other ProPhrase devices</span></li>
        </ul>
        {error && <div className="error" role="alert">{error}</div>}
        <button className="primary wide" onClick={signIn} disabled={loading}>
          {loadingAction === "connect" ? "Opening sign-in..." : "Connect ProPhrase"}
        </button>
        <small>Uses the same ProPhrase account as web, desktop, and mobile. The extension only reads text you select.</small>
      </main>
    );
  }

  return (
    <main className="shell">
      <header>
        <div className="brand">
          <img className="brand-logo" src="/icons/icon-48.png" alt="" />
          <div className="brand-copy">
            <strong>ProPhrase</strong>
            <span className="connection-status"><i aria-hidden="true" />Connected</span>
          </div>
        </div>
        <button className="quiet" onClick={disconnect}>Sign out</button>
      </header>

      <nav className="mode-switch" aria-label="Writing mode">
        <button className={mode === "rephrase" ? "active" : ""} onClick={() => selectMode("rephrase")}>Rephrase</button>
        <button className={mode === "universal" ? "active" : ""} onClick={() => selectMode("universal")}>Universal Copy</button>
      </nav>

      <section className="composer">
        <div className="section-heading">
          <label htmlFor="message">{mode === "universal" ? "Copy across devices" : "Your message"}</label>
          {mode === "universal" && <span>Secure for 10 minutes</span>}
        </div>
        {mode === "universal" && <p className="section-help">Paste or select text here, then make it available to your other signed-in ProPhrase devices.</p>}
        <textarea
          id="message"
          maxLength={mode === "universal" ? 4000 : 5000}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={mode === "universal" ? "Paste something to continue on another device..." : "Select text on the page, or type it here..."}
        />
        <div className="count">{text.length}/{mode === "universal" ? 4000 : 5000}</div>
      </section>

      {mode === "rephrase" && (
        <section className="options">
          <span className="section-label">Choose a style</span>
          <div className="chips">
            {tones.map((value) => <button key={value} className={tone === value ? "selected" : ""} onClick={() => setTone(value)}>{value}</button>)}
          </div>
        </section>
      )}

      {mode === "universal" && (
        <section className="universal-card">
          <div className="universal-title">
            <span className="section-label">Latest universal copy</span>
            <div className="universal-title-actions">
              {universalItem && (
                <span className={`status-pill ${universalItem.isExpired ? "expired" : universalItem.status}`}>
                  {universalItem.isExpired ? "expired" : universalItem.status}
                </span>
              )}
              <button className="mini-action" onClick={refreshUniversalCopy}>Refresh</button>
            </div>
          </div>
          {universalItem ? (
            <>
              <div className="universal-preview">{universalItem.preview}</div>
              <div className="universal-meta">
                <span>From {universalItem.sourceDeviceLabel}</span>
                {!universalItem.isExpired && universalItem.status === "available" && <span>{formatExpiry(universalItem.expiresAt)}</span>}
              </div>
              {universalClaimable && (
                <button className="secondary wide" onClick={claimUniversalCopyItem} disabled={loading}>
                  {loadingAction === "claim" ? "Copying..." : "Copy to this device"}
                </button>
              )}
              {!universalClaimable && universalItem.status === "available" && !universalItem.isExpired && (
                <div className="inline-state"><i aria-hidden="true" />Ready on your other devices</div>
              )}
            </>
          ) : (
            <div className="empty-state">
              <span className="empty-icon" aria-hidden="true">↗</span>
              <strong>No universal copy yet</strong>
              <span>Share the text above, or open another ProPhrase device to send something here.</span>
            </div>
          )}
        </section>
      )}

      {error && <div className="error" role="alert">{error}</div>}
      {notice && <div className="notice" role="status">{notice}</div>}
      <button
        className="primary wide"
        onClick={mode === "universal" ? publishUniversalCopy : submitRephrase}
        disabled={loading || text.trim().length < (mode === "universal" ? 1 : 3)}
      >
        {loadingAction === "share"
          ? "Sharing..."
          : loadingAction === "rephrase" ? "Rephrasing..."
            : mode === "rephrase" ? "Rephrase message"
              : "Make available on other devices"}
      </button>

      {mode === "rephrase" && result && (
        <section className="result">
          <span className="section-label">Result</span>
          <div className="result-text">{result}</div>
          <div className="result-actions">
            <button onClick={copyOutput}>Copy</button>
            {replaceable && <button className="primary" onClick={replaceOutput}>Replace selection</button>}
          </div>
        </section>
      )}

      <footer>
        <span>{credits?.enabled && credits.balance ? `${credits.balance.available} credits available` : "Account connected"}</span>
        <a href={`${APP_URL}/workspace`} target="_blank" rel="noreferrer">Open workspace <span aria-hidden="true">↗</span></a>
      </footer>
    </main>
  );
}
