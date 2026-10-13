import { test, expect } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";
const ADDRESS = "0x1111111111111111111111111111111111111111";
const PEOPLE_CHAIN_HEX = "0x17c79";

const VIEWPORTS = [
  { name: "360", width: 360, height: 740 },
  { name: "390", width: 390, height: 844 },
  { name: "1280", width: 1280, height: 800 },
];
const THEMES = ["light", "dark"];

/** Registered via page.addInitScript so it runs before any app code, like a real injected wallet. */
function injectMockProvider({ vendor, address }) {
  window.__walletCalls = [];
  let chainAdded = false;
  window.ethereum = {
    ...(vendor === "metamask" ? { isMetaMask: true } : { isTrust: true }),
    request: async ({ method, params }) => {
      window.__walletCalls.push({ method, params });
      if (method === "eth_requestAccounts") return [address];
      if (method === "eth_accounts") return [];
      if (method === "wallet_switchEthereumChain") {
        if (!chainAdded) {
          if (vendor === "metamask") {
            const err = new Error("Unrecognized chain ID");
            err.code = 4902;
            throw err;
          }
          // Trust Wallet (and others) don't necessarily use MetaMask's 4902 code/message.
          throw new Error("Unable to switch the active Ethereum chain");
        }
        return null;
      }
      if (method === "wallet_addEthereumChain") {
        chainAdded = true;
        return null;
      }
      return null;
    },
    on: () => {},
    removeListener: () => {},
  };
}

async function openLoginWithProvider(browser, { viewport, theme, vendor }) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const page = await context.newPage();
  await page.addInitScript((t) => localStorage.setItem("ovn_theme", t), theme);
  await page.addInitScript(injectMockProvider, { vendor, address: ADDRESS });
  await page.route("**/api/evm/compat/address/**", (route) =>
    route.fulfill({ json: { balance: 12.5, nonce: 0, balances: { ppl: 12.5 } } }),
  );
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("wallet-external-connect")).toBeVisible({ timeout: 15000 });
  return { context, page };
}

async function walletCallMethods(page) {
  return page.evaluate(() => window.__walletCalls.map((c) => c.method));
}

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    test(`MetaMask in-app browser connect @ ${viewport.name} (${theme})`, async ({ browser }) => {
      const { context, page } = await openLoginWithProvider(browser, { viewport, theme, vendor: "metamask" });

      await page.getByTestId("wallet-connect-metamask").click();
      await expect(page.getByText(ADDRESS)).toBeVisible({ timeout: 10000 });

      const calls = await walletCallMethods(page);
      expect(calls).toContain("eth_requestAccounts");
      expect(calls).toContain("wallet_switchEthereumChain");
      expect(calls).toContain("wallet_addEthereumChain");
      // Accounts must be requested before the chain is ever touched: MetaMask's in-app browser
      // refuses wallet_switchEthereumChain/wallet_addEthereumChain for an origin with no granted
      // accounts, which is exactly what made "Connect" silently fail inside the wallet app.
      expect(calls.indexOf("eth_requestAccounts")).toBeLessThan(calls.indexOf("wallet_switchEthereumChain"));

      const addChainCall = await page.evaluate(
        () => window.__walletCalls.find((c) => c.method === "wallet_addEthereumChain"),
      );
      expect(addChainCall.params[0].chainId).toBe(PEOPLE_CHAIN_HEX);
      expect(addChainCall.params[0].nativeCurrency).toEqual({ name: "People", symbol: "PPL", decimals: 18 });

      const trigger = page.locator('[data-testid="header-wallet-menu-trigger"]:visible').first();
      await expect(trigger).toBeVisible();
      await expect(trigger).toContainText("0x1111");

      await context.close();
    });
  }
}

test("Trust Wallet in-app browser connect: generic switch failure still adds the chain", async ({ browser }) => {
  const { context, page } = await openLoginWithProvider(browser, {
    viewport: VIEWPORTS[1],
    theme: "dark",
    vendor: "trust",
  });

  await page.getByTestId("wallet-connect-trust").click();
  await expect(page.getByText(ADDRESS)).toBeVisible({ timeout: 10000 });

  const calls = await walletCallMethods(page);
  expect(calls).toContain("eth_requestAccounts");
  expect(calls).toContain("wallet_addEthereumChain");
  expect(calls.filter((m) => m === "wallet_switchEthereumChain").length).toBeGreaterThanOrEqual(2);

  await context.close();
});
