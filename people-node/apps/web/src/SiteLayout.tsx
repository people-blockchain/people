import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { ConfirmDialog } from "./ConfirmDialog.js";
import { SearchBar } from "./SearchBar.js";
import { TokenIcon } from "./TokenIcon.js";
import { usePrefs } from "./PrefsContext.js";
import { useWallet } from "./WalletContext.js";
import { useLive } from "./LiveContext.js";
import { useNotify } from "./NotifyContext.js";
import { captureReferrer } from "./referral.js";
import type { Language, Theme } from "./i18n.js";
import { displaySessionLabel } from "./walletSession.js";
import { classifyNetwork } from "./networkEnv.js";

const navItems = [
  { to: "/", labelKey: "home" as const, end: true, group: "secondary" as const },
  { to: "/wallet", labelKey: "wallet" as const, group: "primary" as const },
  { to: "/validators", labelKey: "launch" as const, group: "primary" as const },
  { to: "/light", labelKey: "lightClient" as const, group: "primary" as const },
  { to: "/staking", labelKey: "yieldNav" as const, group: "secondary" as const },
  { to: "/governance", labelKey: "governance" as const, group: "secondary" as const },
  { to: "/explorer", labelKey: "explorer" as const, group: "primary" as const },
  { to: "/status", labelKey: "statusNav" as const, group: "secondary" as const },
  { to: "/docs", labelKey: "docs" as const, group: "secondary" as const },
  { to: "/pricing", labelKey: "pricing" as const, group: "secondary" as const },
  { to: "/roadmap", labelKey: "roadmap" as const, group: "secondary" as const }
];

function ThemeIcon({ theme }: { theme: Theme }) {
  if (theme === "dark") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.75" />
        <path
          d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M21 14.5A7.5 7.5 0 0 1 9.5 3 6.5 6.5 0 1 0 21 14.5Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SiteLayout() {
  const { language, setLanguage, theme, setTheme, t } = usePrefs();
  const { session, lockSession } = useWallet();
  const { connected, headHeight, metrics, offline } = useLive();
  const notify = useNotify();
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const offlineNotifiedRef = useRef(false);

  const finalizedLag = metrics?.finalizedLag;
  const chainId = metrics?.chainId;
  const networkKind = classifyNetwork(chainId);
  const networkLabel =
    networkKind === "mainnet"
      ? t.networkKindMainnet
      : networkKind === "testnet"
        ? t.networkKindTestnet
        : networkKind === "devnet"
          ? t.networkKindDevnet
          : t.networkKindUnknown;
  const activeValidators = metrics?.activeValidators;
  const liveText = connected
    ? [
        networkLabel,
        `#${headHeight}`,
        metrics?.finalizedHeight !== undefined ? `${t.finalized} ${metrics.finalizedHeight}` : null,
        finalizedLag !== undefined ? `Δ${finalizedLag}` : null,
        activeValidators !== undefined ? `${activeValidators} ${t.activeValidatorsShort}` : null
      ]
        .filter(Boolean)
        .join(" · ")
    : "…";

  useEffect(() => {
    if (offline) {
      if (!offlineNotifiedRef.current) {
        notify.info(t.nodeOffline);
        offlineNotifiedRef.current = true;
      }
      return;
    }
    offlineNotifiedRef.current = false;
  }, [offline, notify, t.nodeOffline]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [language, location.pathname]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    captureReferrer(params.get("ref"));
  }, [location.search]);

  useEffect(() => {
    if (!mobileNavOpen) {
      document.body.style.overflow = "";
      return;
    }
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileNavOpen]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMobileNavOpen(false);
        setShowLogoutConfirm(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function handleLockSession() {
    lockSession();
    setShowLogoutConfirm(false);
  }

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        {t.skipToContent}
      </a>
      <main className="layout" id="main-content">
        <header className="top-nav card">
          <div className="top-nav__row">
            <div className="brand">
              <span className="brand-mark" aria-hidden="true">
                OVN
              </span>
              <div className="brand-copy">
                <Link to="/" className="brand-link">
                  Open Validator Network
                </Link>
                <span className="brand-tagline">
                  {connected ? (
                    <>
                      <span className={`network-badge network-badge--${networkKind}`}>{networkLabel}</span>
                      {` · #${headHeight}`}
                    </>
                  ) : (
                    t.nodeOffline
                  )}
                </span>
              </div>
            </div>

            <div className="nav-actions">
              <span
                className={`live-pill ${connected ? "live-pill--on" : "live-pill--off"}`}
                title={connected ? t.liveConnected : t.liveConnecting}
                role="status"
                aria-live="polite"
                aria-label={connected ? t.liveConnected : t.liveConnecting}
              >
                <span className="wallet-status-dot" aria-hidden="true" />
                <Link to="/status" className="live-pill__link">
                  {liveText}
                </Link>
              </span>
              {session && (
                <div className="wallet-status">
                  <Link to="/wallet" className="wallet-status-link">
                    <span className="wallet-status-dot" aria-hidden="true" />
                    {displaySessionLabel(session.label, t.walletSessionLabel)}
                  </Link>
                  <button
                    type="button"
                    className="ghost wallet-lock-btn"
                    onClick={() => setShowLogoutConfirm(true)}
                    aria-label={t.walletLock}
                  >
                    {t.walletLock}
                  </button>
                </div>
              )}
              <label className="lang-select-wrap">
                <span className="sr-only">{t.language}</span>
                <select
                  className="lang-select"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as Language)}
                  aria-label={t.language}
                >
                  <option value="en">EN</option>
                  <option value="ru">RU</option>
                </select>
              </label>
              <button
                type="button"
                className="ghost icon-btn"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                aria-label={theme === "dark" ? t.themeLight : t.themeDark}
                title={theme === "dark" ? t.themeLight : t.themeDark}
              >
                <ThemeIcon theme={theme} />
              </button>
              <button
                type="button"
                className="ghost nav-menu-toggle"
                aria-expanded={mobileNavOpen}
                aria-controls="primary-nav"
                onClick={() => setMobileNavOpen((prev) => !prev)}
              >
                {mobileNavOpen ? t.navClose : t.navMenu}
              </button>
            </div>
          </div>

          <div className="top-nav__row top-nav__row--secondary">
            <SearchBar />
            <nav
              id="primary-nav"
              className={`nav-links ${mobileNavOpen ? "nav-links--open" : ""}`}
              aria-label={t.primaryNavigation}
            >
              {navItems.map((item, index) => {
                const prev = navItems[index - 1];
                const showSep = prev && prev.group === "primary" && item.group === "secondary";
                return (
                  <span key={item.to} className="nav-item-wrap">
                    {showSep ? <span className="nav-sep" aria-hidden="true" /> : null}
                    <NavLink
                      to={item.to}
                      end={item.end}
                      className={({ isActive }) =>
                        [
                          "nav-link",
                          item.group === "primary" ? "nav-link--primary" : "nav-link--secondary",
                          isActive ? "active" : ""
                        ]
                          .filter(Boolean)
                          .join(" ")
                      }
                      onClick={() => setMobileNavOpen(false)}
                    >
                      {t[item.labelKey]}
                    </NavLink>
                  </span>
                );
              })}
            </nav>
          </div>
        </header>

        <div className="page-fade" key={location.pathname}>
          <Outlet />
        </div>

        <footer className="footer card">
          <div className="footer__grid">
            <div>
              <strong className="brand-link">Open Validator Network</strong>
              <p>{t.defaultDescription}</p>
            </div>
            <div className="footer__links">
              <Link to="/wallet">{t.wallet}</Link>
              <Link to="/validators">{t.launch}</Link>
              <Link to="/light">{t.lightClient}</Link>
              <Link to="/explorer">{t.explorer}</Link>
            </div>
          </div>
          <p className="footer__copy">
            Open Validator Network ·{" "}
            <span className="footer-token">
              <TokenIcon size={14} /> People (PPL)
            </span>
          </p>
        </footer>
      </main>

      <ConfirmDialog
        open={showLogoutConfirm}
        title={t.walletLock}
        message={t.walletLogoutConfirm}
        confirmLabel={t.walletLock}
        cancelLabel={t.cancel}
        onCancel={() => setShowLogoutConfirm(false)}
        onConfirm={handleLockSession}
      />
    </div>
  );
}
