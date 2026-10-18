import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const base = process.env.SCREENSHOT_BASE ?? "http://localhost:3000";
const outDir = "/opt/cursor/artifacts/screenshots";

async function prime(page, path = "/") {
  await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.setItem("people_lang", "ru");
    localStorage.setItem("people_theme", "dark");
    localStorage.removeItem("people-wallets");
  });
  await page.reload({ waitUntil: "networkidle" });
}

async function createWalletInModal(page) {
  await page.locator('[data-testid="header-sign-in"]:visible').first().click();
  await page.locator("dialog[open]").waitFor();
  await page.getByRole("button", { name: "Создать кошелёк" }).first().click();
  const words = await page.locator("dialog ol li").allTextContents();
  await page.getByRole("button", { name: /записал фразу/i }).click();
  const parsed = words.map((line) => line.replace(/^\d+\.\s*/, "").trim());
  const labels = page.locator("dialog label").filter({ hasText: "Слово" });
  const count = await labels.count();
  for (let i = 0; i < count; i++) {
    const label = labels.nth(i);
    const text = await label.textContent();
    const match = text?.match(/Слово\s+(\d+)/);
    if (!match) continue;
    const idx = Number(match[1]);
    await label.locator("input").fill(parsed[idx - 1] ?? "");
  }
  await page.getByRole("button", { name: "Далее" }).click();
  await page.locator('input[type="password"]').first().fill("testpass12");
  await page.locator('input[type="password"]').nth(1).fill("testpass12");
  await page.getByRole("button", { name: "Создать кошелёк" }).last().click();
  await page.waitForSelector('[data-testid="header-wallet-menu-trigger"]', { state: "visible", timeout: 120000 });
}

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();

const beforeDesktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await prime(beforeDesktop);
await beforeDesktop.screenshot({ path: `${outDir}/header-before-connect-ru-desktop-1440.png` });
await beforeDesktop.close();

const beforeMobile = await browser.newPage({ viewport: { width: 375, height: 812 } });
await prime(beforeMobile);
await beforeMobile.screenshot({ path: `${outDir}/header-before-connect-ru-mobile-375.png` });
await beforeMobile.close();

const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const connected = await ctx.newPage();
await prime(connected);
await createWalletInModal(connected);
await connected.getByTestId("header-wallet-menu-trigger").click();
await connected.locator('ul[role="menu"]').waitFor();
await connected.screenshot({ path: `${outDir}/header-after-connect-menu-ru-desktop-1440.png` });
await connected.locator('button.fixed.inset-0.z-40').click({ force: true });

await connected.setViewportSize({ width: 375, height: 812 });
await connected.getByTestId("header-wallet-menu-trigger").click();
await connected.locator('ul[role="menu"]').waitFor();
await connected.screenshot({ path: `${outDir}/header-after-connect-menu-ru-mobile-375.png` });

await ctx.close();
await browser.close();
console.log("Header screenshots saved");
