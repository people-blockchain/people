import { mkdir } from "node:fs/promises";
import path from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";
const OUT =
  process.env.FOUNDERS_EVIDENCE_DIR ??
  path.resolve(dirname(fileURLToPath(import.meta.url)), "../../docs/pr-evidence/founders-country-20261006");

const MOCK_STATS = {
  verifiedCount: 3,
  goal: 1_000_000,
  countries: [
    { countryCode: "GE", founderCount: 2 },
    { countryCode: "DE", founderCount: 1 },
  ],
  programPoolPpl: 50_000_000,
  seasonPoolPpl: 20_000_000,
  totalPoints: 0,
  estimatedPplPerPoint: null,
};
const MOCK_ME_LOGGED_OUT = { signedIn: false, verifiedHuman: false, founder: null };
const MOCK_ME_FOUNDER = {
  signedIn: true,
  userId: "e2e",
  verifiedHuman: true,
  founder: { founderNumber: 3, countryCode: "GE", entryMultiplier: 5, totalPoints: 0, verificationLevel: 1 },
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

async function routeFounders(page, me) {
  await page.route("**/api/founders/stats", (r) => r.fulfill({ json: MOCK_STATS }));
  await page.route("**/api/founders/me", (r) => r.fulfill({ json: me }));
  await page.route("**/api/founders/referral", (r) => r.fulfill({ json: MOCK_REFERRAL }));
}

test.beforeAll(async () => {
  await mkdir(OUT, { recursive: true });
});

test.describe("founders country-choice evidence", () => {
  for (const width of [360, 390, 1280]) {
    test(`logged-out top country selector @ ${width}px`, async ({ page }) => {
      await routeFounders(page, MOCK_ME_LOGGED_OUT);
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${BASE}/founders`, { waitUntil: "networkidle" });
      const picker = page.getByTestId("founders-country-choice");
      await expect(picker).toBeVisible();
      await expect(picker.locator("select")).toBeVisible();
      await page.screenshot({ path: path.join(OUT, `founders-country-choice-${width}.png`), fullPage: true });
    });

    test(`success block editable country @ ${width}px`, async ({ page }) => {
      await routeFounders(page, MOCK_ME_FOUNDER);
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${BASE}/founders`, { waitUntil: "networkidle" });
      await expect(page.getByTestId("founders-country-edit")).toBeVisible();
      await page.screenshot({ path: path.join(OUT, `founders-country-success-${width}.png`), fullPage: true });
    });
  }
});
