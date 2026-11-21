import { handleDescribeHelperRequest } from "@/lib/describe-helper-handler";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleDescribeHelperRequest(request, "lavka");
}
