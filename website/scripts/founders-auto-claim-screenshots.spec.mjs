import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";
const OUT =
  process.env.FOUNDERS_EVIDENCE_DIR ??
  path.resolve(dirname(fileURLToPath(import.meta.url)), "../../docs/pr-evidence/founders-auto-claim-20261006");

const MOCK_STATS = {
  verifiedCount: 12,
  goal: 1_000_000,
  countries: [],
  programPoolPpl: 50_000_000,
  seasonPoolPpl: 20_000_000,
  totalPoints: 0,
  estimatedPplPerPoint: null,
};
const MOCK_ME_LOGGED_OUT = { signedIn: false, verifiedHuman: false, founder: null };
const MOCK_ME_READY = { signedIn: true, userId: "e2e", verifiedHuman: true, founder: null, demoAirdrop: { state: "ineligible" } };
const MOCK_ME_FOUNDER = {
  signedIn: true,
  userId: "e2e",
  verifiedHuman: true,
  founder: { founderNumber: 2, countryCode: "GE", entryMultiplier: 5, totalPoints: 0, verificationLevel: 1 },
  demoAirdrop: { state: "disabled" },
};
const MOCK_REFERRAL = {
  referralWallet: "0xabcdef1234567890abcdef1234567890abcdef12",
  maxActiveInvitees: 50,
  ambassador: false,
  invitees: [],
  activeCount: 0,
  inactiveCount: 0,
  l1Points: 0,
  l2Points: 0,
  extraPoints: 0,
  totalPoints: 0,
  todayPoints: 0,
  dailyCap: 1000,
  pool: { seasonPoolPpl: 6_000_000, spentPpl: 0, remainingPpl: 6_000_000 },
  vesting: { totalPpl: 0, vestedPpl: 0, claimedPpl: 0, claimablePpl: 0 },
  issuerAssets: [],
};

async function setLocale(page, lang) {
  await page.addInitScript((value) => {
    try {
      localStorage.setItem("ovn_lang", value);
    } catch {
      /* ignore */
    }
  }, lang);
}

async function routeFounders(page, me) {
  await page.route("**/api/founders/million-counter", (r) =>
    r.fulfill({ json: { current: MOCK_STATS.verifiedCount, goal: MOCK_STATS.goal, source: "verified" } }),
  );
  await page.route("**/api/founders/me", (r) => r.fulfill({ json: me }));
  await page.route("**/api/founders/referral", (r) => r.fulfill({ json: MOCK_REFERRAL }));
}

/**
 * Same rule as `founders-mobile-layout.spec.mjs`: mobile checks the whole document, desktop
 * checks only the `/founders` content because the shared site header is ~1280px wide and varies
 * with the Chromium build. The header is covered by the header specs, not here.
 */
async function assertNoOverflow(page, label, width) {
  const overflow = await page.evaluate((desktop) => {
    if (!desktop) return document.documentElement.scrollWidth - window.innerWidth;
    const root = document.querySelector('[data-testid="founders-page"]');
    let right = root.getBoundingClientRect().right;
    for (const el of root.querySelectorAll("*")) right = Math.max(right, el.getBoundingClientRect().right);
    return Math.max(root.scrollWidth - root.clientWidth, Math.round(right - window.innerWidth));
  }, width >= 1024);
  assert.ok(overflow <= 2, `${label}: horizontal overflow ${overflow}px`);
}

test.beforeAll(async () => {
  await mkdir(OUT, { recursive: true });
});

test.describe("founders auto-claim evidence", () => {
  for (const width of [360, 390, 1280]) {
    test(`logged-out hero @ ${width}px`, async ({ page }) => {
      await setLocale(page, "en");
      await routeFounders(page, MOCK_ME_LOGGED_OUT);
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${BASE}/founders`, { waitUntil: "networkidle" });
      await expect(page.getByTestId("founders-cta-claim")).toBeVisible();
      await assertNoOverflow(page, `logged-out@${width}`, width);
      await page.screenshot({ path: path.join(OUT, `founders-logged-out-${width}.png`), fullPage: true });
    });
  }

  test("auto-claim loading state (ru)", async ({ page }) => {
    await setLocale(page, "ru");
    await routeFounders(page, MOCK_ME_READY);
    // The claim never settles during the shot, so the loading state stays on screen. The
    // request therefore never closes — wait for the DOM, not `networkidle`.
    await page.route("**/api/founders/register", () => new Promise(() => {}));
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(`${BASE}/founders`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("founders-claim-loading")).toContainText("Выдаём номер основателя");
    await assertNoOverflow(page, "claim-loading", 390);
    await page.screenshot({ path: path.join(OUT, "founders-claim-loading-ru-390.png"), fullPage: true });
  });

  test("success block, no extra click (ru)", async ({ page }) => {
    await setLocale(page, "ru");
    await routeFounders(page, MOCK_ME_FOUNDER);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${BASE}/founders`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("founders-personal")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Привет, ты основатель №2");
    await expect(page.getByTestId("founders-referral")).toBeVisible();
    await expect(page.getByTestId("founders-country-edit")).toBeVisible();
    await assertNoOverflow(page, "success@1280", 1280);
    await page.screenshot({ path: path.join(OUT, "founders-success-ru-1280.png"), fullPage: true });
  });

  test("claim error with retry (en)", async ({ page }) => {
    await setLocale(page, "en");
    await routeFounders(page, MOCK_ME_READY);
    await page.route("**/api/founders/register", (r) => r.fulfill({ status: 500, json: { error: "boom" } }));
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(`${BASE}/founders`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("founders-claim-error")).toBeVisible();
    await expect(page.getByTestId("founders-claim-retry")).toContainText("Try again");
    await assertNoOverflow(page, "claim-error", 390);
    await page.screenshot({ path: path.join(OUT, "founders-claim-error-en-390.png"), fullPage: true });
  });
});
