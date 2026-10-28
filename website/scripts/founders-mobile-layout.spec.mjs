import assert from "node:assert/strict";
import { test, expect } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";
const WIDTHS = [360, 390, 1280];

const MOCK_STATS = {
  verifiedCount: 12,
  goal: 1_000_000,
  countries: [],
  programPoolPpl: 50_000_000,
  seasonPoolPpl: 20_000_000,
  totalPoints: 0,
  estimatedPplPerPoint: null,
};
const MOCK_ME = {
  signedIn: true,
  userId: "e2e",
  verifiedHuman: true,
  founder: { founderNumber: 7, countryCode: "GE", entryMultiplier: 5, totalPoints: 0, verificationLevel: 1 },
  demoAirdrop: { state: "disabled" },
};
const MOCK_REFERRAL = {
  referralWallet: "0xabcdef1234567890abcdef1234567890abcdef12",
  maxActiveInvitees: 50,
  ambassador: false,
  invitees: [{ founderNumber: 9, status: "inactive", verified: true, l1Points: 0 }],
  activeCount: 0,
  inactiveCount: 1,
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

async function setLocale(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("people_lang", "en");
    } catch {
      /* ignore */
    }
  });
}

/**
 * Mobile: the whole document must not scroll sideways.
 * Desktop: only the /bounty founders content is checked. The shared site header
 * is exactly 1280px wide at 1280 and its width varies with the Chromium build;
 * that is covered by the header specs, not by this page.
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

test.describe("bounty page layout", () => {
  for (const width of WIDTHS) {
    test(`/bounty logged out @ ${width}px`, async ({ page }) => {
      await setLocale(page);
      await page.setViewportSize({ width, height: 800 });
      await page.goto(`${BASE}/bounty`, { waitUntil: "networkidle" });

      await expect(page.getByRole("heading", { level: 1 })).toContainText("Earn PPL with PEOPLE");
      await expect(page.getByTestId("bounty-hero")).toBeVisible();
      await expect(page.getByTestId("bounty-hero-buy")).toBeVisible();
      await expect(page.getByText(/World ID/)).toHaveCount(0);
      await assertNoOverflow(page, `/bounty@${width}px`, width);
    });

    test(`/bounty logged in (mocked) @ ${width}px`, async ({ page }) => {
      await setLocale(page);
      await page.route("**/api/founders/million-counter", (r) =>
        r.fulfill({ json: { current: MOCK_STATS.verifiedCount, goal: MOCK_STATS.goal, source: "verified" } }),
      );
      await page.route("**/api/founders/me", (r) => r.fulfill({ json: MOCK_ME }));
      await page.route("**/api/founders/referral", (r) => r.fulfill({ json: MOCK_REFERRAL }));
      await page.setViewportSize({ width, height: 800 });
      await page.goto(`${BASE}/bounty`, { waitUntil: "networkidle" });

      await expect(page.getByTestId("founders-personal")).toBeVisible();
      await expect(page.getByTestId("founders-active-count")).toContainText("0/50");
      await expect(page.getByTestId("founders-verification").getByRole("heading", { level: 2 })).toBeVisible();
      await expect(page.getByTestId("founders-page")).toBeVisible();
      await assertNoOverflow(page, `/bounty logged in@${width}px`, width);
    });
  }
});
