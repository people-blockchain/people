import type { Metadata } from "next";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { DiscoverStatsPanel } from "@/components/discover/DiscoverStatsPanel";

export const metadata: Metadata = {
  title: "Feed metrics | PEOPLE",
  robots: { index: false, follow: false },
};

export default function DiscoverStatsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <Navbar />
      <main id="main" className="warm-page flex-1">
        <DiscoverStatsPanel />
      </main>
      <Footer />
    </div>
  );
}
