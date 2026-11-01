import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

const PORT = process.env.PORT ?? "3456";
const BASE = process.env.SHOT_BASE_URL ?? `http://127.0.0.1:${PORT}`;
const OUT = "/workspace/people-v2-buy-shots";
const STATES = ["unverified", "verified", "success", "partial"];
const WIDTHS = [360, 390, 1440];

test.beforeAll(async () => {
  await mkdir(OUT, { recursive: true });
});

test("captures every v2 preview state at 360, 390 and 1440", async ({ browser }) => {
  for (const state of STATES) {
    for (const width of WIDTHS) {
      const context = await browser.newContext({
        viewport: { width, height: width === 1440 ? 1000 : 900 },
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      await page.goto(`${BASE}/buy?v2state=${state}`, { waitUntil: "networkidle" });
      const panel = page.getByTestId("buy-form-hero");
      await expect(panel).toBeVisible({ timeout: 30_000 });
      await expect(panel).toHaveAttribute("data-preview", state);
      await page.screenshot({ path: path.join(OUT, `${state}-${width}.png`), fullPage: true });
      await context.close();
    }
  }
});
