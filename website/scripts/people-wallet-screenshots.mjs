import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const base = process.env.SCREENSHOT_BASE ?? "http://localhost:3000";
const outDir = "/opt/cursor/artifacts/screenshots";
const iosUa =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1";

async function prime(page, path = "/wallet") {
  await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.setItem("ovn_lang", "ru");
    localStorage.setItem("ovn_theme", "dark");
    localStorage.removeItem("people-wallets");
  });
  await page.reload({ waitUntil: "networkidle" });
}

async function createWalletOnWalletPage(page) {
  await page.getByRole("button", { name: "Создать кошелёк" }).first().click();
  const words = await page.locator("ol li").allTextContents();
  await page.getByRole("button", { name: /записал фразу/i }).click();
  const parsed = words.map((line) => line.replace(/^\d+\.\s*/, "").trim());
  const labels = page.locator("label").filter({ hasText: "Слово" });
  const count = await labels.count();
  for (let i = 0; i < count; i++) {
    const label = labels.nth(i);
    const text = await label.textContent();
    const match = text?.match(/Слово\s+(\d+)/);
    if (!match) continue;
    const idx = Number(match[1]);
    await label.locator("input").fill(parsed[idx - 1] ?? "");
  }
  await page.getByRole("button", { name: "Далее" }).click();
  await page.locator('input[type="password"]').first().fill("testpass12");
  await page.locator('input[type="password"]').nth(1).fill("testpass12");
  await page.getByRole("button", { name: "Создать кошелёк" }).last().click();
  await page.getByTestId("wallet-ppl").waitFor({ state: "visible", timeout: 120000 });
}

async function captureWalletSet(browser, viewport, suffix, userAgent) {
  const page = await browser.newPage({ viewport, userAgent });
  await prime(page);
  await createWalletOnWalletPage(page);
  await page.screenshot({ path: `${outDir}/wallet-main-ru-${suffix}.png`, fullPage: true });

  await page.getByTestId("wallet-action-receive").click();
  await page.getByTestId("wallet-receive-dialog").waitFor();
  await page.screenshot({ path: `${outDir}/wallet-receive-ru-${suffix}.png` });
  await page.keyboard.press("Escape");

  await page.getByTestId("wallet-settings-button").click();
  await page.getByTestId("wallet-settings-dialog").waitFor();
  await page.screenshot({ path: `${outDir}/wallet-settings-ru-${suffix}.png` });
  await page.keyboard.press("Escape");

  await page.getByTestId("wallet-install-button").waitFor();
  await page.screenshot({ path: `${outDir}/wallet-install-ru-${suffix}.png`, fullPage: true });

  await page.close();
}

async function captureConnectModal(browser, viewport, suffix) {
  const page = await browser.newPage({ viewport });
  await prime(page, "/swap");
  await page.getByTestId("connect-wallet-button").first().click();
  await page.locator("dialog[open]").waitFor();
  await page.screenshot({ path: `${outDir}/wallet-connect-modal-ru-${suffix}.png` });
  await page.close();
}

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
try {
  await captureWalletSet(browser, { width: 1440, height: 900 }, "desktop-1440", iosUa);
  await captureWalletSet(browser, { width: 375, height: 812 }, "mobile-375", iosUa);
  await captureConnectModal(browser, { width: 1440, height: 900 }, "desktop-1440");
  await captureConnectModal(browser, { width: 375, height: 812 }, "mobile-375");
} finally {
  await browser.close();
}
console.log("People Wallet screenshots saved to", outDir);
