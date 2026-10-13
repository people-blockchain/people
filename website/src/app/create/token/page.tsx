import type { Metadata } from "next";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { FactoryWizard } from "@/components/factory/FactoryWizard";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Create a token | People's Blockchain",
  description: "No-code Token Factory: image, name, ticker, supply, pay in PPL.",
  alternates: { canonical: "/create/token" },
  openGraph: {
    title: "Create a token",
    description: "Launch a standard user token with the Token Factory form.",
    type: "website",
    siteName: SITE_NAME,
    url: "/create/token",
  },
};

export default function CreateTokenPage() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <Navbar />
      <main id="main" className="warm-page flex-1">
        <FactoryWizard kind="token" />
      </main>
      <Footer />
    </div>
  );
}
