import assert from "node:assert/strict";
import test from "node:test";

/**
 * Live Turnkey check. Never prints secrets, never funds wallets.
 * Skips when TURNKEY_API_PUBLIC_KEY / TURNKEY_API_PRIVATE_KEY are unset.
 */
const hasTurnkeyLiveKeys = Boolean(
  process.env.TURNKEY_API_PUBLIC_KEY?.trim() && process.env.TURNKEY_API_PRIVATE_KEY?.trim(),
);

test("live Turnkey API + vault count + export address check", { skip: !hasTurnkeyLiveKeys }, async () => {

  const { Turnkey } = await import("@turnkey/sdk-server");
  const { generateP256KeyPair, decryptExportBundle } = await import("@turnkey/crypto");
  const { TURNKEY_ETHEREUM_ACCOUNT } = await import("../src/lib/people-chain-names.ts");
  const { exportedKeyMatchesAddress } = await import("../src/lib/turnkey-export.ts");
  const { DEFAULT_TURNKEY_ORGANIZATION_ID } = await import("../src/lib/turnkey-config.ts");

  const organizationId =
    process.env.TURNKEY_ORGANIZATION_ID?.trim() ||
    process.env.NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID?.trim() ||
    DEFAULT_TURNKEY_ORGANIZATION_ID;
  const apiBaseUrl = process.env.TURNKEY_API_BASE_URL?.trim() || "https://api.turnkey.com";

  const parent = new Turnkey({
    apiBaseUrl,
    defaultOrganizationId: organizationId,
    apiPublicKey: process.env.TURNKEY_API_PUBLIC_KEY.trim(),
    apiPrivateKey: process.env.TURNKEY_API_PRIVATE_KEY.trim(),
  }).apiClient();

  const whoami = await parent.getWhoami({ organizationId });
  assert.ok(whoami?.organizationId || whoami?.organizationName, "getWhoami should resolve the parent org");

  const root = generateP256KeyPair();
  const created = await parent.createSubOrganization({
    organizationId,
    subOrganizationName: `people-live-${Date.now().toString(36)}`,
    rootUsers: [
      {
        userName: "people-live-export",
        apiKeys: [
          {
            apiKeyName: "people-live",
            publicKey: root.publicKey,
            curveType: "API_KEY_CURVE_P256",
          },
        ],
        authenticators: [],
        oauthProviders: [],
      },
    ],
    rootQuorumThreshold: 1,
    wallet: {
      walletName: "PEOPLE Wallet",
      accounts: [TURNKEY_ETHEREUM_ACCOUNT],
    },
  });
  const nested =
    created?.activity?.result?.createSubOrganizationResultV7 ??
    created?.activity?.result?.createSubOrganizationResultV8 ??
    created?.activity?.result?.createSubOrganizationResultV9 ??
    created?.activity?.result?.createSubOrganizationResult ??
    created;
  const subOrganizationId = nested?.subOrganizationId;
  const address = nested?.wallet?.addresses?.[0];
  assert.ok(subOrganizationId, "sub-org id");
  assert.ok(address, "created address");

  const child = new Turnkey({
    apiBaseUrl,
    defaultOrganizationId: subOrganizationId,
    apiPublicKey: root.publicKey,
    apiPrivateKey: root.privateKey,
  }).apiClient();

  const tek = generateP256KeyPair();
  const exported = await child.exportWalletAccount({
    organizationId: subOrganizationId,
    address,
    targetPublicKey: tek.publicKeyUncompressed || tek.publicKey,
  });
  const exportBundle =
    exported?.activity?.result?.exportWalletAccountResult?.exportBundle ??
    exported?.exportBundle;
  assert.ok(exportBundle, "export bundle");
  const decrypted = await decryptExportBundle({
    exportBundle,
    embeddedKey: tek.privateKey,
    organizationId: subOrganizationId,
    keyFormat: "HEXADECIMAL",
    returnMnemonic: false,
  });
  assert.equal(exportedKeyMatchesAddress(decrypted, address), true);

  if (typeof child.deleteSubOrganization === "function") {
    await child.deleteSubOrganization({ organizationId: subOrganizationId }).catch(() => undefined);
  }

  let vaultCount = null;
  if (process.env.DATABASE_URL?.trim()) {
    try {
      const postgres = (await import("postgres")).default;
      const sql = postgres(process.env.DATABASE_URL, { max: 1, idle_timeout: 5 });
      try {
        const rows = await sql`select count(*)::int as n from "user_wallet_vault"`;
        vaultCount = rows[0]?.n ?? 0;
      } finally {
        await sql.end({ timeout: 5 });
      }
    } catch {
      vaultCount = null;
    }
  }
  // Report without printing secrets. The test log is the live-test report.
  console.info(
    JSON.stringify({
      liveTurnkey: true,
      exportAddressMatched: true,
      legacyVaultRows: vaultCount,
      switch: "vault users prompt_upgrade; no silent createWallet; export via EXPORT_WALLET_ACCOUNT iframe/TEK",
    }),
  );
});
