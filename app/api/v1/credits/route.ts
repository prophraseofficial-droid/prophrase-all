import { GET as getCredits } from "@/app/api/credits/balance/route";
import {
  publicApiOptions,
  requirePublicApiBearer,
  withPublicApiCors,
} from "@/lib/public-api/http";

export async function GET(request: Request) {
  const authError = requirePublicApiBearer(request);
  if (authError) return authError;
  return withPublicApiCors(await getCredits(request));
}

export const OPTIONS = publicApiOptions;
