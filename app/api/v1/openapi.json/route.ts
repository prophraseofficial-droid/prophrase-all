import { NextResponse } from "next/server";
import { prophraseOpenApi } from "@/lib/public-api/openapi";
import { publicApiOptions, withPublicApiCors } from "@/lib/public-api/http";

export function GET() {
  return withPublicApiCors(NextResponse.json(prophraseOpenApi));
}

export const OPTIONS = publicApiOptions;
