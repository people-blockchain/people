import { inArray } from "drizzle-orm";
import { getDbReady, isDatabaseConfigured } from "@/db";
import { tokenIconOverrides } from "@/db/schema";

/**
 * Off-chain token icon overrides.
 *
 * `PeopleProjectToken.metadataURI` is writable only by the factory, so the owner-facing icon
 * editor records an override keyed by token address. Reads are optional: without DATABASE_URL or
 * when the DB is unavailable the catalog keeps serving the on-chain image.
 */
export async function readTokenIconOverrides(addresses: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!addresses.length || !isDatabaseConfigured()) return out;
  try {
    const db = await getDbReady();
    const rows = await db
      .select({ tokenAddress: tokenIconOverrides.tokenAddress, imageUri: tokenIconOverrides.imageUri })
      .from(tokenIconOverrides)
      .where(inArray(tokenIconOverrides.tokenAddress, addresses.map((address) => address.toLowerCase())));
    for (const row of rows) {
      if (row.imageUri) out.set(row.tokenAddress.toLowerCase(), row.imageUri);
    }
  } catch {
    // Optional enrichment only — never fail a catalog read because the DB is down.
  }
  return out;
}

export async function upsertTokenIconOverride(
  tokenAddress: string,
  imageUri: string,
  updatedBy: string,
): Promise<void> {
  const db = await getDbReady();
  const token = tokenAddress.toLowerCase();
  await db
    .insert(tokenIconOverrides)
    .values({ tokenAddress: token, imageUri, updatedBy: updatedBy.toLowerCase(), updatedAt: new Date() })
    .onConflictDoUpdate({
      target: tokenIconOverrides.tokenAddress,
      set: { imageUri, updatedBy: updatedBy.toLowerCase(), updatedAt: new Date() },
    });
}
