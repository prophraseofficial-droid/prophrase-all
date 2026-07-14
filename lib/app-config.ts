const PRODUCTION_APP_URL = "https://prophrase.in";
const DEVELOPMENT_APP_URL = "http://localhost:3000";
export const AUTH_NEXT_COOKIE = "prophrase_auth_next";

function cleanUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function isLocalUrl(value: string) {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(value);
}

export function getSafeAuthOrigin(value?: string | null) {
  if (!value) return null;

  try {
    const origin = cleanUrl(new URL(value).origin);
    const configuredUrl = process.env.NEXT_PUBLIC_APP_URL;
    const configuredOrigin = configuredUrl
      ? cleanUrl(new URL(configuredUrl).origin)
      : "";

    if (
      isLocalUrl(origin) ||
      origin === PRODUCTION_APP_URL ||
      (configuredOrigin && origin === configuredOrigin)
    ) {
      return origin;
    }
  } catch {
    return null;
  }

  return null;
}

export function isProductionAppEnv() {
  const appEnv =
    process.env.NEXT_PUBLIC_APP_ENV ||
    process.env.APP_ENV ||
    process.env.VERCEL_ENV;

  return appEnv === "production" || process.env.NODE_ENV === "production";
}

export function getPublicAppUrl(fallbackOrigin?: string) {
  const cleanedFallback = fallbackOrigin ? cleanUrl(fallbackOrigin) : "";
  if (cleanedFallback && isLocalUrl(cleanedFallback)) {
    return cleanedFallback;
  }

  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL;
  const cleanedUrl = configuredUrl ? cleanUrl(configuredUrl) : "";

  if (cleanedUrl && !(isProductionAppEnv() && isLocalUrl(cleanedUrl))) {
    return cleanedUrl;
  }

  if (isProductionAppEnv()) {
    return PRODUCTION_APP_URL;
  }

  return cleanedFallback || DEVELOPMENT_APP_URL;
}

export function getAuthCallbackUrl(fallbackOrigin: string) {
  const appUrl = getPublicAppUrl(fallbackOrigin);
  return new URL("/api/auth/callback", `${appUrl}/`).toString();
}

export function storeAuthRedirectContext(nextPath: string) {
  if (typeof document === "undefined") return;
  const safeNext =
    nextPath.startsWith("/") && !nextPath.startsWith("//")
      ? nextPath
      : "/workspace";
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${AUTH_NEXT_COOKIE}=${encodeURIComponent(safeNext)}; Path=/; Max-Age=600; SameSite=Lax${secure}`;
}
