import type { Metadata } from "next";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { DiscoverFeed } from "@/components/discover/DiscoverFeed";
import { SITE_NAME } from "@/lib/site";
import { loadDiscoverFeedForPage } from "@/lib/discover/feed-server";

export const metadata: Metadata = {
  title: "Project feed | People",
  description: "Project cards from founders. Your reactions help ideas reach the next circle.",
  alternates: { canonical: "/discover" },
  openGraph: {
    title: "Project feed",
    description: "Project cards from founders building on the People's Blockchain testnet.",
    type: "website",
    siteName: SITE_NAME,
    url: "/discover",
  },
};

export default async function DiscoverPage() {
  const { projects, viewer } = await loadDiscoverFeedForPage();

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <Navbar />
      <main id="main" className="warm-page flex-1">
        <DiscoverFeed initialProjects={projects} initialViewer={viewer} />
      </main>
      <Footer />
    </div>
  );
}
