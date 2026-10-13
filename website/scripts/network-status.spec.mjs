import { test, expect } from "@playwright/test";

test("wallet network status starts neutral then reaches testnet without unavailable flash", async ({
  page,
}) => {
  const seen = new Set();

  page.on("framenavigated", async () => {
    const chip = page.getByTestId("network-status").locator("span").first();
    if (await chip.count()) {
      const text = (await chip.textContent())?.trim();
      if (text) seen.add(text);
    }
  });

  await page.addInitScript(() => {
    try {
      localStorage.setItem("ovn_lang", "ru");
    } catch {
      /* ignore */
    }
  });

  await page.goto("/wallet", { waitUntil: "domcontentloaded" });

  const status = page.getByTestId("network-status");
  await expect(status).toBeVisible();

  const chip = status.locator("span").first();
  await expect(chip).toContainText(/Подключение|Testnet/i, { timeout: 15_000 });

  const firstText = (await chip.textContent())?.trim() ?? "";
  expect(firstText).not.toMatch(/временно недоступна/i);

  await expect(chip).toHaveText(/Testnet/i, { timeout: 15_000 });
  expect([...seen].some((t) => /временно недоступна/i.test(t))).toBe(false);
});
