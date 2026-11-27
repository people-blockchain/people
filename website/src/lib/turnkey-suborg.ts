import { eq } from "drizzle-orm";
import { getDbReady } from "@/db";
import { userTurnkeyWallets, userWalletVaults } from "@/db/schema";
import { bindPartnerWalletFromVault } from "@/lib/partner/service";
import { isWalletAddress, normalizeHex } from "@/lib/partner/wallet";
import { getTurnkeyApi } from "@/lib/turnkey-server";
import { assertCanCreateTurnkeyWallet, isOrphanTurnkeySubOrg } from "@/lib/turnkey-upgrade";
import { liveSchemeVaultAddress } from "@/lib/wallet-address-scheme";

export type TurnkeyWalletRow = {
  userId: string;
  subOrganizationId: string;
  turnkeyUserId: string | null;
  walletId: string | null;
  address: string | null;
  publicKey: string | null;
  importedFromVault: boolean;
  legacyImportError: string | null;
};

export type TurnkeyWalletStatus = {
  subOrganizationId: string | null;
  turnkeyUserId: string | null;
  walletId: string | null;
  address: string | null;
  importedFromVault: boolean;
  hasLegacyVault: boolean;
  legacyAddress: string | null;
  needsImport: boolean;
  addressConflict: boolean;
  legacyImportError: string | null;
  orphanSubOrg: boolean;
};

export async function loadTurnkeyWallet(userId: string): Promise<TurnkeyWalletRow | null> {
  const db = await getDbReady();
  const rows = await db.select().from(userTurnkeyWallets).where(eq(userTurnkeyWallets.userId, userId)).limit(1);
  return rows[0] ?? null;
}

export type LegacyVaultSummary = {
  address: string;
  publicKey?: string | null;
};

export async function loadLegacyVaultSummary(userId: string): Promise<LegacyVaultSummary | null> {
  const db = await getDbReady();
  const rows = await db
    .select({ address: userWalletVaults.address, publicKey: userWalletVaults.publicKey })
    .from(userWalletVaults)
    .where(eq(userWalletVaults.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

export function computeTurnkeyWalletStatus(
  row: TurnkeyWalletRow | null,
  vault: LegacyVaultSummary | null,
): TurnkeyWalletStatus {
  const hasAddress = Boolean(row?.address);
  const displayVault = vault
    ? liveSchemeVaultAddress({ storedAddress: vault.address, publicKey: vault.publicKey })
    : null;
  const vaultAddr = displayVault?.trim().toLowerCase() ?? "";
  const turnkeyAddr = row?.address?.trim().toLowerCase() ?? "";
  const addressConflict = Boolean(vaultAddr && turnkeyAddr && vaultAddr !== turnkeyAddr);
  return {
    subOrganizationId: row?.subOrganizationId ?? null,
    turnkeyUserId: row?.turnkeyUserId ?? null,
    walletId: row?.walletId ?? null,
    address: row?.address ?? null,
    importedFromVault: row?.importedFromVault === true,
    hasLegacyVault: Boolean(vault),
    legacyAddress: displayVault,
    needsImport: Boolean(vault) && !hasAddress,
    addressConflict,
    legacyImportError: row?.legacyImportError ?? null,
    orphanSubOrg: isOrphanTurnkeySubOrg(row),
  };
}

export async function getTurnkeyWalletStatus(userId: string): Promise<TurnkeyWalletStatus> {
  const row = await loadTurnkeyWallet(userId);
  const vault = await loadLegacyVaultSummary(userId);
  return computeTurnkeyWalletStatus(row, vault);
}

export async function bootstrapTurnkeySubOrg(input: {
  userId: string;
  email?: string | null;
  clientPublicKey: string;
  createWallet: boolean;
  replaceOrphan?: boolean;
}): Promise<TurnkeyWalletRow> {
  const existing = await loadTurnkeyWallet(input.userId);
  const replaceOrphan = Boolean(existing && input.replaceOrphan && isOrphanTurnkeySubOrg(existing));
  if (existing && !replaceOrphan) return existing;

  const vault = await loadLegacyVaultSummary(input.userId);
  assertCanCreateTurnkeyWallet(Boolean(vault), input.createWallet);

  const publicKey = input.clientPublicKey.trim();
  if (!/^[0-9a-fA-F]{64,132}$/.test(publicKey)) {
    throw new Error("invalid_client_key");
  }

  const api = await getTurnkeyApi();
  const created = await api.createSubOrganization({
    subOrganizationName: `people-${input.userId.slice(0, 8)}`,
    userName: input.email?.trim() || `people-user-${input.userId.slice(0, 8)}`,
    userEmail: input.email?.trim() || undefined,
    apiKeys: [
      {
        apiKeyName: "people-browser",
        publicKey,
        curveType: "API_KEY_CURVE_P256",
      },
    ],
    createWallet: input.createWallet,
  });

  const address = created.addresses[0]?.trim().toLowerCase() ?? null;
  if (address && !isWalletAddress(address)) {
    throw new Error("invalid_turnkey_address");
  }

  const db = await getDbReady();
  const now = new Date();
  if (replaceOrphan && existing) {
    const updated = await db
      .update(userTurnkeyWallets)
      .set({
        subOrganizationId: created.subOrganizationId,
        turnkeyUserId: created.turnkeyUserId ?? null,
        walletId: created.walletId ?? null,
        address,
        publicKey: null,
        importedFromVault: false,
        legacyImportError: null,
        updatedAt: now,
      })
      .where(eq(userTurnkeyWallets.userId, input.userId))
      .returning();
    const row = updated[0] ?? (await loadTurnkeyWallet(input.userId));
    if (!row) throw new Error("turnkey_row_missing");
    if (row.address) {
      await bindPartnerWalletFromVault(input.userId, row.address, row.publicKey ?? "");
    }
    return row;
  }

  const inserted = await db
    .insert(userTurnkeyWallets)
    .values({
      userId: input.userId,
      subOrganizationId: created.subOrganizationId,
      turnkeyUserId: created.turnkeyUserId ?? null,
      walletId: created.walletId ?? null,
      address,
      publicKey: null,
      importedFromVault: false,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .returning();

  const row = inserted[0] ?? (await loadTurnkeyWallet(input.userId));
  if (!row) throw new Error("turnkey_row_missing");
  if (row.address) {
    await bindPartnerWalletFromVault(input.userId, row.address, row.publicKey ?? "");
  }
  return row;
}

export async function saveTurnkeyWalletAddress(input: {
  userId: string;
  address: string;
  publicKey?: string | null;
  walletId?: string | null;
  importedFromVault?: boolean;
  legacyImportError?: string | null;
}): Promise<TurnkeyWalletRow> {
  const address = input.address.trim().toLowerCase();
  if (!isWalletAddress(address)) throw new Error("invalid_address");
  const db = await getDbReady();
  const existing = await loadTurnkeyWallet(input.userId);
  if (!existing) throw new Error("turnkey_suborg_missing");
  if (existing.address && existing.address.toLowerCase() !== address) {
    throw new Error("address_conflict");
  }

  const taken = await db
    .select({ userId: userTurnkeyWallets.userId })
    .from(userTurnkeyWallets)
    .where(eq(userTurnkeyWallets.address, address))
    .limit(1);
  if (taken[0] && taken[0].userId !== input.userId) {
    throw new Error("address_taken");
  }

  const now = new Date();
  const updated = await db
    .update(userTurnkeyWallets)
    .set({
      address,
      publicKey: input.publicKey ? normalizeHex(input.publicKey) : existing.publicKey,
      walletId: input.walletId ?? existing.walletId,
      importedFromVault: input.importedFromVault ?? existing.importedFromVault,
      legacyImportError: input.legacyImportError === undefined ? existing.legacyImportError : input.legacyImportError,
      updatedAt: now,
    })
    .where(eq(userTurnkeyWallets.userId, input.userId))
    .returning();
  const row = updated[0];
  if (!row) throw new Error("turnkey_row_missing");
  await bindPartnerWalletFromVault(input.userId, address, row.publicKey ?? "");
  return row;
}

export async function recordLegacyImportError(userId: string, code: string): Promise<void> {
  const db = await getDbReady();
  const existing = await loadTurnkeyWallet(userId);
  if (!existing) return;
  await db
    .update(userTurnkeyWallets)
    .set({ legacyImportError: code, updatedAt: new Date() })
    .where(eq(userTurnkeyWallets.userId, userId));
}
