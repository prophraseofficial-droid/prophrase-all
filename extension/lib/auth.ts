import { browser } from "wxt/browser";
import { APP_URL } from "./api";

const TOKEN_KEY = "prophrase_api_token";

function browserName() {
  const agent = navigator.userAgent;
  if (agent.includes("Firefox/")) return "Firefox";
  if (agent.includes("Edg/")) return "Edge";
  return "Chrome";
}

export async function getToken() {
  const stored = await browser.storage.local.get(TOKEN_KEY);
  return typeof stored[TOKEN_KEY] === "string" ? stored[TOKEN_KEY] : null;
}

export async function connect() {
  const redirectUri = browser.identity.getRedirectURL("connected");
  const state = crypto.randomUUID();
  const url = new URL("/extension/connect", APP_URL);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("browser", browserName());

  const resultUrl = await browser.identity.launchWebAuthFlow({
    url: url.toString(),
    interactive: true,
  });
  if (!resultUrl) throw new Error("Sign-in was cancelled.");

  const result = new URL(resultUrl);
  const values = new URLSearchParams(result.hash.slice(1));
  if (values.get("state") !== state) throw new Error("The sign-in response could not be verified.");
  const token = values.get("token");
  if (!token?.startsWith("ppx_")) throw new Error(values.get("error") || "No access token was returned.");
  await browser.storage.local.set({ [TOKEN_KEY]: token });
  return token;
}

export async function clearToken() {
  await browser.storage.local.remove(TOKEN_KEY);
}
