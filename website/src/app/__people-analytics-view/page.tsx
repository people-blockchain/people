import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AnalyticsAdminPanel } from "@/components/admin/AnalyticsAdminPanel";
import { hasAnalyticsViewerAccess } from "@/lib/analytics/request-auth";
import { readAnalyticsViewPathSegment } from "@/lib/analytics/view-path";
import { isDiscoverAdmin } from "@/lib/discover/admin";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Analytics",
  robots: { index: false, follow: false },
};

export default async function SecretAnalyticsViewerPage() {
  if (!readAnalyticsViewPathSegment()) {
    notFound();
  }
  const admin = await isDiscoverAdmin();
  if (!admin && !(await hasAnalyticsViewerAccess())) {
    notFound();
  }
  return <AnalyticsAdminPanel readOnly={!admin} />;
}
