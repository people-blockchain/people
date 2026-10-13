/**
 * Rasterise one social-card HTML file with headless Chromium.
 *
 * Used by `generate-og-images.py`. Kept in Node because the card is laid out
 * with the real CSS engine and the site's own fonts, so the exported JPEG
 * cannot drift from what the browser would paint.
 *
 *   node render-card.mjs <in.html> <out.png> <width> <height> <scale>
 */
import { existsSync } from "node:fs";
import { createRequire } from "node:module";

const [htmlPath, outPath, width, height, scale] = process.argv.slice(2);
if (!htmlPath || !outPath) {
  console.error("usage: render-card.mjs <in.html> <out.png> <w> <h> <scale>");
  process.exit(2);
}

/** Playwright is not a project dependency; fall back to a global install. */
async function loadChromium() {
  try {
    return (await import("playwright")).chromium;
  } catch {
    const require = createRequire(import.meta.url);
    const candidates = [
      process.env.PLAYWRIGHT_MODULE,
      `${process.env.HOME}/.npm-global/lib/node_modules/playwright`,
      "/usr/local/lib/node_modules/playwright",
    ].filter(Boolean);
    for (const candidate of candidates) {
      if (existsSync(candidate)) return require(candidate).chromium;
    }
    throw new Error(
      "playwright not found — install it locally or set PLAYWRIGHT_MODULE to its path"
    );
  }
}

const chromium = await loadChromium();
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: Number(width), height: Number(height) },
  deviceScaleFactor: Number(scale),
});
await page.goto(`file://${htmlPath}`, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: outPath, type: "png" });
await browser.close();
