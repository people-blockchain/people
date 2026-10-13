import type { Metadata } from "next";
import { Navbar } from "@/components/Navbar";
import { HiwWarm } from "@/components/how-it-works/HiwWarm";
import { Footer } from "@/components/Footer";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "How It Works | People's Blockchain",
  description:
    "How People's Blockchain works: people use the network, usage creates fees, and part of every fee flows back to the community.",
  alternates: { canonical: "/how-it-works" },
  openGraph: {
    title: "How People's Blockchain Works",
    description:
      "People use the network. Usage creates fees. Part of every fee flows back to the community.",
    type: "website",
    siteName: SITE_NAME,
    url: "/how-it-works",
    images: [
      {
        url: "/opengraph-image.jpg",
        width: 1200,
        height: 630,
        alt: "People's Blockchain — the PEOPLE mark and wordmark on a dark navy gradient card. Created by people. For the community.",
      },
    ],
  },
};

export default function HowItWorksPage() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <Navbar />
      <main id="main" className="warm-page flex-1">
        <HiwWarm />
      </main>
      <Footer />
    </div>
  );
}
