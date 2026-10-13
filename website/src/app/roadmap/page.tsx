import type { Metadata } from "next";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { RoadmapPublic } from "@/components/roadmap/RoadmapPublic";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Roadmap | People's Blockchain",
  description: "What is live, in progress, and planned on People's Blockchain.",
  alternates: { canonical: "/roadmap" },
  openGraph: {
    title: "Roadmap",
    description: "Product roadmap statuses for People's Blockchain.",
    type: "website",
    siteName: SITE_NAME,
    url: "/roadmap",
  },
};

export default function RoadmapPage() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <Navbar />
      <main id="main" className="warm-page flex-1">
        <RoadmapPublic />
      </main>
      <Footer />
    </div>
  );
}
