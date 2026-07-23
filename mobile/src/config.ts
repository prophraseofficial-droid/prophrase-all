const PRODUCTION_APP_URL = "https://prophrase.in";
const DEVELOPMENT_APP_URL = "http://localhost:3000";
const PRODUCTION_SUPABASE_URL = "https://einsripvtpylhyhxyfsk.supabase.co";
const MOBILE_AUTH_REDIRECT_URL = "prophrase://auth/callback";

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
  if (production) return PRODUCTION_APP_URL;

  const cleanedUrl = value ? cleanUrl(value) : "";

  if (cleanedUrl) {
    try {
      const parsed = new URL(cleanedUrl);
      const isProPhraseProduction =
        parsed.protocol === "https:" &&
        parsed.hostname === "prophrase.in" &&
        parsed.pathname === "/" &&
        !parsed.username &&
        !parsed.password &&
        !parsed.search &&
        !parsed.hash;
      const isLocalDevelopment =
        (parsed.protocol === "http:" || parsed.protocol === "https:") &&
        isDevelopmentHost(parsed.hostname) &&
        !parsed.username &&
        !parsed.password;
      if (
        isProPhraseProduction ||
        isLocalDevelopment
      ) {
        return cleanedUrl;
      }
    } catch {
      // Fall back to the environment default below.
    }
  }

  return DEVELOPMENT_APP_URL;
}

export function resolveSupabaseUrl(
  value: string | undefined,
  production = isProductionAppEnv(),
) {
  if (production) return PRODUCTION_SUPABASE_URL;

  const cleanedUrl = value ? cleanUrl(value) : "";

  if (!cleanedUrl) return "";

  try {
    const parsed = new URL(cleanedUrl);
    const isSupabaseCloud =
      parsed.protocol === "https:" &&
      parsed.hostname === new URL(PRODUCTION_SUPABASE_URL).hostname &&
      parsed.pathname === "/" &&
      !parsed.username &&
      !parsed.password &&
      !parsed.search &&
      !parsed.hash;
    const isLocalDevelopment =
      parsed.protocol === "http:" && isDevelopmentHost(parsed.hostname);

    if (isSupabaseCloud || isLocalDevelopment) return cleanedUrl;
  } catch {
    // Return an empty value so local configuration fails closed.
  }

  return "";
}

export function resolveRazorpayCheckoutEnabled(value: string | undefined) {
  return value === "true";
}

export const appConfig = {
  appEnv: process.env.EXPO_PUBLIC_APP_ENV ?? "development",
  apiBaseUrl: resolvePublicUrl(process.env.EXPO_PUBLIC_API_BASE_URL),
  authRedirectUrl: MOBILE_AUTH_REDIRECT_URL,
  razorpayCheckoutEnabled: resolveRazorpayCheckoutEnabled(
    process.env.EXPO_PUBLIC_RAZORPAY_CHECKOUT_ENABLED,
  ),
  googleAndroidClientId:
    process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID?.trim() ?? "",
  googleIosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim() ?? "",
  googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() ?? "",
  webBaseUrl: resolvePublicUrl(
    process.env.EXPO_PUBLIC_WEB_BASE_URL ?? process.env.EXPO_PUBLIC_API_BASE_URL,
  ),
  privacyPolicyUrl: "https://prophrase.in/legal#privacy",
  termsUrl: "https://prophrase.in/legal#terms",
  privacyEmail: "privacy@prophrase.in",
  supportEmail: "prophraseofficial@gmail.com",
};
