import { chromium } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3100";
const OUT = "docs/screenshots/staking";
const WIDTHS = [360, 390, 1280];

const browser = await chromium.launch();
for (const theme of ["light", "dark"]) {
  for (const width of WIDTHS) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: theme });
    await page.goto(`${BASE}/staking`, { waitUntil: "networkidle" });
    await page.evaluate((t) => {
      document.documentElement.classList.remove("dark", "light");
      document.documentElement.classList.add(t);
      localStorage.setItem("people_theme", t);
    }, theme);
    await page.reload({ waitUntil: "networkidle" });
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    console.log(`width=${width} theme=${theme} scrollWidth=${scrollWidth} clientWidth=${clientWidth} overflow=${scrollWidth > clientWidth}`);
    await page.screenshot({ path: `${OUT}/staking-${width}-${theme}.png`, fullPage: true });
    await page.close();
  }
}
await browser.close();
