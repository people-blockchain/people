import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AnalyticsAdminPanel } from "@/components/admin/AnalyticsAdminPanel";
import { isDiscoverAdmin } from "@/lib/discover/admin";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Analytics | Admin",
  robots: { index: false, follow: false },
};

export default async function AdminAnalyticsPage() {
  if (!(await isDiscoverAdmin())) {
    notFound();
  }
  return <AnalyticsAdminPanel />;
}
