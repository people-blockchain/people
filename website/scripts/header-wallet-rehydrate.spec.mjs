import { test, expect } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";

const ADDRESS = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

async function seedPersistedSession(page) {
  await page.evaluate(async (address) => {
    const session = {
      id: "cloud:test-user",
      address,
      privateKey: `0x${"11".repeat(32)}`,
      publicKey: `0x${"22".repeat(32)}`,
      kind: "cloud",
      userId: "test-user",
    };
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
      "encrypt",
      "decrypt",
    ]);
    const openDb = () =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open("ppl-wallet-session", 1);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains("keys")) req.result.createObjectStore("keys");
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction("keys", "readwrite");
      tx.objectStore("keys").put(key, "session-aes-gcm");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(JSON.stringify(session)),
    );
    const b64 = (bytes) => {
      let s = "";
      for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
      return btoa(s);
    };
    const now = Date.now();
    sessionStorage.setItem(
      "ppl-wallet-session-v1",
      JSON.stringify({
        v: 1,
        iv: b64(iv),
        data: b64(ciphertext),
        iat: now,
        exp: now + 12 * 60 * 60 * 1000,
      }),
    );
    localStorage.setItem("ovn_lang", "en");
  }, ADDRESS);
}

test.describe("header wallet rehydration", () => {
  test("persisted session shows wallet chip after reload and visibility resume @ 390", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      userAgent: ANDROID_UA,
      isMobile: true,
      hasTouch: true,
      locale: "en-US",
    });
    const page = await context.newPage();
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await seedPersistedSession(page);
    await page.reload({ waitUntil: "domcontentloaded" });

    // Header mounts desktop+mobile instances; wait until the wallet chip appears (may pass through
    // "Checking…" / restoring first). Must not stay on Connect while a session exists.
    const visibleChip = page.locator('[data-testid="header-wallet-menu-trigger"]:visible');
    await expect(visibleChip).toBeVisible({ timeout: 30000 });
    await expect(page.locator('[data-testid="header-sign-in"]:visible')).toHaveCount(0);

    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "visible",
      });
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("focus"));
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    });

    await expect(visibleChip).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="header-sign-in"]:visible')).toHaveCount(0);

    await context.close();
  });
});
