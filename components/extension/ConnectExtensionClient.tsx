"use client";

import Image from "next/image";
import { useState } from "react";

export function ConnectExtensionClient({
  redirectUri,
  state,
  browserName,
}: {
  redirectUri: string;
  state: string;
  browserName: string;
}) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function connect() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/extension/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `${browserName} extension` }),
      });
      const data = await response.json().catch(() => null) as
        | { token?: string; expiresAt?: string; message?: string }
        | null;
      if (!response.ok || !data?.token) {
        throw new Error(data?.message || "Unable to connect the extension.");
      }
      const destination = new URL(redirectUri);
      destination.hash = new URLSearchParams({ token: data.token, state }).toString();
      window.location.replace(destination.toString());
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to connect the extension.");
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md rounded-2xl border border-border-subtle bg-white p-8 shadow-lg">
      <Image
        alt="ProPhrase"
        className="h-12 w-12 object-contain"
        height={48}
        priority
        src="/prophrase-logo-transparent.png"
        width={48}
      />
      <h1 className="mt-6 text-2xl font-bold">Connect ProPhrase to {browserName}</h1>
      <p className="mt-3 text-sm leading-6 text-text-muted">
        Bring ProPhrase into the pages where you already work.
      </p>
      <ul className="mt-5 space-y-3 text-sm leading-6 text-text-muted">
        <li><strong className="text-text-primary">Rewrite selected text</strong> with 13 email, chat, project, tone, and audience styles.</li>
        <li><strong className="text-text-primary">Use Outcome Assistant</strong> for safer, balanced, and firmer messages.</li>
        <li><strong className="text-text-primary">Copy or replace the result</strong> without leaving supported pages.</li>
        <li><strong className="text-text-primary">Share one account</strong> with the web, desktop, and mobile apps.</li>
      </ul>
      <div className="mt-6 rounded-lg bg-surface-container-low p-4 text-sm leading-6 text-text-muted">
        <p className="font-semibold text-text-primary">Your privacy stays protected</p>
        <p className="mt-1">
          ProPhrase only receives permission to connect this extension to your account and process text you choose to rewrite. Your passwords, browsing history, billing details, and private service credentials remain inaccessible.
        </p>
      </div>
      {error ? <p aria-live="polite" className="mt-4 text-sm text-red-700">{error}</p> : null}
      <button className="mt-6 min-h-12 w-full rounded-full bg-black px-5 text-sm font-semibold text-white disabled:opacity-60" disabled={loading} onClick={() => void connect()} type="button">
        {loading ? "Connecting..." : "Continue and connect"}
      </button>
      <p className="mt-4 text-center text-xs text-text-muted">You can disconnect the extension anytime from ProPhrase settings.</p>
    </div>
  );
}
