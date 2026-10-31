import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { test } from "@playwright/test";

const PORT = process.env.PORT ?? "3517";
if (PORT === "3000") {
  throw new Error("founders map screenshots must not use port 3000; set PORT (default 3517)");
}

const OUT = process.env.FOUNDERS_MAP_SHOT_DIR ?? join(process.env.HOME ?? "", "agent-work/tmp");

const MOCK_COUNTER = {
  current: 42,
  goal: 1_000_000,
  verifiedCount: 42,
  source: "verified",
  countries: [
    { countryCode: "US", count: 12 },
    { countryCode: "DE", count: 8 },
    { countryCode: "GE", count: 3 },
  ],
  byCountry: { US: 12, DE: 8, GE: 3 },
};

const MOCK_MAP = {
  verifiedCount: 42,
  goal: 1_000_000,
  countries: MOCK_COUNTER.countries,
  byCountry: MOCK_COUNTER.byCountry,
  available: true,
};

const MOCK_ME = { signedIn: false, verifiedHuman: false, founder: null };

const widths = [
  { w: 360, h: 740, file: "founders-map-360.png" },
  { w: 390, h: 844, file: "founders-map-390.png" },
  { w: 1440, h: 900, file: "founders-map-1440.png" },
];

test.beforeAll(async () => {
  await mkdir(OUT, { recursive: true });
});

for (const { w, h, file } of widths) {
  test(`founders map screenshot ${w}px`, async ({ page }) => {
    await page.route("**/api/founders/million-counter", (route) =>
      route.fulfill({ contentType: "application/json", body: JSON.stringify(MOCK_COUNTER) }),
    );
    await page.route("**/api/founders/map", (route) =>
      route.fulfill({ contentType: "application/json", body: JSON.stringify(MOCK_MAP) }),
    );
    await page.route("**/api/founders/me", (route) =>
      route.fulfill({ contentType: "application/json", body: JSON.stringify(MOCK_ME) }),
    );
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/founders", { waitUntil: "domcontentloaded" });
    await page.locator("[data-testid=founders-million-counter]").waitFor({ state: "visible", timeout: 60_000 });
    await page.locator("[data-testid=founders-world-map]").scrollIntoViewIfNeeded();
    await page.locator("[data-testid=founders-world-map]").waitFor({ state: "visible", timeout: 60_000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(OUT, file), fullPage: true });
  });
}
