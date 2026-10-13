"use client";

import { installScrollLockGuard } from "@/lib/scroll-lock";
import { supportUrlWithLocale } from "@/lib/support-url";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { useHeaderSloganFit } from "@/hooks/useHeaderSloganFit";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./Logo";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { GithubNavLink } from "./OpenSource";
import { Menu, X, ArrowRight, Sun, Moon, ChevronDown } from "lucide-react";
import { HeaderWalletMenu } from "@/components/wallet/HeaderWalletMenu";
import { useLanguage } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import { content } from "@/lib/content";
import { BRAND_TAGLINE } from "@/lib/site";
import { bugReportCopy } from "@/lib/bug-reports/copy";

/** Hidden when unset — no Vercel dashboard change required to ship without it. */
const SUPPORT_TG_URL = process.env.NEXT_PUBLIC_SUPPORT_TG_URL;

const NAV_LINK =
  "header-label inline-flex h-11 items-center rounded-lg px-2.5 text-sm font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink xl:px-3";

/** Themes/labels live with the bar; the button itself is presentational so the
 *  hook is only read in one place. */
function ThemeToggleButton({
  label,
  onToggle,
  className,
}: {
  label: string;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      title={label}
      className={
        className ??
        "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
      }
    >
      {/* CSS-driven so the correct icon is painted before hydration */}
      <Sun className="hidden h-4 w-4 text-warm dark:block" aria-hidden="true" />
      <Moon className="h-4 w-4 text-brand dark:hidden" aria-hidden="true" />
    </button>
  );
}

const HOW_IT_WORKS_HREF = "/how-it-works";
const DISCOVER_HREF = "/discover";
const DESKTOP_NAV_MIN_WIDTH = 1024;

type NavLink = { label: string; href: string; compactOnly?: boolean; external?: boolean };

function MoreMenu({
  label,
  links,
  getHref,
}: {
  label: string;
  links: NavLink[];
  getHref: (href: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (links.length === 0) return null;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`${NAV_LINK} inline-flex items-center gap-1`}
      >
        {label}
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-ink-3 transition-transform duration-300 ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        />
      </button>
      {open && (
        <>
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default bg-transparent"
          />
          <ul
            role="menu"
            aria-label={label}
            className="absolute left-0 top-[calc(100%+0.5rem)] z-50 min-w-[12rem] rounded-xl border border-line bg-canvas-2 p-1.5 shadow-[var(--elev-2)]"
          >
            {links.map((link) => (
              <li
                key={`${link.href}${link.compactOnly ? "-compact" : ""}`}
                role="none"
                className={link.compactOnly ? "2xl:hidden" : undefined}
              >
                <a
                  role="menuitem"
                  href={getHref(link.href)}
                  onClick={() => setOpen(false)}
                  target={link.external ? "_blank" : undefined}
                  rel={link.external ? "noopener noreferrer" : undefined}
                  className="header-label block rounded-lg px-3 py-2 text-sm font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function Navbar() {
  const [open, setOpen] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const { lang, setLang } = useLanguage();
  const { toggleTheme } = useTheme();
  const pathname = usePathname();
  const t = content[lang].nav;
  const supportLabel = bugReportCopy[lang].supportLink;
  const supportLink: NavLink[] = SUPPORT_TG_URL
    ? [{ label: supportLabel, href: supportUrlWithLocale(SUPPORT_TG_URL, lang), external: true }]
    : [];
  const howItWorksLink = t.links.find((link) => link.href === HOW_IT_WORKS_HREF);
  const discoverLink = t.links.find((link) => link.href === DISCOVER_HREF);
  const moreMenuLinks = [
    ...(howItWorksLink ? [{ ...howItWorksLink, compactOnly: true as const }] : []),
    ...(discoverLink ? [{ ...discoverLink, compactOnly: true as const }] : []),
    ...t.moreLinks,
    ...supportLink,
  ];
  const sheetLinks: NavLink[] = [...t.links, ...t.moreLinks, ...supportLink];

  const getHref = (href: string) => (pathname !== "/" && href.startsWith("#") ? `/${href}` : href);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  // Site-wide: while the sheet is closed, clear any stale scroll lock (wallet
  // in-app browsers can background the page mid-lock for a native warning).
  useEffect(() => {
    if (open) return;
    return installScrollLockGuard();
  }, [open]);

  // Lock body scroll + allow Escape to dismiss the mobile sheet.
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      // Always clear (never restore a possibly stale "hidden").
      document.body.style.removeProperty("overflow");
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Dismiss the mobile sheet whenever the route changes (adjust state during
  // render rather than in an effect).
  const [routeWhenOpened, setRouteWhenOpened] = useState(pathname);
  if (open && routeWhenOpened !== pathname) {
    setRouteWhenOpened(pathname);
    setOpen(false);
  }

  const toggleMenu = () => {
    setRouteWhenOpened(pathname);
    setOpen((value) => !value);
  };

  const sloganRef = useHeaderSloganFit(`${lang}:${t.slogan}`);
  const brandBundleRef = useRef<HTMLDivElement>(null);

  // Desktop only: collapsed brand flex slot lets primary nav slide under the lockup.
  // Layout width from bundle scrollWidth — logo/slogan/tagline styles unchanged.
  useLayoutEffect(() => {
    const bundle = brandBundleRef.current;
    const brand = bundle?.closest("a");
    if (!bundle || !brand) return;

    const sync = () => {
      if (window.innerWidth < DESKTOP_NAV_MIN_WIDTH) {
        brand.style.width = "";
        return;
      }
      const width = bundle.scrollWidth;
      if (width > 0) brand.style.width = `${width}px`;
    };

    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(bundle);
    window.addEventListener("resize", sync);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", sync);
      brand.style.width = "";
    };
  }, [lang, t.slogan]);

  return (
    <header className="glass-bar sticky top-0 z-50 border-b border-line">
      <div
        dir="ltr"
        className="header-bar-row mx-auto flex h-14 max-w-7xl flex-nowrap items-center gap-1.5 px-3 py-0 max-[639px]:gap-1.5 sm:gap-2 sm:px-6 lg:h-16 lg:gap-3 lg:px-6 xl:gap-3 xl:px-8"
      >
        {/* Brand — lockup + tagline under PEOPLE; localized slogan below the
            whole block, left-aligned with the symbol (footer layout). */}
        <Link
          href="/"
          aria-label={t.brandAria}
          className="header-brand-anchor group flex min-w-0 max-md:max-w-[min(46%,10.5rem)] shrink-0 items-center md:flex-1 lg:max-w-none lg:flex-none"
        >
          <div
            className="header-brand-mobile flex min-w-0 items-center md:hidden"
            dir="ltr"
            data-testid="header-brand-mobile"
          >
            <div className="header-brand-lockup" data-testid="header-brand-lockup-mobile">
              <Logo
                alt={t.logoAlt}
                className="h-full w-auto max-w-none transition-transform duration-300 group-hover:scale-[1.03]"
              />
            </div>
          </div>
          <div
            ref={brandBundleRef}
            className="header-brand-bundle hidden w-full min-w-0 md:grid"
            dir="ltr"
          >
            <div className="header-brand-lockup-column">
              <div className="header-brand-lockup" data-testid="header-brand-lockup">
                <Logo
                  alt={t.logoAlt}
                  className="h-full w-auto max-w-none transition-transform duration-300 group-hover:scale-[1.03]"
                />
              </div>
              <div className="header-brand-lines">
                <span className="header-brand-tagline" data-testid="header-brand-tagline">
                  {BRAND_TAGLINE}
                </span>
              </div>
            </div>
            <span
              ref={sloganRef}
              data-testid="header-brand-slogan"
              data-lang={lang}
              data-expected={t.slogan}
              className="header-brand-slogan"
              style={{ "--slogan-chars": String(t.slogan.length) } as CSSProperties}
            >
              {t.slogan}
            </span>
          </div>
        </Link>

        {/* Desktop navigation — lg is 1024px. How It Works and Discover move into
            More below 2xl (not xl): the bar's content width exceeds the
            max-w-7xl container exactly at the xl breakpoint (1280px, same as
            max-w-7xl itself, so there's no slack), which overflowed the page
            by ~27px when these two were inline there. 2xl (1536px) has real
            room to spare. */}
        <nav
          aria-label="Primary"
          className="header-primary-nav hidden shrink items-center gap-0.5 lg:flex lg:pl-4 xl:gap-1 xl:pl-5 2xl:pl-6"
        >
          {t.links.map((link) => (
            <a
              key={link.href}
              href={getHref(link.href)}
              className={
                link.href === HOW_IT_WORKS_HREF || link.href === DISCOVER_HREF
                  ? NAV_LINK.replace("inline-flex", "hidden 2xl:inline-flex")
                  : NAV_LINK
              }
            >
              {link.label}
            </a>
          ))}
          <MoreMenu label={t.moreLabel} links={moreMenuLinks} getHref={getHref} />
        </nav>

        <div className="header-utilities ml-auto flex shrink-0 items-center gap-1.5 lg:gap-2">
          {/* Utilities only from 1024 up. The account action is the single
              «Sign in» wallet button in HeaderWalletMenu below — Join lives in
              the homepage hero, and Become a partner in the footer, Growth
              block, and the <1024 sheet. */}
          <div className="hidden items-center gap-1.5 lg:flex xl:gap-2">
            <GithubNavLink />
            <LanguageSwitcher value={lang} onChange={setLang} label={t.languageLabel} />
            <ThemeToggleButton label={t.themeToggle} onToggle={toggleTheme} />
          </div>

          <div className="hidden lg:block">
            <HeaderWalletMenu layout="desktop" />
          </div>

          <div className="flex shrink-0 items-center gap-1.5 lg:hidden">
            <HeaderWalletMenu layout="mobile-bar" />
            <LanguageSwitcher
              value={lang}
              onChange={setLang}
              label={t.languageLabel}
              size="compact"
            />
            <ThemeToggleButton
              label={t.themeToggle}
              onToggle={toggleTheme}
              className="header-utility-btn flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
            />
            <button
              type="button"
              onClick={toggleMenu}
              aria-expanded={open}
              aria-controls="mobile-menu"
              aria-label={open ? t.closeLabel : t.menuLabel}
              className="header-utility-btn flex h-9 w-9 shrink-0 cursor-pointer touch-manipulation items-center justify-center rounded-lg border border-line bg-surface-2 text-ink-2"
            >
              {open ? (
                <X className="pointer-events-none h-4 w-4" aria-hidden="true" />
              ) : (
                <Menu className="pointer-events-none h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile sheet — portaled to body so fixed positioning is not broken by
          `.glass-bar` backdrop-filter on the sticky header (iOS Safari). */}
      {open && portalReady
        ? createPortal(
            <>
              <button
                type="button"
                tabIndex={-1}
                aria-hidden="true"
                onClick={() => setOpen(false)}
                className="fixed inset-0 top-14 z-[55] cursor-default bg-black/30 lg:hidden"
              />
              <div
                id="mobile-menu"
                className="fixed inset-x-0 top-14 z-[60] max-h-[calc(100dvh-3.5rem)] overflow-y-auto overscroll-contain border-t border-line bg-canvas pb-[max(1.25rem,env(safe-area-inset-bottom))] lg:hidden"
              >
                <nav aria-label="Mobile" className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
                  <ul className="flex flex-col">
                    {sheetLinks.map((link) => (
                      <li key={link.href}>
                        <a
                          href={getHref(link.href)}
                          onClick={() => setOpen(false)}
                          target={link.external ? "_blank" : undefined}
                          rel={link.external ? "noopener noreferrer" : undefined}
                          className="flex items-center justify-between gap-4 border-b border-line py-4 text-lg font-semibold text-ink"
                        >
                          {link.label}
                          <ArrowRight className="h-4 w-4 shrink-0 text-ink-3" />
                        </a>
                      </li>
                    ))}
                    <li>
                      <Link
                        href="/partner"
                        onClick={() => setOpen(false)}
                        className="flex items-center justify-between gap-4 border-b border-line py-4 text-lg font-semibold text-ink"
                      >
                        {t.becomePartner}
                        <ArrowRight className="h-4 w-4 shrink-0 text-ink-3" />
                      </Link>
                    </li>
                  </ul>

                  <p className="mono-label mt-8 text-ink-3">{t.protocolLabel}</p>
                  <ul className="mt-3 grid gap-2">
                    {t.protocolLinks.map((link) => (
                      <li key={link.label}>
                        <a
                          href={getHref(link.href)}
                          onClick={() => setOpen(false)}
                          className="block rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink-2"
                        >
                          {link.label}
                        </a>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-8 flex flex-col gap-3 border-t border-line pt-6 pb-8">
                    <HeaderWalletMenu layout="mobile-sheet" onDismiss={() => setOpen(false)} />
                  </div>
                </nav>
              </div>
            </>,
            document.body
          )
        : null}
    </header>
  );
}
