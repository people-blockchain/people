import { mkdir } from "node:fs/promises";
import path from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";

const OUT =
  process.env.GOVERNANCE_EVIDENCE_DIR ??
  path.resolve(dirname(fileURLToPath(import.meta.url)), "../docs/screenshots/governance");

const PROPOSAL = {
  id: "1",
  messages: [],
  status: "PROPOSAL_STATUS_VOTING_PERIOD",
  final_tally_result: { yes_count: "0", abstain_count: "0", no_count: "0", no_with_veto_count: "0" },
  submit_time: "2026-10-01T00:00:00Z",
  deposit_end_time: "2026-10-08T00:00:00Z",
  total_deposit: [{ denom: "appl", amount: "10000000" }],
  voting_start_time: "2026-10-01T00:10:00Z",
  voting_end_time: "2026-10-15T00:10:00Z",
  metadata: "",
  title: "Raise validator set size to 7",
  summary: "This proposal increases the active validator set from 5 to 7 to improve decentralization ahead of mainnet.",
  proposer: "people1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqyhc2qe",
  expedited: false,
};

const TALLY = { yes_count: "68000000000000000000", no_count: "12000000000000000000", abstain_count: "4000000000000000000", no_with_veto_count: "1000000000000000000" };
const VOTING_PARAMS = {
  voting_params: { voting_period: "172800s" },
  params: {
    min_deposit: [{ denom: "appl", amount: "10000000" }],
    max_deposit_period: "172800s",
    voting_period: "172800s",
    quorum: "0.334000000000000000",
    threshold: "0.500000000000000000",
    veto_threshold: "0.334000000000000000",
  },
};
const POOL = { pool: { not_bonded_tokens: "0", bonded_tokens: "200000000000000000000" } };

async function routeGov(page) {
  await page.route("https://node.peopleblockchain.network/**", (route) => {
    const url = route.request().url();
    if (url.includes("/proposals/1/tally")) {
      return route.fulfill({ json: { tally: TALLY } });
    }
    if (url.includes("/proposals/1/votes/")) {
      return route.fulfill({ status: 404, json: { code: 5, message: "not found" } });
    }
    if (url.includes("/gov/v1/proposals")) {
      return route.fulfill({ json: { proposals: [PROPOSAL], pagination: { next_key: null, total: "1" } } });
    }
    if (url.includes("/gov/v1/params/voting")) {
      return route.fulfill({ json: VOTING_PARAMS });
    }
    if (url.includes("/staking/v1beta1/pool")) {
      return route.fulfill({ json: POOL });
    }
    return route.continue();
  });
}

test.beforeAll(async () => {
  await mkdir(OUT, { recursive: true });
});

const VIEWPORTS = [
  { width: 360, height: 740, label: "360" },
  { width: 390, height: 844, label: "390" },
  { width: 1280, height: 900, label: "1280" },
];
const THEMES = ["light", "dark"];

for (const theme of THEMES) {
  for (const viewport of VIEWPORTS) {
    test(`governance list + detail @ ${viewport.label} ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.addInitScript((t) => {
        window.localStorage.setItem("ovn_theme", t);
      }, theme);
      await routeGov(page);

      await page.goto("/governance");
      await expect(page.getByTestId("governance-proposal-row").first()).toBeVisible();
      await page.waitForTimeout(150);
      await page.screenshot({ path: path.join(OUT, `governance-list-${theme}-${viewport.label}.png`), fullPage: true });

      await page.getByTestId("governance-proposal-row").first().click();
      await expect(page.getByText("Raise validator set size to 7")).toBeVisible();
      await page.waitForTimeout(150);
      await page.screenshot({ path: path.join(OUT, `governance-detail-${theme}-${viewport.label}.png`), fullPage: true });

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth, `horizontal overflow at ${viewport.label} ${theme}`).toBeLessThanOrEqual(clientWidth + 1);
    });
  }
}
