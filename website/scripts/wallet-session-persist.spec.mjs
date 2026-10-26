import { test, expect } from "@playwright/test";
import { createECDH, createHash, randomBytes } from "node:crypto";

// E2E-H2: an unlocked PEOPLE Wallet lived only in React state, so a full page load
// (footer <a> links, reload) dropped it and the EVM pages fell back to a "Connect a
// wallet" link pointing at /wallet. This drives the real browser: import a throwaway
// wallet on /wallet, unlock it, then full-load /create/token and /swap and expect the
// session to survive — and that no plaintext key ever lands in web storage.
//
// The key is a fresh random one per run; nothing here signs or broadcasts.

const PASSWORD = "test-password";

const privateKey = randomBytes(32).toString("hex");
const ecdh = createECDH("secp256k1");
ecdh.setPrivateKey(Buffer.from(privateKey, "hex"));
const address = "0x" + createHash("sha256").update(ecdh.getPublicKey(null, "compressed")).digest("hex").slice(0, 40);

const peopleWalletButton = "PEOPLE Wallet (this browser)";

test("an unlocked PEOPLE Wallet survives full page loads (E2E-H2)", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.route(/\/api\/(network|evm\/compat)\//, async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api\/(network|evm\/compat)\//, "");
    let body = {};
    if (path === "health") body = { chainId: "97401", status: "ok", height: 100 };
    else if (path === "metrics") body = { height: 100, finalizedHeight: 99 };
    else if (path.endsWith("/transactions")) body = [];
    else if (path.startsWith("address/")) body = { balance: 10, nonce: 0, balances: {} };
    else if (path === "assets" || path === "nfts") body = [];
    await route.fulfill({ json: body });
  });

  await page.goto("/wallet");
  // Seed an encrypted wallet record exactly like the import flow would persist it.
  await page.evaluate(
    async ({ privateKey, address, password }) => {
      localStorage.setItem("people_lang", "en");
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
      const derived = await crypto.subtle.deriveKey(
        { name: "PBKDF2", salt, iterations: 120000, hash: "SHA-256" },
        material,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt"]
      );
      const data = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, derived, new TextEncoder().encode(privateKey)));
      const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
      localStorage.setItem(
        "ppl-web-wallets",
        JSON.stringify([{ id: "test-wallet", label: "Test wallet", address, createdAt: 1, encryptedPrivateKey: JSON.stringify({ salt: hex(salt), iv: hex(iv), data: hex(data) }) }])
      );
    },
    { privateKey, address, password: PASSWORD }
  );

  await page.reload();
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
  await expect(page.getByTestId("wallet-ppl")).toBeVisible();

  // The private key must never be written to web storage in the clear.
  const plaintextLeak = await page.evaluate(
    ({ privateKey, address }) => {
      const dump = (store) => {
        let text = "";
        for (let i = 0; i < store.length; i++) text += `${store.key(i)}=${store.getItem(store.key(i))};`;
        return text;
      };
      const all = dump(localStorage) + dump(sessionStorage);
      return { hasKey: all.includes(privateKey), hasAddressInSession: sessionStorage.length > 0 && all.includes(address) };
    },
    { privateKey, address }
  );
  expect(plaintextLeak.hasKey).toBe(false);

  // Full load (not a client-side nav): /create/token must keep the session.
  await page.goto("/create/token");
  await expect(page.getByRole("button", { name: peopleWalletButton })).toBeVisible();
  await expect(page.getByRole("link", { name: peopleWalletButton })).toHaveCount(0);

  // ...and the entry is a real connect action, not a bounce back to /wallet.
  await page.getByRole("button", { name: peopleWalletButton }).click();
  await expect(page.getByRole("button", { name: peopleWalletButton })).toHaveCount(0);
  await expect(page.getByPlaceholder(/name|token/i).first()).toBeVisible();

  // A second full load on another EVM page keeps it connected too. /swap
  // auto-connects the restored session (unlike /create/token, which waits for a
  // tap), so the proof here is the live swap form. The «PEOPLE Wallet» connect
  // control must be absent — that is what a dropped session would render, as a
  // link back to /wallet.
  await page.goto("/swap");
  await expect(page.getByTestId("swap-submit")).toBeVisible();
  await expect(page.getByRole("link", { name: peopleWalletButton })).toHaveCount(0);

  expect(errors).toEqual([]);
});
