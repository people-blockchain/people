import { mkdir } from "node:fs/promises";
import path from "node:path";
import { test, expect } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";
const OUT =
  process.env.PARTNER_ADMIN_SCREENSHOT_DIR ??
  path.resolve(process.cwd(), "docs/screenshots/partner-admin");

test.beforeAll(async () => {
  await mkdir(OUT, { recursive: true });
});

test("non-admin /admin/partners shows not-found @ 1280px", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const res = await page.goto(`${BASE}/admin/partners`, { waitUntil: "domcontentloaded" });
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "This page could not be found." })).toBeVisible();
  await page.screenshot({
    path: path.join(OUT, "partners-admin-forbidden-1280.png"),
    fullPage: true,
  });
});

test("admin partners panel fixture @ 1280px", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE}/admin/partners/fixture`, { waitUntil: "networkidle" });
  await expect(page.getByTestId("partner-admin-summary")).toBeVisible({ timeout: 15_000 });
  await page.screenshot({
    path: path.join(OUT, "partners-admin-1280.png"),
    fullPage: true,
  });
});

test("admin partners tier override on fixture detail @ 1280px", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE}/admin/partners/fixture`, { waitUntil: "networkidle" });
  await page.getByText("kol1@example.com").click();
  const tierField = page.getByTestId("partner-admin-tier-override");
  await expect(tierField).toBeVisible({ timeout: 15_000 });
  await expect(tierField).toContainText("900");
  await page.screenshot({
    path: path.join(OUT, "partners-admin-tier-override-1280.png"),
    fullPage: true,
  });
});
