"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/context/LanguageContext";
import { DOCUMENT_TITLES } from "@/lib/site";

/** Syncs the browser tab with the visitor's locale. Crawler metadata stays EN. */
export function DocumentTitle() {
  const { lang } = useLanguage();
  const pathname = usePathname();

  useEffect(() => {
    const titles = DOCUMENT_TITLES[lang];
    if (pathname === "/how-it-works") document.title = titles.howItWorks;
    else if (pathname === "/create/token") document.title = titles.createToken;
    else if (pathname === "/create/nft") document.title = titles.createNft;
    else if (pathname === "/create/contract") document.title = titles.createContract;
    else if (pathname === "/docs") document.title = titles.docs;
    else if (pathname === "/fees") document.title = titles.fees;
    else if (pathname === "/tokenomics") document.title = titles.tokenomics;
    else if (pathname === "/create") document.title = titles.create;
    else if (pathname.startsWith("/wallet")) document.title = titles.wallet;
    else if (pathname.startsWith("/explorer")) document.title = titles.explorer;
    else if (pathname === "/swap") document.title = titles.swap;
    else if (pathname === "/bounty") document.title = titles.founders;
    else if (pathname === "/founders") document.title = titles.founders;
    else if (pathname === "/transparency") document.title = titles.transparency;
    else if (pathname === "/privacy") document.title = titles.privacy;
    else if (pathname === "/terms") document.title = titles.terms;
    else document.title = titles.home;
  }, [lang, pathname]);

  return null;
}
