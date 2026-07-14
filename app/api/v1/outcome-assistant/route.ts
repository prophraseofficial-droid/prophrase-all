import { POST as prepareOutcome } from "@/app/api/outcome-assistant/route";
import {
  publicApiOptions,
  requirePublicApiBearer,
  withPublicApiCors,
} from "@/lib/public-api/http";

export async function POST(request: Request) {
  const authError = requirePublicApiBearer(request);
  if (authError) return authError;
  return withPublicApiCors(await prepareOutcome(request));
}

export const OPTIONS = publicApiOptions;
