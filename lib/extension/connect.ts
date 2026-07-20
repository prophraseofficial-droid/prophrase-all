const allowedRedirectDomains = [".chromiumapp.org", ".extensions.allizom.org"];
const officialRedirectOrigins = [
  "https://pmfgmjobfpminpkenehibfhmahgbgpmn.chromiumapp.org",
];

function configuredRedirectOrigins() {
  const additionalOrigins = (process.env.EXTENSION_REDIRECT_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return [...new Set([...officialRedirectOrigins, ...additionalOrigins])];
}

export function getSafeExtensionRedirect(
  value?: string | null,
  allowedOrigins?: string[],
) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const effectiveAllowedOrigins = allowedOrigins ?? configuredRedirectOrigins();
    const validPath = url.pathname.replace(/\/$/, "") === "/connected";
    const exactOriginAllowed = effectiveAllowedOrigins.includes(url.origin);
    const developmentDomainAllowed =
      allowedOrigins === undefined &&
      !process.env.EXTENSION_REDIRECT_ORIGINS &&
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
