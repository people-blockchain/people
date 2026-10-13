import { mkdir } from "node:fs/promises";
import path from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";

/**
 * Evidence for the owner-approved audit-small batch (M05-7 sale payer binding, M20-4 free
 * icon tier). Not part of the default Playwright testMatch set — run on demand:
 *   npx playwright test scripts/audit-small-screenshots.spec.mjs
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";
const OUT =
  process.env.AUDIT_SMALL_EVIDENCE_DIR ??
  path.resolve(dirname(fileURLToPath(import.meta.url)), "../../docs/pr-evidence/audit-small-20261007");

// A tron rail (needs the payer field) plus an evm rail (must not show it).
const SALE_CONFIG = {
  soldPpl: 1_234_567,
  supplyPpl: 21_000_000,
  spotUsdt: 0.0123,
  minUsdt: 10,
  maxUsdt: 100_000,
  networks: [
    {
      id: "bsc",
      kind: "evm",
      label: "BNB Chain",
      enabled: true,
      pendingBadge: false,
      stables: ["usdt"],
      receiverAddress: "0x1111111111111111111111111111111111111111",
      saleContract: "0x2222222222222222222222222222222222222222",
    },
    {
      id: "tron",
      kind: "tron",
      label: "Tron",
      enabled: true,
      pendingBadge: false,
      stables: ["usdt"],
      receiverAddress: "TReceiverXXXXXXXXXXXXXXXXXXXXXXXXX",
    },
  ],
};

const ICON_QUOTA_INELIGIBLE = {
  enabled: true,
  presets: ["flat", "badge", "mascot"],
  freePerDay: 3,
  freeRemaining: 0,
  freeEligible: false,
  paidFeePpl: 0.1,
  paymentRequired: true,
  globalCapReached: false,
  turnstileSiteKey: null,
  feeRecipient: "0x3333333333333333333333333333333333333333",
  fluxProvider: "local",
};

test.beforeAll(async () => {
  await mkdir(OUT, { recursive: true });
});

test.describe("sale payer binding (M05-7)", () => {
  for (const width of [360, 390, 1280]) {
    test(`non-EVM checkout asks for the paying wallet @ ${width}px`, async ({ page }) => {
      await page.route("**/api/sale/config", (r) => r.fulfill({ json: SALE_CONFIG }));
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${BASE}/buy`, { waitUntil: "networkidle" });

      const payer = page.getByText("Wallet you pay from", { exact: false });
      const submit = page.getByRole("button", { name: "Create payment" });

      // Default rail is EVM: no payer field, because the on-chain Purchased event already
      // names the buyer.
      await expect(payer).toHaveCount(0);

      await page.locator("select").first().selectOption("tron");
      await expect(payer).toBeVisible();
      // M05-7: without the paying wallet the order can't be created.
      await expect(submit).toBeDisabled();
      await page.getByPlaceholder("T…").fill("TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE");
      await expect(submit).toBeEnabled();
      await page.screenshot({ path: path.join(OUT, `sale-payer-field-${width}.png`), fullPage: true });
    });
  }
});

test.describe("free icon tier requires a verified founder (M20-4)", () => {
  for (const width of [360, 390, 1280]) {
    test(`generator explains the verification requirement @ ${width}px`, async ({ page }) => {
      await page.route("**/api/factory/config", (r) =>
        r.fulfill({
          json: {
            rpcUrl: null,
            chainId: "people-public-testnet-v2-2026-09-30",
            tokenFeePpl: 10,
            nftFeePpl: 10,
            publicSubmit: true,
            mediaPersist: true,
            aiIconEnabled: true,
            networkStatus: "connected",
          },
        }),
      );
      await page.route("**/api/factory/icon/quota*", (r) => r.fulfill({ json: ICON_QUOTA_INELIGIBLE }));
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${BASE}/create/token`, { waitUntil: "networkidle" });

      const button = page.getByRole("button", { name: "Generate icon" });
      // The AI-icon flow only renders on the ovn-node backend (cosmos-evm returns the EVM
      // launch form instead), so this evidence is skipped on a default-backend build.
      test.skip(!(await button.isVisible().catch(() => false)), "AI icon flow not enabled in this build");
      await button.click();
      await expect(page.getByText("Free tries are only for founders verified", { exact: false })).toBeVisible();
      await page.screenshot({ path: path.join(OUT, `icon-free-tier-${width}.png`), fullPage: true });
    });
  }
});
