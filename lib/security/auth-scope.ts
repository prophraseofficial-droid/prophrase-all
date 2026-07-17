export function isExtensionTokenRouteAllowed(request?: Request) {
  if (!request) return false;
  try {
    const { pathname } = new URL(request.url);
    return (
      pathname === "/api/v1/rephrase" ||
      pathname === "/api/v1/outcome-assistant" ||
      pathname === "/api/v1/credits" ||
      pathname === "/api/extension/token" ||
      pathname === "/api/universal-clipboard" ||
      pathname === "/api/universal-clipboard/devices" ||
      /^\/api\/universal-clipboard\/[0-9a-f-]+\/claim$/i.test(pathname)
    );
  } catch {
    return false;
  }
}
