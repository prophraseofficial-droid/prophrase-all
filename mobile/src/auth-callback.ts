export type AuthCallback = {
  code: string;
};

function sameCallbackRoute(actual: URL, expected: URL) {
  return (
    actual.protocol === expected.protocol &&
    actual.hostname === expected.hostname &&
    actual.port === expected.port &&
    actual.pathname === expected.pathname
  );
}

export function parseAuthCallback(
  rawUrl: string,
  expectedUrl: string,
): AuthCallback | null {
  let actual: URL;
  let expected: URL;

  try {
    actual = new URL(rawUrl);
    expected = new URL(expectedUrl);
  } catch {
    return null;
  }

  if (!sameCallbackRoute(actual, expected)) return null;

  const authError =
    actual.searchParams.get("error_description") ??
    actual.searchParams.get("error");
  if (authError) throw new Error(authError);

  if (actual.hash) {
    throw new Error("Token-bearing authentication callbacks are not accepted.");
  }

  const code = actual.searchParams.get("code");
  if (!code) throw new Error("Authentication code is missing.");

  return { code };
}
