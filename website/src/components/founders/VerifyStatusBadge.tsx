"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

type Status = "unknown" | "none" | "telegram" | "passport";

const COPY: Record<string, { verify: string; telegram: string; passport: string }> = {
  en: { verify: "Verify", telegram: "Telegram ✓", passport: "Passport ✓" },
  ru: { verify: "Верификация", telegram: "Telegram ✓", passport: "Passport ✓" },
  de: { verify: "Verifizieren", telegram: "Telegram ✓", passport: "Passport ✓" },
  es: { verify: "Verificar", telegram: "Telegram ✓", passport: "Passport ✓" },
  fr: { verify: "Vérifier", telegram: "Telegram ✓", passport: "Passport ✓" },
  it: { verify: "Verifica", telegram: "Telegram ✓", passport: "Passport ✓" },
  pt: { verify: "Verificar", telegram: "Telegram ✓", passport: "Passport ✓" },
  tr: { verify: "Doğrula", telegram: "Telegram ✓", passport: "Passport ✓" },
  id: { verify: "Verifikasi", telegram: "Telegram ✓", passport: "Passport ✓" },
  zh: { verify: "验证", telegram: "Telegram ✓", passport: "Passport ✓" },
  vi: { verify: "Xác minh", telegram: "Telegram ✓", passport: "Passport ✓" },
  ar: { verify: "التحقق", telegram: "Telegram ✓", passport: "Passport ✓" },
};

let cached: Promise<Status> | null = null;

function loadStatus(): Promise<Status> {
  if (!cached) {
    cached = fetch("/api/founders/me", { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return "unknown" as Status;
        const body = (await res.json()) as { signedIn?: boolean; founder?: { verificationLevel?: number } | null };
        if (!body.signedIn) return "unknown" as Status;
        const level = Number(body.founder?.verificationLevel ?? 0);
        return (level >= 2 ? "passport" : level >= 1 ? "telegram" : "none") as Status;
      })
      .catch(() => "unknown" as Status);
    // Re-check on the next mount after a while (verification may have just completed in Telegram).
    setTimeout(() => {
      cached = null;
    }, 15_000);
  }
  return cached;
}

/** Verification status for signed-in users: a "Verify" CTA until verified, then a level badge. */
export function VerifyStatusBadge({ variant = "chip", onNavigate }: { variant?: "chip" | "menu"; onNavigate?: () => void }) {
  const { lang } = useLanguage();
  const c = COPY[lang] ?? COPY.en;
  const [status, setStatus] = useState<Status>("unknown");

  useEffect(() => {
    let active = true;
    void loadStatus().then((s) => {
      if (active) setStatus(s);
    });
    return () => {
      active = false;
    };
  }, []);

  if (status === "unknown") return null;
  const verified = status !== "none";
  const label = status === "passport" ? c.passport : status === "telegram" ? c.telegram : c.verify;
  const Icon = verified ? ShieldCheck : ShieldAlert;
  const cls =
    variant === "menu"
      ? `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors hover:bg-surface-2 ${verified ? "text-value" : "text-brand"}`
      : `header-label hidden h-9 shrink-0 items-center gap-1 rounded-lg border px-2.5 text-xs font-semibold transition-colors lg:inline-flex max-lg:!hidden ${
          verified ? "border-line bg-surface-2 text-value" : "border-brand/40 bg-brand/10 text-brand hover:bg-brand/20"
        }`;
  return (
    <Link
      href="/founders#verify"
      role={variant === "menu" ? "menuitem" : undefined}
      data-testid={`verify-status-${variant}`}
      data-status={status}
      onClick={onNavigate}
      className={cls}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {label}
    </Link>
  );
}
