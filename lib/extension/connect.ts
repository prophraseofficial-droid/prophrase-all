const allowedRedirectDomains = [".chromiumapp.org", ".extensions.allizom.org"];

function configuredRedirectOrigins() {
  return (process.env.EXTENSION_REDIRECT_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function getSafeExtensionRedirect(
  value?: string | null,
  allowedOrigins = configuredRedirectOrigins(),
) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const validPath = url.pathname.replace(/\/$/, "") === "/connected";
    const exactOriginAllowed = allowedOrigins.includes(url.origin);
    const developmentDomainAllowed =
      allowedOrigins.length === 0 &&
      process.env.NODE_ENV !== "production" &&
      allowedRedirectDomains.some((domain) => url.hostname.endsWith(domain));
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      !validPath ||
      (!exactOriginAllowed && !developmentDomainAllowed)
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}
