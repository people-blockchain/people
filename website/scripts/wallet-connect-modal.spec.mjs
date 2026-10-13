import assert from "node:assert/strict";
import { test, expect } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";
/** Default public backend is cosmos-evm: /swap and /create/token gate on an EVM
 *  wallet (MetaMask / Trust / WalletConnect), not on the People sign-in modal. */
const LEGACY_BACKEND = ["ovn-node", "legacy", "people-node"].includes(
  (process.env.NEXT_PUBLIC_CHAIN ?? "").trim().toLowerCase(),
);

async function setLocale(page, lang) {
  await page.addInitScript((value) => {
    try {
      localStorage.setItem("ovn_lang", value);
    } catch {
      /* ignore */
    }
  }, lang);
}

async function assertUnifiedSignInVisible(page) {
  await expect(page.getByTestId("unified-wallet-auth")).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId("wallet-modal-explainer")).toBeVisible();
  const google = page.getByTestId("wallet-sign-in-google");
  if (await google.isVisible().catch(() => false)) {
    await expect(page.getByTestId("wallet-sign-in-email")).toBeVisible();
  }
}

async function waitForAuthFeatures(page) {
  await page.waitForResponse(
    (res) => res.url().includes("/api/auth/features") && res.status() === 200,
    { timeout: 15000 },
  ).catch(() => null);
}

async function assertModalOpens(page, triggerTestId) {
  await waitForAuthFeatures(page);
  const trigger = page.getByTestId(triggerTestId).locator("visible=true").first();
  await trigger.click();
  const dialog = page.locator("dialog[open]");
  await expect(dialog).toBeVisible({ timeout: 8000 });
  await assertUnifiedSignInVisible(page);
  assert.ok(!page.url().includes("/login"), "sign-in must not navigate to /login");
  return dialog;
}

/** EVM pages render the external-wallet menu inline; no route change, no dialog. */
async function assertEvmConnectMenu(page) {
  const menu = page.locator("main").getByTestId("wallet-external-connect");
  await expect(menu).toBeVisible({ timeout: 15000 });
  await expect(menu.getByTestId("wallet-connect-metamask")).toBeVisible();
  await expect(menu.getByTestId("wallet-connect-trust")).toBeVisible();
  await expect(page.locator("main").getByRole("link", { name: /People Wallet/ })).toHaveAttribute("href", "/wallet");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
}

/** Inline auth ( /wallet, /login ) uses the same controls without dialog. */
async function assertInlineSignIn(page) {
  await waitForAuthFeatures(page);
  await assertUnifiedSignInVisible(page);
  await expect(page.locator("dialog[open]")).toHaveCount(0);
}

const ENTRY_POINTS = [
  {
    id: "header-sign-in",
    label: "Header «Sign in»",
    lang: "en",
    width: 1440,
    height: 900,
    path: "/",
    kind: "modal",
    trigger: "header-sign-in",
  },
  {
    id: "home-hero-wallet-cta",
    label: "Home hero wallet CTA",
    lang: "ru",
    width: 1440,
    height: 900,
    path: "/",
    kind: "modal",
    trigger: "home-wallet-auth-cta",
  },
  {
    id: "mobile-menu-partner",
    label: "Mobile menu partner login",
    lang: "ru",
    width: 375,
    height: 812,
    path: "/",
    kind: "mobile-menu",
  },
  {
    id: "swap-connect",
    label: "Swap / pools page",
    lang: "en",
    width: 375,
    height: 812,
    path: "/swap",
    kind: LEGACY_BACKEND ? "modal" : "evm-connect",
    trigger: "connect-wallet-button",
    keepUrl: true,
  },
  {
    id: "issuance-token",
    label: "Token issuance wizard",
    lang: "ru",
    width: 375,
    height: 812,
    path: "/create/token",
    kind: LEGACY_BACKEND ? "modal-after-step" : "evm-connect",
  },
  {
    id: "factory-nft",
    label: "NFT factory",
    lang: "en",
    width: 1440,
    height: 900,
    path: "/create/nft",
    // On the EVM backend the NFT wizard signs through the connected EVM wallet (E2E-M3),
    // so it shows the inline external-wallet menu, not the stepped People sign-in modal.
    kind: LEGACY_BACKEND ? "modal-after-nft-steps" : "evm-connect",
  },
  {
    id: "constructor-contract",
    label: "Smart contract constructor",
    lang: "en",
    width: 1440,
    height: 900,
    path: "/create/contract",
    kind: "modal",
    trigger: "header-sign-in",
  },
  {
    id: "partner-portal-login",
    label: "Partner portal (login fallback)",
    lang: "ru",
    width: 1440,
    height: 900,
    path: "/login?callbackUrl=%2Fpartner",
    kind: "login-fallback",
  },
  {
    id: "wallet-page",
    label: "/wallet connect panel",
    lang: "en",
    width: 375,
    height: 812,
    path: "/wallet",
    kind: "inline",
  },
];

test.describe("unified wallet connect modal", () => {
  for (const entry of ENTRY_POINTS) {
    test(`entry: ${entry.label} @ ${entry.id}`, async ({ page }) => {
      await setLocale(page, entry.lang);
      await page.setViewportSize({
        width: entry.width,
        height: entry.height,
      });
      await page.goto(`${BASE}${entry.path}`, { waitUntil: "domcontentloaded" });

      if (entry.kind === "mobile-menu") {
        await waitForAuthFeatures(page);
        await page.getByRole("button", { name: /меню|menu/i }).click();
        const sheet = page.locator("#mobile-menu");
        await expect(sheet.getByRole("combobox", { name: /язык|language/i })).toHaveCount(0);
        await sheet.getByTestId("header-sign-in").click();
        await expect(page.locator("dialog[open]")).toBeVisible();
        await assertUnifiedSignInVisible(page);
        return;
      }

      if (entry.kind === "modal-after-nft-steps") {
        await page.getByLabel(/paste an image url|url изображения|ссылка на/i).fill("https://example.com/nft.png");
        await page.getByLabel(/paste an image url|url изображения|ссылка на/i).blur();
        await page.getByRole("button", { name: /continue|далее|next/i }).click();
        await page.locator("label").filter({ hasText: /^Name$|название/i }).locator("input").fill("E2E NFT");
        await page.getByRole("button", { name: /continue|далее|next/i }).click();
        await page.getByRole("button", { name: /continue|далее|next/i }).click();
        await assertModalOpens(page, "connect-wallet-button");
        return;
      }

      if (entry.kind === "modal-after-step") {
        await page.getByRole("button", { name: /continue|далее|next/i }).click();
        await page.locator("label").filter({ hasText: /name|название/i }).locator("input").fill("E2E Token");
        await page.locator("label").filter({ hasText: /ticker|тикер/i }).locator("input").fill("E2E");
        await page.locator("label").filter({ hasText: /supply|эмиссия|выпуск/i }).locator("input").fill("1000000");
        await page.getByRole("button", { name: /continue|далее|next/i }).click();
        await page.getByRole("button", { name: /continue|далее|next/i }).click();
        const before = page.url();
        await assertModalOpens(page, "connect-wallet-button");
        expect(page.url()).toBe(before);
        return;
      }

      if (entry.kind === "evm-connect") {
        const before = page.url();
        await assertEvmConnectMenu(page);
        expect(page.url()).toBe(before);
        return;
      }

      if (entry.kind === "inline") {
        await assertInlineSignIn(page);
        return;
      }

      if (entry.kind === "login-fallback") {
        await waitForAuthFeatures(page);
        if (await page.getByTestId("unified-wallet-auth").isVisible().catch(() => false)) {
          await assertUnifiedSignInVisible(page);
        } else {
          await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
          await expect(page.locator("main").getByRole("button").first()).toBeVisible();
        }
        return;
      }

      const before = entry.keepUrl ? page.url() : null;
      await assertModalOpens(page, entry.trigger);
      if (before) expect(page.url()).toBe(before);
    });
  }

  test("factory NFT wizard keeps form after modal dismiss @ mobile", async ({ page }) => {
    // /create/nft is the EVM form on the default backend (E2E-M3), with no sign-in detour
    // and no steps to come back to; its connect surface is covered by the entry above.
    test.skip(!LEGACY_BACKEND, "stepped NFT wizard only exists on the legacy backend");
    await setLocale(page, "en");
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${BASE}/create/nft`, { waitUntil: "domcontentloaded" });
    const imageUrl = page.getByLabel(/paste an image url/i);
    await imageUrl.fill("https://example.com/nft.png");
    await imageUrl.blur();
    await page.getByRole("button", { name: /continue|next/i }).click();
    const name = page.locator("label").filter({ hasText: /^Name$/i }).locator("input");
    await name.fill("Persist NFT");
    await page.getByRole("button", { name: /continue|next/i }).click();
    await page.getByRole("button", { name: /continue|next/i }).click();
    await assertModalOpens(page, "connect-wallet-button");
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await page.getByRole("button", { name: /back/i }).click();
    await page.getByRole("button", { name: /back/i }).click();
    await expect(name).toHaveValue("Persist NFT");
  });
});
