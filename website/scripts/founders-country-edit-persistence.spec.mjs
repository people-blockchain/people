/**
 * Regression test: editing the country on an already-claimed founder must not touch the
 * shared `ppl_founders_country_choice` localStorage key. That key backs the *pre-claim*
 * picker only; a prior bug routed the post-claim editor through the same setter, so a
 * save attempt (successful or not) leaked into localStorage and could seed the wrong
 * country for the next not-yet-claimed sign-in on the same browser (e.g. a second account).
 */
import { test, expect } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";

const MOCK_STATS = {
  verifiedCount: 3,
  goal: 1_000_000,
  countries: [{ countryCode: "GE", founderCount: 3 }],
  programPoolPpl: 50_000_000,
  seasonPoolPpl: 20_000_000,
  totalPoints: 0,
  estimatedPplPerPoint: null,
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

function meWithCountry(countryCode) {
  return {
    signedIn: true,
    userId: "e2e",
    verifiedHuman: true,
    founder: { founderNumber: 3, countryCode, entryMultiplier: 5, totalPoints: 0, verificationLevel: 1 },
    demoAirdrop: { state: "disabled" },
  };
}

test("saving a country change in the post-claim editor never writes the pre-claim localStorage key", async ({
  page,
}) => {
  let currentCountry = "GE";

  await page.route("**/api/founders/million-counter", (r) =>
    r.fulfill({ json: { current: MOCK_STATS.verifiedCount, goal: MOCK_STATS.goal, source: "verified" } }),
  );
  await page.route("**/api/founders/referral", (r) => r.fulfill({ json: MOCK_REFERRAL }));
  await page.route("**/api/founders/me", (r) => r.fulfill({ json: meWithCountry(currentCountry) }));
  await page.route("**/api/founders/country", async (r) => {
    const body = JSON.parse(r.request().postData() ?? "{}");
    currentCountry = body.countryCode;
    await r.fulfill({ json: { ok: true, founder: meWithCountry(currentCountry).founder } });
  });

  await page.goto(`${BASE}/founders`, { waitUntil: "networkidle" });
  await expect(page.getByTestId("founders-country-edit")).toBeVisible();

  const select = page.locator('[data-testid="founders-country-edit"] select');
  await expect(select).toHaveValue("GE");

  // Re-fulfill /me with the new value once the PATCH lands, like the real API does.
  await page.unroute("**/api/founders/me");
  await page.route("**/api/founders/me", (r) => r.fulfill({ json: meWithCountry(currentCountry) }));

  await select.selectOption("DE");
  await expect(page.getByTestId("founders-country-note")).toBeVisible();
  await expect(select).toHaveValue("DE");

  const stored = await page.evaluate(() => window.localStorage.getItem("ppl_founders_country_choice"));
  expect(stored).toBeNull();
});
