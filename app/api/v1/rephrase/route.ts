import { POST as rephrase } from "@/app/api/rewrite/route";
import {
  publicApiOptions,
  requirePublicApiBearer,
  withPublicApiCors,
} from "@/lib/public-api/http";

export async function POST(request: Request) {
  const authError = requirePublicApiBearer(request);
  if (authError) return authError;
  return withPublicApiCors(await rephrase(request));
}

export const OPTIONS = publicApiOptions;
