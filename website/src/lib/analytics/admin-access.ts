import { isDiscoverAdmin } from "@/lib/discover/admin";
import { resolveAnalyticsViewer, type AnalyticsViewer } from "@/lib/analytics/request-auth";

export async function canViewAnalyticsDashboardRequest(req: Request): Promise<AnalyticsViewer> {
  return resolveAnalyticsViewer(req);
}

export async function isAnalyticsAdminViewer(): Promise<boolean> {
  return isDiscoverAdmin();
}
