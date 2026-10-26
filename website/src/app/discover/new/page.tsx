import type { Metadata } from "next";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { DiscoverCreateForm } from "@/components/discover/DiscoverCreateForm";

export const metadata: Metadata = {
  title: "Share a project | PEOPLE",
  robots: { index: false, follow: true },
};

export default function DiscoverNewPage() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <Navbar />
      <main id="main" className="warm-page flex-1">
        <DiscoverCreateForm />
      </main>
      <Footer />
    </div>
  );
}
