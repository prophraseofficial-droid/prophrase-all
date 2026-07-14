import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createExtensionApiToken,
  revokeExtensionApiToken,
} from "@/lib/security/api-tokens";
import { requireTrustedMutation, requireUser } from "@/lib/security/auth";
import { apiError, getZodErrorMessage, validationError } from "@/lib/security/validation";

const extensionCorsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "DELETE, OPTIONS",
};

function withExtensionCors(response: Response) {
  const headers = new Headers(response.headers);
  Object.entries(extensionCorsHeaders).forEach(([name, value]) => headers.set(name, value));
  return new Response(response.body, { status: response.status, headers });
}

const tokenRequestSchema = z.object({
  name: z.string().trim().min(2).max(80).default("Browser extension"),
});

export async function POST(request: Request) {
  const untrusted = requireTrustedMutation(request);
  if (untrusted) return untrusted;
  const { user, response } = await requireUser();
  if (!user) return response;
  const parsed = tokenRequestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return validationError(getZodErrorMessage(parsed.error));
  try {
    const credential = await createExtensionApiToken(user.id, parsed.data.name);
    return NextResponse.json(credential, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return apiError("CONFIGURATION_ERROR", "Extension tokens are not configured. Apply the latest database migration.", 500);
  }
}

export async function DELETE(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  const { user, response } = await requireUser(request);
  if (!user) return withExtensionCors(response);
  await revokeExtensionApiToken(token);
  return new Response(null, { status: 204, headers: extensionCorsHeaders });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: extensionCorsHeaders });
}
