"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { captureReferrerFromSearch } from "@/lib/referral-ref";

/** Runs on every route: stores `?ref=` in localStorage when present. */
export function ReferralRefCapture() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    captureReferrerFromSearch(searchParams.toString() ? `?${searchParams.toString()}` : window.location.search);
  }, [pathname, searchParams]);

  return null;
}
