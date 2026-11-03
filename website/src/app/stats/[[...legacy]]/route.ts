import { ANALYTICS_VIEWER_HTTP_HEADERS, analyticsViewerBlockedStatus } from "@/lib/analytics/view-path";

export const dynamic = "force-dynamic";

function notFoundPlain(): Response {
  const headers = new Headers();
  for (const header of ANALYTICS_VIEWER_HTTP_HEADERS) {
    headers.set(header.key, header.value);
  }
  return new Response("Not Found", { status: 404, headers });
}

export function GET(request: Request) {
  const pathname = new URL(request.url).pathname;
  if (analyticsViewerBlockedStatus(pathname) === 404) {
    return notFoundPlain();
  }
  return notFoundPlain();
}

export function HEAD(request: Request) {
  return GET(request);
}

export function POST(request: Request) {
  return GET(request);
}
