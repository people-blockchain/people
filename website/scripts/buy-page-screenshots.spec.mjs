import { mkdir } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { createECDH } from "node:crypto";
import { test, expect } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";
const OUT = process.env.BUY_SCREENSHOT_DIR ?? "/opt/cursor/artifacts";

const privateKey = "2".padStart(64, "0");
const ecdh = createECDH("secp256k1");
ecdh.setPrivateKey(Buffer.from(privateKey, "hex"));
const testWallet = {
  privateKey,
  address:
    "0x" + createHash("sha256").update(ecdh.getPublicKey(null, "compressed")).digest("hex").slice(0, 40),
};

async function seedAndUnlockWallet(page) {
  await page.goto(`${BASE}/wallet`, { waitUntil: "domcontentloaded" });
  await page.evaluate(async (key) => {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const material = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode("test-password"),
      "PBKDF2",
      false,
      ["deriveKey"],
    );
    const derived = await crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations: 120_000, hash: "SHA-256" },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt"],
    );
    const data = new Uint8Array(
      await crypto.subtle.encrypt({ name: "AES-GCM", iv }, derived, new TextEncoder().encode(key.privateKey)),
    );
    const hex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(
      "ppl-web-wallets",
      JSON.stringify([
        {
          id: "buy-screenshot-wallet",
          label: "Screenshot wallet",
          address: key.address,
          createdAt: 1,
          encryptedPrivateKey: JSON.stringify({ salt: hex(salt), iv: hex(iv), data: hex(data) }),
        },
      ]),
    );
  }, testWallet);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
  await expect(page.getByTestId("wallet-ppl")).toBeVisible({ timeout: 30_000 });
}

async function setLang(page, lang) {
  await page.evaluate((l) => {
    localStorage.setItem("people_lang", l);
    document.cookie = `people_lang=${encodeURIComponent(l)}; path=/; max-age=31536000; SameSite=Lax`;
    window.dispatchEvent(new StorageEvent("storage", { key: "people_lang" }));
  }, lang);
}

async function installApiMocks(page) {
  await page.route(/\/api\/(network|evm\/compat)\//, async (route) => {
    const url = new URL(route.request().url());
    const sub = url.pathname.replace(/^\/api\/(network|evm\/compat)\//, "");
    let body = {};
    if (sub === "health") body = { chainId: "97401", status: "ok", height: 100 };
    else if (sub === "metrics") body = { height: 100, finalizedHeight: 99 };
    else if (sub.endsWith("/transactions")) body = [];
    else if (sub.startsWith("address/")) body = { balance: 10, nonce: 0, balances: {} };
    else if (sub === "assets") body = [];
    else if (sub === "nfts") body = [];
    await route.fulfill({ json: body });
  });
}

const HERO_HEADLINE = {
  en: /Buy PPL at the early-participant price/i,
  ru: /Купите PPL по цене раннего участника/,
};

async function waitForBuyHeroLocale(page, lang) {
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(HERO_HEADLINE[lang], {
    timeout: 30_000,
  });
}

async function openBuyInLocale(browser, lang) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: lang === "ru" ? "ru-RU" : "en-US",
  });
  await context.addCookies([{ name: "people_lang", value: lang, url: BASE, sameSite: "Lax" }]);
  await context.addInitScript((l) => {
    localStorage.setItem("people_lang", l);
    document.cookie = `people_lang=${encodeURIComponent(l)}; path=/; max-age=31536000; SameSite=Lax`;
  }, lang);
  const page = await context.newPage();
  await installApiMocks(page);
  await page.goto(`${BASE}/buy`, { waitUntil: "networkidle" });
  await waitForBuyHeroLocale(page, lang);
  return { page, context };
}

async function openBridgeWidget(page) {
  await page.getByTestId("pay-mode-bridge").click();
  await expect(page.getByTestId("buy-lifi-widget")).toBeVisible({ timeout: 90_000 });
  const solana = page.getByText("Solana", { exact: false }).first();
  if (await solana.isVisible({ timeout: 15_000 }).catch(() => false)) {
    await solana.click();
  }
  await page.waitForTimeout(1500);
}

test.describe("buy page evidence", () => {
  test.beforeAll(async () => {
    await mkdir(OUT, { recursive: true });
  });

  test.beforeEach(async ({ page }) => {
    await page.route(/\/api\/(network|evm\/compat)\//, async (route) => {
      const url = new URL(route.request().url());
      const sub = url.pathname.replace(/^\/api\/(network|evm\/compat)\//, "");
      let body = {};
      if (sub === "health") body = { chainId: "97401", status: "ok", height: 100 };
      else if (sub === "metrics") body = { height: 100, finalizedHeight: 99 };
      else if (sub.endsWith("/transactions")) body = [];
      else if (sub.startsWith("address/")) body = { balance: 10, nonce: 0, balances: {} };
      else if (sub === "assets") body = [];
      else if (sub === "nfts") body = [];
      await route.fulfill({ json: body });
    });
  });

  test("390px EN/RU pay on Base", async ({ page }) => {
    await seedAndUnlockWallet(page);
    await page.setViewportSize({ width: 390, height: 844 });
    for (const [lang, file] of [
      ["en", "buy-390-en-base.png"],
      ["ru", "buy-390-ru-base.png"],
    ]) {
      await page.goto(`${BASE}/buy`, { waitUntil: "networkidle" });
      await setLang(page, lang);
      await page.reload({ waitUntil: "networkidle" });
      await page.getByTestId("pay-mode-base").click();
      await expect(page.getByTestId("buy-form-hero")).toBeVisible();
      await page.screenshot({ path: path.join(OUT, file), fullPage: true });
    }
  });

  test("390px locale viewport evidence (RU v2 + why v3)", async ({ browser }) => {
    const { page: ruPage, context: ruCtx } = await openBuyInLocale(browser, "ru");
    await expect(ruPage.getByRole("heading", { level: 1 })).toHaveText(HERO_HEADLINE.ru);
    await expect(ruPage.getByTestId("buy-why-price-rises")).toContainText("Почему растёт цена");
    await ruPage.evaluate(() => window.scrollTo(0, 0));
    await ruPage.screenshot({ path: path.join(OUT, "buy-390-ru-top-v2.png"), fullPage: false });
    const ruWhy = ruPage.getByTestId("buy-why-price-rises");
    await ruWhy.scrollIntoViewIfNeeded();
    await expect(ruPage.getByTestId("buy-why-curve-chart")).toBeVisible();
    await ruPage.screenshot({ path: path.join(OUT, "buy-390-ru-why-v2.png"), fullPage: false });
    await ruPage.screenshot({ path: path.join(OUT, "ru-why-v3.png"), fullPage: false });
    await ruPage.screenshot({ path: path.join(OUT, "ru-why-v4.png"), fullPage: false });
    await ruCtx.close();

    const ctx360 = await browser.newContext({
      viewport: { width: 360, height: 800 },
      locale: "ru-RU",
    });
    await ctx360.addCookies([{ name: "people_lang", value: "ru", url: BASE, sameSite: "Lax" }]);
    await ctx360.addInitScript(() => {
      localStorage.setItem("people_lang", "ru");
      document.cookie = "people_lang=ru; path=/; max-age=31536000; SameSite=Lax";
    });
    const page360 = await ctx360.newPage();
    await installApiMocks(page360);
    await page360.goto(`${BASE}/buy`, { waitUntil: "networkidle" });
    await waitForBuyHeroLocale(page360, "ru");
    const why360 = page360.getByTestId("buy-why-price-rises");
    await why360.scrollIntoViewIfNeeded();
    await expect(page360.getByTestId("buy-why-curve-chart")).toBeVisible();
    await page360.screenshot({ path: path.join(OUT, "ru-why-360-v4.png"), fullPage: false });
    await ctx360.close();

    const { page: enPage, context: enCtx } = await openBuyInLocale(browser, "en");
    await expect(enPage.getByRole("heading", { level: 1 })).toHaveText(HERO_HEADLINE.en);
    const enWhy = enPage.getByTestId("buy-why-price-rises");
    await enWhy.scrollIntoViewIfNeeded();
    await expect(enPage.getByTestId("buy-why-curve-chart")).toBeVisible();
    await enPage.screenshot({ path: path.join(OUT, "en-why-v3.png"), fullPage: false });
    await enCtx.close();
  });

  test("390px EN bridge widget (Solana if available)", async ({ page }) => {
    await seedAndUnlockWallet(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/buy`, { waitUntil: "networkidle" });
    await openBridgeWidget(page);
    await page.screenshot({ path: path.join(OUT, "buy-390-en-widget-open.png"), fullPage: true });
  });

  test("desktop EN bridge widget open", async ({ page }) => {
    await seedAndUnlockWallet(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${BASE}/buy`, { waitUntil: "networkidle" });
    await openBridgeWidget(page);
    await page.screenshot({ path: path.join(OUT, "buy-desktop-en-widget-open.png"), fullPage: false });
  });

  test("/ru/buy redirects to /buy with ru cookie", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addInitScript(() => {
      localStorage.setItem("people_lang", "ru");
      document.cookie = "people_lang=ru; path=/; max-age=31536000; SameSite=Lax";
    });
    const page = await context.newPage();
    await installApiMocks(page);
    await page.goto(`${BASE}/ru/buy`, { waitUntil: "networkidle" });
    expect(page.url()).toMatch(/\/buy$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(HERO_HEADLINE.ru);
    await page.screenshot({ path: path.join(OUT, "buy-ru-redirect.png"), fullPage: true });
    await context.close();
  });
});

function buyHero(page) {
  return page.getByTestId("buy-form-hero");
}

test.describe("buy USDT evidence", () => {
  test.beforeAll(async () => {
    await mkdir(OUT, { recursive: true });
  });

  test.beforeEach(async ({ page }) => {
    await installApiMocks(page);
  });

  test("usdt-390-selector", async ({ page }) => {
    await seedAndUnlockWallet(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/buy`, { waitUntil: "networkidle" });
    await buyHero(page).getByTestId("pay-mode-base").click();
    await buyHero(page).getByTestId("buy-stable-select").selectOption("USDT");
    await expect(buyHero(page).getByTestId("buy-usdt-note")).toBeVisible();
    await page.screenshot({ path: path.join(OUT, "usdt-390-selector.png"), fullPage: false });
  });

  test("usdt-390-base-swap", async ({ page }) => {
    await seedAndUnlockWallet(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/buy`, { waitUntil: "networkidle" });
    await buyHero(page).getByTestId("pay-mode-base").click();
    await buyHero(page).getByTestId("buy-stable-select").selectOption("USDT");
    await expect(buyHero(page).getByTestId("buy-usdt-swap-panel")).toBeVisible({ timeout: 90_000 });
    await expect(buyHero(page).getByTestId("buy-lifi-widget-usdt")).toBeVisible({ timeout: 90_000 });
    await page.screenshot({ path: path.join(OUT, "usdt-390-base-swap.png"), fullPage: true });
  });

  test("usdt-390-bridge-widget", async ({ page }) => {
    await seedAndUnlockWallet(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/buy`, { waitUntil: "networkidle" });
    await openBridgeWidget(page);
    await page.screenshot({ path: path.join(OUT, "usdt-390-bridge-widget.png"), fullPage: true });
  });

  test("usdt-390-ru-base-swap", async ({ page }) => {
    await seedAndUnlockWallet(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/buy`, { waitUntil: "networkidle" });
    await setLang(page, "ru");
    await page.reload({ waitUntil: "networkidle" });
    await buyHero(page).getByTestId("pay-mode-base").click();
    await buyHero(page).getByTestId("buy-stable-select").selectOption("USDT");
    await expect(buyHero(page).getByTestId("buy-usdt-swap-panel")).toBeVisible({ timeout: 90_000 });
    await page.screenshot({ path: path.join(OUT, "usdt-390-ru-base-swap.png"), fullPage: true });
  });

  test("usdt-desktop-selector", async ({ page }) => {
    await seedAndUnlockWallet(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${BASE}/buy`, { waitUntil: "networkidle" });
    await buyHero(page).getByTestId("pay-mode-base").click();
    await buyHero(page).getByTestId("buy-stable-select").selectOption("USDT");
    await expect(buyHero(page).getByTestId("buy-usdt-note")).toBeVisible();
    await page.screenshot({ path: path.join(OUT, "usdt-desktop-selector.png"), fullPage: false });
  });

  test("usdt-desktop-base-swap", async ({ page }) => {
    await seedAndUnlockWallet(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${BASE}/buy`, { waitUntil: "networkidle" });
    await buyHero(page).getByTestId("pay-mode-base").click();
    await buyHero(page).getByTestId("buy-stable-select").selectOption("USDT");
    await expect(buyHero(page).getByTestId("buy-lifi-widget-usdt")).toBeVisible({ timeout: 90_000 });
    await page.screenshot({ path: path.join(OUT, "usdt-desktop-base-swap.png"), fullPage: false });
  });

  test("usdt-desktop-bridge-widget", async ({ page }) => {
    await seedAndUnlockWallet(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${BASE}/buy`, { waitUntil: "networkidle" });
    await openBridgeWidget(page);
    await page.screenshot({ path: path.join(OUT, "usdt-desktop-bridge-widget.png"), fullPage: false });
  });
});
