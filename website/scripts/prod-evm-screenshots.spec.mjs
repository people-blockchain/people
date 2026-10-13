import { test } from "@playwright/test";
import path from "node:path";

const base = process.env.PROD_SCREENSHOT_BASE ?? "https://www.peopleblockchain.network";
const outDir = "/opt/cursor/artifacts/screenshots";

const pages = [
  { name: "explorer-prod-ru-desktop-1440", path: "/explorer?lang=ru", width: 1440, height: 900 },
  { name: "wallet-prod-ru-mobile-375", path: "/wallet?lang=ru", width: 375, height: 812 },
  { name: "swap-prod-ru-desktop-1440", path: "/swap?lang=ru", width: 1440, height: 900 },
  { name: "factory-prod-ru-mobile-375", path: "/create/token?lang=ru", width: 375, height: 812 },
];

for (const p of pages) {
  test(p.name, async ({ page }) => {
    await page.setViewportSize({ width: p.width, height: p.height });
    await page.goto(`${base}${p.path}`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: path.join(outDir, `${p.name}.png`), fullPage: true });
  });
}
