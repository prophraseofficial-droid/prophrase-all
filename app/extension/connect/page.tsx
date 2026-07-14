import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ConnectExtensionClient } from "@/components/extension/ConnectExtensionClient";
import { getSafeExtensionRedirect } from "@/lib/extension/connect";
import { getCurrentUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Connect ProPhrase Extension" };

export default async function ConnectExtensionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const redirectUri = getSafeExtensionRedirect(
    typeof params.redirect_uri === "string" ? params.redirect_uri : null,
  );
  const state = typeof params.state === "string" ? params.state.slice(0, 160) : "";
  const browserName = typeof params.browser === "string" && ["Chrome", "Edge", "Firefox"].includes(params.browser)
    ? params.browser
    : "browser";

  if (!redirectUri || !state) {
    return <main className="flex min-h-screen items-center justify-center bg-[#fbfbfb] px-5"><div className="max-w-md rounded-2xl border border-border-subtle bg-white p-8"><h1 className="text-2xl font-bold">Invalid connection request</h1><p className="mt-3 text-sm leading-6 text-text-muted">Open this page from the official ProPhrase browser extension.</p></div></main>;
  }

  const user = await getCurrentUser();
  if (!user) {
    const next = `/extension/connect?${new URLSearchParams({ redirect_uri: redirectUri, state, browser: browserName })}`;
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  return <main className="flex min-h-screen items-center justify-center bg-[#fbfbfb] px-5"><ConnectExtensionClient browserName={browserName} redirectUri={redirectUri} state={state} /></main>;
}
