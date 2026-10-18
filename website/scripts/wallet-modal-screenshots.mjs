import { chromium, devices } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const base = process.env.SCREENSHOT_BASE ?? "http://localhost:3000";
const outDir = "/opt/cursor/artifacts/screenshots";

async function prime(page, lang, path = "/") {
  await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded" });
  await page.evaluate((l) => {
    localStorage.setItem("people_lang", l);
    localStorage.setItem("people_theme", "dark");
  }, lang);
  await page.reload({ waitUntil: "networkidle" });
}

async function captureModal(page, filename) {
  const trigger = page.getByTestId("home-wallet-auth-cta").first();
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  await page.locator("dialog[open]").waitFor({ timeout: 15000 });
  await page.screenshot({ path: `${outDir}/${filename}` });
  await page.keyboard.press("Escape");
}

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
try {
  for (const [lang, modalName] of [
    ["ru", "wallet-modal-ru-desktop-1440.png"],
    ["en", "wallet-modal-en-desktop-1440.png"],
  ]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await prime(page, lang);
    await captureModal(page, modalName);
    await context.close();
  }
  for (const [lang, modalName] of [
    ["ru", "wallet-modal-ru-mobile-375.png"],
    ["en", "wallet-modal-en-mobile-375.png"],
  ]) {
    const context = await browser.newContext({
      ...devices["iPhone 12"],
      viewport: { width: 375, height: 812 },
    });
    const page = await context.newPage();
    await prime(page, lang);
    await captureModal(page, modalName);
    await context.close();
  }
  for (const [lang, file] of [
    ["ru", "home-hero-wallet-cta-ru-desktop-1440.png"],
    ["en", "home-hero-wallet-cta-en-desktop-1440.png"],
  ]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await prime(page, lang);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    await page.screenshot({
      path: `${outDir}/${file}`,
      fullPage: false,
      clip: { x: 0, y: 0, width: 1440, height: 900 },
    });
    await context.close();
  }
  for (const [lang, file] of [
    ["ru", "home-hero-wallet-cta-ru-mobile-375.png"],
  ]) {
    const context = await browser.newContext({
      ...devices["iPhone 12"],
      viewport: { width: 375, height: 812 },
    });
    const page = await context.newPage();
    await prime(page, lang);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    await page.screenshot({
      path: `${outDir}/${file}`,
      fullPage: false,
      clip: { x: 0, y: 0, width: 375, height: 812 },
    });
    await context.close();
  }
  for (const [lang, file] of [
    ["ru", "home-footer-wallet-cta-ru-mobile-375.png"],
    ["en", "home-footer-wallet-cta-en-mobile-375.png"],
  ]) {
    const context = await browser.newContext({
      ...devices["iPhone 12"],
      viewport: { width: 375, height: 812 },
    });
    const page = await context.newPage();
    await prime(page, lang);
    await page.locator("[data-testid='home-footer-wallet-auth-cta']").scrollIntoViewIfNeeded();
    await page.locator("[data-testid='home-footer-wallet-auth-cta']").screenshot({ path: `${outDir}/${file}` });
    await context.close();
  }
} finally {
  await browser.close();
}
console.log("Screenshots saved to", outDir);
