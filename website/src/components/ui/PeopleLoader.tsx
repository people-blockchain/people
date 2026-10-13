"use client";
import Image from "next/image";
import { useLanguage } from "@/context/LanguageContext";
import { tokenExplorerCopy } from "@/lib/token-explorer-copy";

export function PeopleLoader() {
  const { lang } = useLanguage();
  const t = tokenExplorerCopy[lang] ?? tokenExplorerCopy.en;
  return <div role="status" aria-live="polite" className="flex flex-col items-center gap-3 py-10" data-testid="people-loader">
    <div className="people-loader relative grid h-16 w-16 place-items-center">
      <span className="people-loader-ring absolute inset-0 rounded-full border-2 border-line border-t-brand" aria-hidden="true" />
      <Image src="/brand/icon-192.png" alt="" width={44} height={44} className="people-loader-logo rounded-xl" />
    </div>
    <span className="text-sm text-ink-3">{t.loading}</span>
  </div>;
}
