import type { Metadata } from "next";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { HelpCenter } from "@/components/help/HelpCenter";

export const metadata: Metadata = {
  title: "Help | PEOPLE Blockchain",
  description: "Short answers to common questions about PPL, the wallet, staking, taking part and staying safe on PEOPLE Blockchain.",
  alternates: { canonical: "/help" },
};

export default function HelpPage() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <Navbar />
      <main id="main" className="warm-page flex-1">
        <HelpCenter />
      </main>
      <Footer />
    </div>
  );
}
