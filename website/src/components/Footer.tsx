"use client";

import { supportUrlWithLocale } from "@/lib/support-url";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Logo } from "./Logo";
import { OpenSourceLine, GithubNavLink } from "@/components/OpenSource";
import { useLanguage } from "@/context/LanguageContext";
import { PARTNER_LOGIN_HREF, PARTNER_PATH_PREFIX } from "@/lib/partner/guards";
import { content } from "@/lib/content";
import { homePublic } from "@/lib/home-public-content";
import { bugReportCopy } from "@/lib/bug-reports/copy";
import { Eyebrow } from "./ui/primitives";
import { SocialLinks } from "./SocialLinks";

/** Hidden when unset — no Vercel dashboard change required to ship without it. */
const SUPPORT_TG_URL = process.env.NEXT_PUBLIC_SUPPORT_TG_URL;

type FooterProps = {
  showNotInvestmentDisclaimer?: boolean;
};

export function Footer({ showNotInvestmentDisclaimer = false }: FooterProps) {
  const { lang } = useLanguage();
  const pathname = usePathname();
  const t = content[lang].footer;
  const nav = content[lang].nav;
  const notInvestment = showNotInvestmentDisclaimer ? homePublic[lang].notInvestmentDisclaimer : null;
  const supportLink = SUPPORT_TG_URL
    ? [{ label: bugReportCopy[lang].supportLink, href: supportUrlWithLocale(SUPPORT_TG_URL, lang), external: true }]
    : [];

  const getHref = (href: string) => (pathname !== "/" && href.startsWith("#") ? `/${href}` : href);

  // The footer carries a single cross-page CTA. From every page it points to
  // "How It Works"; on that page itself it would link to the current URL, so it
  // becomes the way back to the home page instead.
  const onHowItWorks = pathname === "/how-it-works";
  const ctaHref = onHowItWorks ? "/" : "/how-it-works";
  const ctaLabel = onHowItWorks ? t.homeCta : nav.cta;

  return (
    <footer className="border-t border-line bg-canvas-2">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-12">
          {/* Brand */}
          <div className="md:col-span-5">
            <div>
              {/* Full lockup including the "PEOPLE Blockchain" tagline — the
                  footer is wide enough to render it above the ~9px cap where
                  the approved hairline letterforms stay legible. */}
              <Logo variant="full" alt={t.logoAlt} className="h-12" />
              <p
                className="mt-3 max-w-sm text-sm font-medium leading-snug text-ink-2"
                data-testid="footer-brand-slogan"
              >
                {nav.slogan}
              </p>
              <span className="mt-3 block font-mono text-[11px] uppercase tracking-[0.18em] text-ink-3">
                People
              </span>
              {t.networkName ? (
                <>
                  <p className="mt-2 text-sm font-bold tracking-tight text-ink">{t.networkName}</p>
                  {t.networkNameSecondary ? (
                    <p className="text-xs text-ink-3">{t.networkNameSecondary}</p>
                  ) : null}
                </>
              ) : null}
            </div>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-ink-2">{t.desc}</p>
            <div className="mt-5 flex items-center gap-2">
              <SocialLinks />
              <GithubNavLink />
            </div>
            <OpenSourceLine className="mt-4" />
            <Link
              href={ctaHref}
              className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-brand hover:underline"
            >
              {ctaLabel}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {/* Links */}
          {/* `md:max-w-xl` keeps the two link columns near the brand block
              instead of letting them stretch across the full 7-column track,
              which left the right third of the footer empty. */}
          <nav
            aria-label={content[lang].a11y.footer}
            className="grid gap-8 sm:grid-cols-3 md:col-span-7 md:max-w-2xl"
          >
            <div>
              <Eyebrow tone="neutral" withDot={false}>
                {t.architectureCol}
              </Eyebrow>
              <ul className="mt-4 space-y-3 text-sm">
                {([...nav.links, ...nav.moreLinks, ...supportLink] as {
                  label: string;
                  href: string;
                  external?: boolean;
                }[]).map((link) => (
                  <li key={link.label}>
                    <a
                      href={getHref(link.href)}
                      target={link.external ? "_blank" : undefined}
                      rel={link.external ? "noopener noreferrer" : undefined}
                      className="text-ink-2 transition-colors hover:text-brand"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <Eyebrow tone="neutral" withDot={false}>
                {t.protocolCol}
              </Eyebrow>
              <ul className="mt-4 space-y-3 text-sm">
                {nav.protocolLinks.map((link) => (
                  <li key={link.label}>
                    <a
                      href={getHref(link.href)}
                      className="text-ink-2 transition-colors hover:text-brand"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <Eyebrow tone="neutral" withDot={false}>
                {t.partnerCol}
              </Eyebrow>
              <ul className="mt-4 space-y-3 text-sm">
                <li>
                  <Link
                    href={PARTNER_LOGIN_HREF}
                    className="text-ink-2 transition-colors hover:text-brand"
                    data-testid="footer-partner-login"
                  >
                    {nav.login}
                  </Link>
                </li>
                <li>
                  <Link
                    href={PARTNER_PATH_PREFIX}
                    className="text-ink-2 transition-colors hover:text-brand"
                    data-testid="footer-partner-join"
                  >
                    {nav.becomePartner}
                  </Link>
                </li>
              </ul>
            </div>
          </nav>
        </div>

        {notInvestment ? (
          <p className="mt-10 text-center text-xs text-ink-3">{notInvestment}</p>
        ) : null}
        <div className="mt-12 flex flex-col gap-3 border-t border-line pt-6 font-mono text-xs text-ink-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>© {new Date().getFullYear()} PEOPLE. {t.allRights}</span>
            <span className="text-ink-3/80" aria-hidden="true">·</span>
            <Link href="/privacy" className="text-ink-2 transition-colors hover:text-brand">
              {t.privacyLink}
            </Link>
            <span className="text-ink-3/80" aria-hidden="true">·</span>
            <Link href="/terms" className="text-ink-2 transition-colors hover:text-brand">
              {t.termsLink}
            </Link>
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-value" aria-hidden="true" />
            {nav.statusBadge}
          </span>
        </div>
      </div>
    </footer>
  );
}
