import { isDatabaseConfigured } from "@/db";
import { resolveFounderUserIdByWallet } from "@/lib/founders/service";
import { getFounderVerificationLevel } from "@/lib/founders/verification-service";
import { isFounderVerifiedForFreeIcons } from "@/lib/founders/verification";

/**
 * M20-4: the free icon-generation quota is a founder perk, so it is only granted to a wallet
 * that belongs to a founder verified via Telegram phone or a strong check (Human Passport).
 * Everything else — an unregistered wallet, a level-0 founder, or a database that isn't
 * configured — fails closed and must pay the per-batch fee.
 *
 * This resolves the wallet to a founder row rather than trusting a client-supplied flag; the
 * wallet is the only identifier the (otherwise unauthenticated) `/create/*` icon flow carries.
 */
export async function isWalletFreeIconEligible(wallet: string): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  const userId = await resolveFounderUserIdByWallet(wallet);
  if (!userId) return false;
  const level = await getFounderVerificationLevel(userId);
  return isFounderVerifiedForFreeIcons(level);
}
