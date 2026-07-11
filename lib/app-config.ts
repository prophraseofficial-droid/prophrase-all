const PRODUCTION_APP_URL = "https://prophrase.in";
const DEVELOPMENT_APP_URL = "http://localhost:3000";

function cleanUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function isLocalUrl(value: string) {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(value);
}

export function isProductionAppEnv() {
  const appEnv =
    process.env.NEXT_PUBLIC_APP_ENV ||
    process.env.APP_ENV ||
    process.env.VERCEL_ENV;

  return appEnv === "production" || process.env.NODE_ENV === "production";
}

export function getPublicAppUrl(fallbackOrigin?: string) {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL;
  const cleanedUrl = configuredUrl ? cleanUrl(configuredUrl) : "";

  if (cleanedUrl && !(isProductionAppEnv() && isLocalUrl(cleanedUrl))) {
    return cleanedUrl;
  }

  if (isProductionAppEnv()) {
    return PRODUCTION_APP_URL;
  }

  return fallbackOrigin ? cleanUrl(fallbackOrigin) : DEVELOPMENT_APP_URL;
}
