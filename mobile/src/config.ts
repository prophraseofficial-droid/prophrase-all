const PRODUCTION_APP_URL = "https://prophrase.in";
const DEVELOPMENT_APP_URL = "http://localhost:3000";

function cleanUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function isDevelopmentHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host === "::1" || host.endsWith(".local")) return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true;
  if (/^169\.254\./.test(host)) return true;

  const private172 = host.match(/^172\.(\d{1,3})\./);
  if (private172) {
    const secondOctet = Number(private172[1]);
    if (secondOctet >= 16 && secondOctet <= 31) return true;
  }

  return /^(?:fc|fd|fe8|fe9|fea|feb)/i.test(host);
}

function isProductionAppEnv() {
  return (
    process.env.EXPO_PUBLIC_APP_ENV === "production" ||
    process.env.NODE_ENV === "production"
  );
}

export function resolvePublicUrl(
  value: string | undefined,
  production = isProductionAppEnv(),
) {
  const cleanedUrl = value ? cleanUrl(value) : "";

  if (cleanedUrl) {
    try {
      const parsed = new URL(cleanedUrl);
      if (
        parsed.protocol === "https:" ||
        (!production && parsed.protocol === "http:" && isDevelopmentHost(parsed.hostname))
      ) {
        return cleanedUrl;
      }
    } catch {
      // Fall back to the environment default below.
    }
  }

  return production ? PRODUCTION_APP_URL : DEVELOPMENT_APP_URL;
}

export const appConfig = {
  appEnv: process.env.EXPO_PUBLIC_APP_ENV ?? "development",
  apiBaseUrl: resolvePublicUrl(process.env.EXPO_PUBLIC_API_BASE_URL),
  authRedirectUrl: process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL?.trim() ?? "",
  googleAndroidClientId:
    process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID?.trim() ?? "",
  googleIosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim() ?? "",
  googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() ?? "",
  webBaseUrl: resolvePublicUrl(
    process.env.EXPO_PUBLIC_WEB_BASE_URL ?? process.env.EXPO_PUBLIC_API_BASE_URL,
  ),
};
