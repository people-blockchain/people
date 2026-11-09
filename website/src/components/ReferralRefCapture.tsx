"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  captureReferrerFromSearch,
  readBrowserReferralCookie,
  readStoredReferralCode,
} from "@/lib/referral-ref";

const ATTACH_ATTEMPT_KEY = "ppl_partner_ref_attached";

/**
 * Runs on every route: stores `?ref=` in localStorage and `people_partner_ref` cookie
 * when present, and attaches the referral at first sign-in via `/api/partner/referral/attach`
 * so users who sign in on `/buy` or `/` never lose attribution before visiting `/partner`.
 */
export function ReferralRefCapture() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const inFlight = useRef(false);

  useEffect(() => {
    captureReferrerFromSearch(searchParams.toString() ? `?${searchParams.toString()}` : window.location.search);

    const refCookie = readBrowserReferralCookie() ?? readStoredReferralCode();
    if (!refCookie || inFlight.current) return;

    try {
      if (window.sessionStorage?.getItem(ATTACH_ATTEMPT_KEY) === refCookie) {
        return;
      }
    } catch {
      /* ignore sessionStorage errors */
    }

    inFlight.current = true;
    void fetch("/api/partner/referral/attach", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refCookie }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { attached?: boolean; reason?: string } | null) => {
        if (
          data?.attached ||
          data?.reason === "already_bound" ||
          data?.reason === "self" ||
          data?.reason === "depth_exceeded" ||
          data?.reason === "cycle"
        ) {
          try {
            window.sessionStorage?.setItem(ATTACH_ATTEMPT_KEY, refCookie);
          } catch {
            /* ignore */
          }
        }
      })
      .catch(() => {
        /* ignore network errors */
      })
      .finally(() => {
        inFlight.current = false;
      });
  }, [pathname, searchParams]);

  return null;
}
