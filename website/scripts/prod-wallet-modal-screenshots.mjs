import { chromium, devices } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const base = process.env.SCREENSHOT_BASE ?? "https://www.peopleblockchain.network";
const outDir = "/opt/cursor/artifacts/screenshots";

async function prime(page, lang) {
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
  await page.evaluate((l) => {
    localStorage.setItem("ovn_lang", l);
    localStorage.setItem("ovn_theme", "dark");
  }, lang);
  await page.reload({ waitUntil: "networkidle" });
}

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
try {
  for (const [w, h, file] of [
    [1440, 900, "prod-wallet-modal-ru-desktop-1440.png"],
    [375, 812, "prod-wallet-modal-ru-mobile-375.png"],
  ]) {
    const context = await browser.newContext({
      viewport: { width: w, height: h },
      ...(w === 375 ? devices["iPhone 12"] : {}),
    });
    const page = await context.newPage();
    await prime(page, "ru");
    await page.getByTestId("home-wallet-auth-cta").first().click();
    await page.locator("dialog[open]").waitFor({ timeout: 20000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${outDir}/${file}`, fullPage: false });
    await context.close();
  }
} finally {
  await browser.close();
}
console.log("Prod screenshots saved to", outDir);
