"use client";

import Link from "next/link";
import { partnerCopy } from "@/lib/partner/copy";
import { useLanguage } from "@/context/LanguageContext";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

export default function CheckEmailPage() {
  const { lang } = useLanguage();
  const t = partnerCopy[lang];
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <Navbar />
      <main id="main" className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="surface-elevated w-full max-w-md rounded-2xl p-6 sm:p-8">
          <h1 className="text-2xl font-bold text-ink">{t.checkEmailTitle}</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">{t.checkEmailLead}</p>
          <Link href="/login" className="mt-6 inline-flex text-sm font-semibold text-brand hover:underline">
            {t.backToLogin}
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
