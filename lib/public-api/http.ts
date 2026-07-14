import { apiError } from "@/lib/security/validation";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Idempotency-Key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

export function requirePublicApiBearer(request: Request) {
  if (/^Bearer\s+\S+$/i.test(request.headers.get("authorization") ?? "")) {
    return null;
  }
  return withPublicApiCors(
    apiError("UNAUTHORIZED", "Provide a ProPhrase or Supabase access token as a Bearer token.", 401),
  );
}

export function withPublicApiCors(response: Response) {
  const headers = new Headers(response.headers);
  Object.entries(corsHeaders).forEach(([name, value]) => headers.set(name, value));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function publicApiOptions() {
  return new Response(null, { status: 204, headers: corsHeaders });
}
