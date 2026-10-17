import assert from "node:assert/strict";
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
    localStorage.setItem("ovn_lang", l);
    document.cookie = `ovn_lang=${l}; path=/`;
    window.dispatchEvent(new StorageEvent("storage", { key: "ovn_lang" }));
  }, lang);
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

  test("390px RU top viewport — header must not cover hero", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/buy`, { waitUntil: "networkidle" });
    await setLang(page, "ru");
    await page.reload({ waitUntil: "networkidle" });
    await page.evaluate(() => window.scrollTo(0, 0));

    const metrics = await page.evaluate(() => {
      const header = document.querySelector("header.glass-bar");
      const hero = document.getElementById("buy-hero-title");
      const stats = document.querySelector('[data-testid="sale-stats"]');
      const headerRect = header?.getBoundingClientRect();
      const heroRect = hero?.getBoundingClientRect();
      const statsRect = stats?.getBoundingClientRect();
      const headerBottom = headerRect?.bottom ?? 0;
      return {
        headerBottom,
        heroTop: heroRect?.top ?? 0,
        statsBottom: statsRect?.bottom ?? 0,
        raisedVisible: Boolean(
          [...document.querySelectorAll("[data-testid=sale-stats] dt")].some((el) =>
            /raised|собрано/i.test(el.textContent ?? ""),
          ),
        ),
        progressVisible: Boolean(document.querySelector('[data-testid="sale-stats"] [role="progressbar"]')),
      };
    });

    assert.ok(metrics.heroTop >= metrics.headerBottom - 1, "hero title must sit below sticky header");
    assert.ok(!metrics.raisedVisible, "raised stat card must be removed");
    assert.ok(!metrics.progressVisible, "graduation progress bar must be removed");

    await page.screenshot({
      path: path.join(OUT, "buy-390-ru-top.png"),
      fullPage: false,
    });
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

  test("/ru/buy redirects to /buy", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/ru/buy`, { waitUntil: "networkidle" });
    expect(page.url()).toMatch(/\/buy$/);
    await page.screenshot({ path: path.join(OUT, "buy-ru-redirect.png"), fullPage: true });
  });
});
