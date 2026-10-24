import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { cookies, headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import {
  languageCookieFromStore,
  themeCookieFromStore,
  themeFromCookieValue,
} from "@/lib/preferences";
import { languageFromRequest } from "@/lib/locale-detect";
import { content } from "@/lib/content";
import { LanguageProvider } from "@/context/LanguageContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { WalletProvider } from "@/context/WalletContext";
import { WalletModalProvider } from "@/context/WalletModalContext";
import { WalletModalHost } from "@/components/wallet/WalletModal";
import { WalletConnectQueryHandler } from "@/components/wallet/WalletConnectQueryHandler";
import { CloudWalletSessionBridge } from "@/components/wallet/CloudWalletSessionBridge";
import { ChainProviders } from "@/components/ChainProviders";
import { Suspense } from "react";
import { ReferralRefCapture } from "@/components/ReferralRefCapture";
import { DocumentTitle } from "@/components/DocumentTitle";
import { BugReportButton } from "@/components/BugReportButton";
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_OG_DESCRIPTION,
  SITE_OG_TITLE,
  SITE_TITLE,
  SITE_URL,
} from "@/lib/site";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  keywords: [
    "People",
    "PEOPLE Blockchain",
    "Блокчейн для сообщества",
    "Blockchain für die Gemeinschaft",
    "社区区块链",
    "PPL",
    "FeeSplitter",
    "Community Pool",
    "Token Factory",
    "Virtual Bonding Curve",
    "Participation Mining",
    "Proof of Humanity",
    "Blockchain Infrastructure",
  ],
  authors: [{ name: "People" }],
  openGraph: {
    title: SITE_OG_TITLE,
    description: SITE_OG_DESCRIPTION,
    type: "website",
    siteName: SITE_NAME,
    url: "/",
    locale: "en_US",
    // The 1200x630 card is contributed by the `opengraph-image.jpg` file
    // convention in this same app segment (and `twitter-image.jpg` for
    // Twitter). Do not also list it in `images` here: the file convention
    // replaces the field outright, so an explicit entry would be dead config.
    // Alt text lives in `opengraph-image.alt.txt` / `twitter-image.alt.txt`.
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_OG_DESCRIPTION,
  },
  manifest: "/site.webmanifest",
  // App icons: approved symbol in `src/app/` (Next file convention) plus PNG mirrors in `public/brand/`.
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48", type: "image/x-icon" },
      { url: "/brand/icon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/brand/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/icon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: [{ url: "/brand/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

/**
 * Boot script:
 *  - restores the stored colour theme before first paint (no flash). The
 *    resolution order mirrors `resolveThemePreference` in `@/lib/preferences`
 *    for the signals this script can see: `people_theme` in localStorage, then
 *    the `people_theme` cookie (legacy cookie names are handled only on the
 *    server via `themeCookieFromStore` and on the client after hydration via
 *    `migrateWebsiteStorage` / `getThemeSnapshot`) → OS `prefers-color-scheme`.
 *  - marks the document as motion-capable only when JS is alive AND the user
 *    has not requested reduced motion. Reveal animations are gated on this
 *    class, so a no-JS or reduced-motion visitor sees every element.
 */
const bootScript = `(function() {
  try {
    var root = document.documentElement;
    var t = localStorage.getItem('people_theme');
    if (t !== 'light' && t !== 'dark') {
      var m = document.cookie.match(/(?:^|;\\s*)people_theme=([^;]*)/);
      t = m ? decodeURIComponent(m[1]) : null;
    }
    if (t !== 'light' && t !== 'dark') {
      t = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    root.classList.remove('dark', 'light');
    root.classList.add(t);
    root.setAttribute('data-theme', t);
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduce) root.classList.add('js-motion');
  } catch (e) {}
})();`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Reading the theme (and language) cookie makes this route dynamic, which
  // gives the first paint the right theme on repeat visits — before this the
  // document always shipped `class="dark"`.
  const cookieStore = await cookies();
  const theme = themeFromCookieValue(themeCookieFromStore(cookieStore));
  const headerStore = await headers();
  const lang = languageFromRequest(
    languageCookieFromStore(cookieStore),
    headerStore.get("accept-language"),
  );

  return (
    <html
      lang={lang}
      dir={lang === "ar" ? "rtl" : "ltr"}
      suppressHydrationWarning
      data-theme={theme}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased ${theme}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
      </head>
      <body className="min-h-full flex flex-col bg-canvas text-ink font-sans">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-brand-ink"
        >
          {content[lang].a11y.skipToContent}
        </a>
        <ThemeProvider initialTheme={theme}>
        <LanguageProvider>
          <WalletProvider>
            <ChainProviders>
            <WalletModalProvider>
              <DocumentTitle />
              <Suspense fallback={null}>
                <ReferralRefCapture />
              </Suspense>
              <Suspense fallback={null}>
                <WalletConnectQueryHandler />
              </Suspense>
              <Suspense fallback={null}>
                <WalletModalHost />
              </Suspense>
              <CloudWalletSessionBridge />
              <BugReportButton />
              {children}
            </WalletModalProvider>
            </ChainProviders>
          </WalletProvider>
        </LanguageProvider>
        </ThemeProvider>
        {process.env.NEXT_PUBLIC_VERCEL_ANALYTICS === "1" ? (
          <>
            <Analytics />
            <SpeedInsights />
          </>
        ) : null}
      </body>
    </html>
  );
}
