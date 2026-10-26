import { test, expect } from "@playwright/test";

/**
 * Regression for the founder #1 report: an existing wallet must get one clear path (no
 * Create/Import), the local keystore must unlock with the right password (and say "wrong
 * password" only when it is), and MetaMask must connect even when the network switch fails.
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";
const KEY = "4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318";
const ADDRESS = "0xf49c63af9f6e657abc52a941bb7e812ce0f20de4";
const PASSWORD = "correct horse battery staple";

/** Encrypts like wallet-vault.ts. `labelIterations` lets a record lie about its KDF cost. */
async function seedKeystore(page, { iterations, labelIterations }) {
  await page.evaluate(
    async ({ key, address, password, iterations, labelIterations }) => {
      const hex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
      const aes = await crypto.subtle.deriveKey(
        { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
        material,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt"],
      );
      const data = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aes, new TextEncoder().encode(key)));
      const payload = { v: 2, iterations: labelIterations, salt: hex(salt), iv: hex(iv), data: hex(data) };
      localStorage.setItem(
        "ppl-web-wallets",
        JSON.stringify([{ id: "e2e-test-founder", label: "e2e", address, encryptedPrivateKey: JSON.stringify(payload), createdAt: Date.now() }]),
      );
    },
    { key: KEY, address: ADDRESS, password: PASSWORD, iterations, labelIterations },
  );
}

async function openLogin(page) {
  // Wait for hydration: a click before React attaches handlers is silently lost.
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
}

test("existing wallet: no Create/Import, unlock reports wrong password precisely, then opens", async ({ page }) => {
  await openLogin(page);
  await seedKeystore(page, { iterations: 600_000, labelIterations: 120_000 });
  await page.evaluate(() => localStorage.setItem("ppl_last_auth_email", "e2e-test-founder@example.com"));
  await page.reload({ waitUntil: "networkidle" });

  const item = page.getByText(ADDRESS).first();
  await expect(item).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId("wallet-create-import")).toHaveCount(0);

  await page.locator("li", { hasText: ADDRESS }).getByRole("button", { name: "Unlock" }).click();
  const input = page.locator('input[type="password"]');
  await input.fill("not the password");
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
  await expect(page.getByText("Wrong password for this wallet.")).toBeVisible({ timeout: 30000 });

  await input.fill(PASSWORD);
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
  // Record claims 120k but was written with 600k: the right password must still open it.
  await expect(page.locator('input[type="password"]')).toHaveCount(0, { timeout: 30000 });
  await expect(page.getByText("Wrong password for this wallet.")).toHaveCount(0);
});

test("fresh device: Create/Import still offered", async ({ page }) => {
  await openLogin(page);
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByTestId("wallet-create-import").first()).toBeVisible({ timeout: 15000 });
});

test("MetaMask connects even when the PEOPLE network switch fails", async ({ page }) => {
  await page.addInitScript((address) => {
    window.__walletCalls = [];
    window.ethereum = {
      isMetaMask: true,
      request: async ({ method }) => {
        window.__walletCalls.push(method);
        if (method === "eth_requestAccounts") return [address];
        if (method === "eth_accounts") return [];
        if (method === "wallet_switchEthereumChain" || method === "wallet_addEthereumChain") {
          const err = new Error("Internal JSON-RPC error.");
          err.code = -32603;
          throw err;
        }
        return null;
      },
      on: () => {},
      removeListener: () => {},
    };
  }, "0x1111111111111111111111111111111111111111");
  await page.route("**/api/evm/compat/address/**", (route) => route.fulfill({ json: { balance: 1, nonce: 0, balances: { ppl: 1 } } }));
  await openLogin(page);
  await page.getByTestId("wallet-connect-metamask").first().click();
  await expect(page.getByText("0x1111111111111111111111111111111111111111").first()).toBeVisible({ timeout: 15000 });
});

test("Android without MetaMask: opens the page inside the MetaMask app", async ({ browser }) => {
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36",
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await context.route(/metamask\.app\.link|link\.metamask\.io/, (route) => route.fulfill({ body: "mm" }));
  await openLogin(page);
  const nav = page.waitForRequest(/metamask\.app\.link|link\.metamask\.io/, { timeout: 15000 });
  await page.getByTestId("wallet-connect-metamask").first().click();
  await page.getByTestId("wallet-ext-open").click();
  const req = await nav;
  // The app deep-links to its own origin, so the expected host follows BASE
  // (CI and the local suite both serve 3000). This used to hardcode a dead
  // local-dev port, which made the assertion fail everywhere.
  expect(req.url()).toContain(`metamask.app.link/dapp/${new URL(BASE).host}/login`);
  await context.close();
});
