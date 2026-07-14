import { NextResponse } from "next/server";
import { publicApiOptions, withPublicApiCors } from "@/lib/public-api/http";

export function GET(request: Request) {
  return withPublicApiCors(NextResponse.json({
    name: "ProPhrase API",
    version: "v1",
    documentation: `${new URL(request.url).origin}/developers/api`,
    openapi: `${new URL(request.url).origin}/api/v1/openapi.json`,
    endpoints: [
      "POST /api/v1/rephrase",
      "POST /api/v1/outcome-assistant",
      "GET /api/v1/credits",
    ],
  }));
}

export const OPTIONS = publicApiOptions;
