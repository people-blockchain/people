import { test, expect } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";
const LOCALES = ["en", "ru", "de", "fr", "es", "pt", "it", "tr", "vi", "id", "zh", "ar"];

/** The one header action is localized now, so each locale's own label must fit
 *  the capped mobile-bar button (the old English «Connect wallet» no longer
 *  applies). Kept in sync with `nav.signIn` in src/lib/locales. */
const SIGN_IN_LABEL = {
  en: "Sign in",
  ru: "Войти",
  es: "Iniciar sesión",
  pt: "Entrar",
  fr: "Se connecter",
  de: "Anmelden",
  it: "Accedi",
  tr: "Giriş yap",
  vi: "Đăng nhập",
  id: "Masuk",
  zh: "登录",
  ar: "تسجيل الدخول",
};

async function setLocale(page, lang) {
  await page.addInitScript((value) => {
    try {
      localStorage.setItem("people_lang", value);
    } catch {
      /* ignore */
    }
  }, lang);
}

test.describe("Header «Sign in» label", () => {
  for (const lang of LOCALES) {
    test(`is localized and fits the mobile bar (${lang})`, async ({ page }) => {
      await setLocale(page, lang);
      await page.setViewportSize({ width: 360, height: 780 });
      await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });

      const connect = page.locator('[data-testid="header-sign-in"]:visible').first();
      await expect(connect).toBeVisible({ timeout: 15000 });
      await expect(connect).toHaveText(SIGN_IN_LABEL[lang]);

      // Measure the painted button, not the desktop copy that also mounts.
      const layout = await connect.evaluate((el) => {
        const header = el.closest("header");
        return {
          pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
          buttonClipped: el.scrollWidth - el.clientWidth,
          headerRight: header ? header.getBoundingClientRect().right : 0,
          viewport: window.innerWidth,
        };
      });
      expect(layout.pageOverflow).toBeLessThanOrEqual(0);
      expect(layout.buttonClipped).toBeLessThanOrEqual(1);
      expect(layout.headerRight).toBeLessThanOrEqual(layout.viewport);
    });
  }
});

test.describe("PEOPLE Wallet sign-in while the SDK loads", () => {
  test("Google button shows an explicit loading status, not a dead grey button", async ({ page }) => {
    await setLocale(page, "ru");
    // Hold every third-party request open so the Web3Auth SDK stays in its loading phase.
    await page.route(
      (url) => !["127.0.0.1", "localhost"].includes(url.hostname),
      () => new Promise(() => {}),
    );
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await page.locator('[data-testid="header-sign-in"]:visible').first().click();
    await expect(page.locator("dialog[open]")).toBeVisible({ timeout: 8000 });

    const google = page.locator("dialog[open]").getByTestId("wallet-sign-in-google");
    const shown = await google.waitFor({ state: "visible", timeout: 15000 }).then(() => true, () => false);
    if (!shown) {
      test.skip(true, "Web3Auth sign-in UI not configured in this environment");
    }

    await expect(google).toHaveAttribute("data-state", "loading");
    await expect(google).toHaveAttribute("aria-busy", "true");
    await expect(google).toBeDisabled();
    const status = page.locator("dialog[open]").getByTestId("wallet-sign-in-status");
    await expect(status).toHaveAttribute("role", "status");
    await expect(status).toHaveText("Готовим безопасный вход…");
    // Readable, not the 40% "disabled" fade.
    const opacity = await google.evaluate((el) => Number(getComputedStyle(el).opacity));
    expect(opacity).toBeGreaterThanOrEqual(0.8);
  });
});
