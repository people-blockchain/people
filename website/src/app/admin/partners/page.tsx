import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PartnersAdminPanel } from "@/components/admin/PartnersAdminPanel";
import { isDiscoverAdmin } from "@/lib/discover/admin";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Partners | Admin",
  robots: { index: false, follow: false },
};

export default async function AdminPartnersPage() {
  if (!(await isDiscoverAdmin())) {
    notFound();
  }
  return (
    <main className="min-h-screen bg-neutral-950">
      <PartnersAdminPanel />
    </main>
  );
}
