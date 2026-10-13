import type { Metadata } from "next";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Documentation } from "@/components/docs/Documentation";

export const metadata: Metadata = {
  title: "Documentation | People's Blockchain",
  description: "A practical guide: wallets, test PPL, participation, fees and running a People's Blockchain node.",
  alternates: { canonical: "/docs" },
};
export default function DocsPage() {
  return <div className="flex min-h-screen flex-col bg-canvas text-ink"><Navbar /><main id="main" className="warm-page flex-1"><Documentation /></main><Footer /></div>;
}
