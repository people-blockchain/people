import { handleDescribeHelperRequest } from "@/lib/describe-helper-handler";

export const runtime = "nodejs";

/** Single allowlisted-type endpoint; per-type `/api/factory/<type>/describe` routes also exist. */
export async function POST(request: Request) {
  return handleDescribeHelperRequest(request);
}
