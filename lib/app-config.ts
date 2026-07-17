const PRODUCTION_APP_URL = "https://prophrase.in";
const DEVELOPMENT_APP_URL = "http://localhost:3000";
export const AUTH_NEXT_COOKIE = "prophrase_auth_next";

/**
 * Accept only an application-local path. URL parsers treat backslashes as
 * slashes, so values such as `/\\evil.example` must be rejected as well as
 * protocol-relative URLs.
 */
export function getSafeInternalPath(
  value?: string | null,
  fallback = "/workspace",
) {
  if (!value) return fallback;

  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return fallback;
  }

  if (
    !decoded.startsWith("/") ||
    decoded.startsWith("//") ||
    decoded.includes("\\") ||
    /[\u0000-\u001F\u007F]/.test(decoded)
  ) {
    return fallback;
  }

  return decoded;
}

function cleanUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function isLocalUrl(value: string) {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(value);
}

function isAllowedAppUrl(value: string, production: boolean) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" ||
      (!production && url.protocol === "http:" && isLocalUrl(url.toString()))
    );
  } catch {
    return false;
  }
}

export function getSafeAuthOrigin(
  value?: string | null,
  production = isProductionAppEnv(),
) {
  if (!value) return null;

  try {
    const origin = cleanUrl(new URL(value).origin);
    const configuredUrl = process.env.NEXT_PUBLIC_APP_URL;
    const configuredOrigin = configuredUrl && isAllowedAppUrl(configuredUrl, production)
      ? cleanUrl(new URL(configuredUrl).origin)
      : "";

    if (
      (!production && isLocalUrl(origin)) ||
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

export function getPublicAppUrl(
  fallbackOrigin?: string,
  production = isProductionAppEnv(),
) {
  const cleanedFallback = fallbackOrigin ? cleanUrl(fallbackOrigin) : "";
  if (cleanedFallback && isAllowedAppUrl(cleanedFallback, production)) {
    return cleanedFallback;
  }

  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL;
  const cleanedUrl = configuredUrl ? cleanUrl(configuredUrl) : "";

  if (cleanedUrl && isAllowedAppUrl(cleanedUrl, production)) {
    return cleanedUrl;
  }

  if (production) {
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
  const safeNext = getSafeInternalPath(nextPath);
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${AUTH_NEXT_COOKIE}=${encodeURIComponent(safeNext)}; Path=/; Max-Age=600; SameSite=Lax${secure}`;
}
