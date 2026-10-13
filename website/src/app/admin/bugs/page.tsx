import { notFound } from "next/navigation";
import { isDiscoverAdmin } from "@/lib/discover/admin";
import { BugReportsAdminPanel } from "@/components/admin/BugReportsAdminPanel";

export const dynamic = "force-dynamic";

export default async function AdminBugsPage() {
  if (!(await isDiscoverAdmin())) {
    notFound();
  }
  return <BugReportsAdminPanel />;
}
