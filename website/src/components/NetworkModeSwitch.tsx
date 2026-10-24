"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useLanguage } from "@/context/LanguageContext";
import { content } from "@/lib/content";

/**
 * Mainnet / Testnet switch in the header.
 *
 * The two modes are two surfaces, not a client-side flag: **Testnet** is the
 * test-and-create flow on the public testnet, **Mainnet** is the PPL sale.
 * Routing rather than toggling state is deliberate — a stored "mode" that the
 * rest of the site did not honour would be a lie about which chain you are on.
 */
const MODES = [
  { id: "mainnet", href: "/buy" },
  { id: "testnet", href: "/create" },
] as const;

/** Testnet-first routes: visiting any of these means you are in testnet mode. */
const TESTNET_PREFIXES = ["/create", "/wallet", "/swap", "/explorer", "/staking", "/discover"];

export function NetworkModeSwitch({ size = "default" }: { size?: "default" | "compact" }) {
  const pathname = usePathname();
  const { lang } = useLanguage();
  const c = content[lang].networkMode;

  const active = pathname?.startsWith("/buy")
    ? "mainnet"
    : TESTNET_PREFIXES.some((prefix) => pathname?.startsWith(prefix))
      ? "testnet"
      : null;

  const height = size === "compact" ? "h-9" : "h-11";

  return (
    <div
      role="group"
      aria-label={c.label}
      className={`${height} inline-flex shrink-0 items-center rounded-lg border border-line bg-surface-2 p-0.5`}
    >
      {MODES.map((mode) => {
        const isActive = active === mode.id;
        return (
          <Link
            key={mode.id}
            href={mode.href}
            title={mode.id === "mainnet" ? c.mainnetTitle : c.testnetTitle}
            aria-current={isActive ? "page" : undefined}
            className={`header-label inline-flex h-full items-center rounded-[0.4rem] px-2 text-[11px] font-semibold transition-colors xl:px-2.5 xl:text-xs ${
              isActive
                ? "bg-brand/15 text-brand"
                : "text-ink-3 hover:text-ink"
            }`}
          >
            {mode.id === "mainnet" ? c.mainnet : c.testnet}
          </Link>
        );
      })}
    </div>
  );
}
