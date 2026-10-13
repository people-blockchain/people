import { test, expect } from "@playwright/test";

// Regression for a bug where the desktop nav's "How It Works"/"Discover"
// links moved from the compact dropdown into the inline bar exactly at the
// `xl` breakpoint (1280px) — the same width as the header's `max-w-7xl`
// container, so there was no slack left to absorb the extra width, and the
// page overflowed horizontally by ~27px at exactly 1280px (see Navbar.tsx).
const WIDTHS = [360, 390, 1280, 1366, 1920];
// `/docs` was added after the live pass found a long bare URL in a docs
// paragraph widening the page by 29px at 360 (fixed with `break-words`).
const PATHS = ["/", "/founders", "/tokenomics", "/swap", "/explorer", "/wallet", "/docs"];

test.describe("no horizontal overflow", () => {
  for (const path of PATHS) {
    for (const width of WIDTHS) {
      test(`${path} @ ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path, { waitUntil: "networkidle" });
        const { scrollWidth, innerWidth } = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
        }));
        expect(scrollWidth, `document.scrollWidth (${scrollWidth}) > innerWidth (${innerWidth}) at ${path}`).toBeLessThanOrEqual(
          innerWidth
        );
      });
    }
  }
});
