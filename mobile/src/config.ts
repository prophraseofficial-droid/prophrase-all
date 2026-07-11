const PRODUCTION_APP_URL = "https://prophrase.in";
const DEVELOPMENT_APP_URL = "http://localhost:3000";

function cleanUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function isLocalUrl(value: string) {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(value);
}

function isProductionAppEnv() {
  return (
    process.env.EXPO_PUBLIC_APP_ENV === "production" ||
    process.env.NODE_ENV === "production"
  );
}

function resolvePublicUrl(value: string | undefined) {
  const cleanedUrl = value ? cleanUrl(value) : "";

  if (cleanedUrl && !(isProductionAppEnv() && isLocalUrl(cleanedUrl))) {
    return cleanedUrl;
  }

  return isProductionAppEnv() ? PRODUCTION_APP_URL : DEVELOPMENT_APP_URL;
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
