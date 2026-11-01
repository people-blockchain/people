import type { Metadata } from "next";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import { languageFromAcceptLanguage } from "@/lib/locale-detect";
import { buildPageMetadata } from "@/lib/og-meta";

/** Same request-language tags the bounty page used before the card mount moved into a client page. */
export async function generateMetadata(): Promise<Metadata> {
  const lang = languageFromAcceptLanguage((await headers()).get("accept-language"));
  return buildPageMetadata("bounty", lang);
}

export const dynamic = "force-dynamic";

export default function BountyLayout({ children }: { children: ReactNode }) {
  return children;
}
