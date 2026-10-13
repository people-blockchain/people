import { test } from "@playwright/test";
import path from "node:path";

const base = process.env.EVM_SCREENSHOT_BASE ?? "http://127.0.0.1:3010";
const outDir = "/opt/cursor/artifacts/screenshots";
const mockAddr = "0x74A50ac5Ea07f86fC10f0AD0E543e9321B57EB8c";

async function injectMockEthereum(page) {
  await page.addInitScript(({ addr }) => {
    window.ethereum = {
      request: async ({ method }) => {
        if (method === "eth_requestAccounts") return [addr];
        if (method === "eth_accounts") return [addr];
        if (method === "eth_chainId") return "0x17c79";
        if (method === "wallet_switchEthereumChain") return null;
        if (method === "wallet_addEthereumChain") return null;
        return null;
      },
      on: () => {},
      removeListener: () => {},
    };
  }, { addr: mockAddr });
}

test("explorer home RU desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${base}/explorer?lang=ru`);
  await page.getByRole("heading", { name: /Explorer|Обозреватель/i }).waitFor({ timeout: 15000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(outDir, "explorer-evm-ru-desktop-1440.png"), fullPage: true });
});

test("wallet RU mobile", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${base}/wallet?lang=ru`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(outDir, "wallet-evm-ru-mobile-375.png"), fullPage: true });
});

test("cosmos-evm swap RU desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await injectMockEthereum(page);
  await page.goto(`${base}/swap?lang=ru`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(outDir, "swap-evm-ru-desktop-1440.png"), fullPage: true });
});

test("cosmos-evm token launch RU mobile", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await injectMockEthereum(page);
  await page.goto(`${base}/create/token?lang=ru`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(outDir, "token-launch-evm-ru-mobile-375.png"), fullPage: true });
});
