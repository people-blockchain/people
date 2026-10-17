import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "@playwright/test";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "../docs/pr-evidence/founders-landing-20261016");
const MOCK_COUNTER = { current: 0, goal: 1_000_000, source: "stub" };
const MOCK_ME = { signedIn: false, verifiedHuman: false, founder: null };

const widths = [
  { w: 360, h: 740, slug: "360" },
  { w: 390, h: 844, slug: "390" },
  { w: 1440, h: 900, slug: "1440" },
];

test.beforeAll(async () => {
  await mkdir(OUT, { recursive: true });
});

for (const { w, h, slug } of widths) {
  test(`founders landing screenshot ${slug}px`, async ({ page }) => {
    await page.route("**/api/founders/million-counter", (route) =>
      route.fulfill({ contentType: "application/json", body: JSON.stringify(MOCK_COUNTER) }),
    );
    await page.route("**/api/founders/me", (route) =>
      route.fulfill({ contentType: "application/json", body: JSON.stringify(MOCK_ME) }),
    );
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/founders", { waitUntil: "networkidle" });
    await page.locator("[data-testid=founders-hero]").waitFor({ state: "visible" });
    await page.locator("[data-testid=founders-mosaic]").waitFor({ state: "visible" });
    await page.screenshot({ path: join(OUT, `founders-landing-${slug}.png`), fullPage: true });
  });
}
