import type { Metadata } from "next";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { AgentsPublic } from "@/components/agents/AgentsPublic";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Community AI agents | PEOPLE Blockchain",
  description:
    "How community AI agents spend from shared wallets with limits, votes, and public records on PEOPLE Blockchain.",
  alternates: { canonical: "/agents" },
  openGraph: {
    title: "Community AI agents",
    description: "Shared wallets, clear limits, and on-chain transparency.",
    type: "website",
    siteName: SITE_NAME,
    url: "/agents",
  },
};

export default function AgentsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <Navbar />
      <main id="main" className="warm-page flex-1">
        <AgentsPublic />
      </main>
      <Footer />
    </div>
  );
}
