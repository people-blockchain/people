import { createHmac, randomUUID } from "node:crypto";
import { eq, inArray, or, sql } from "drizzle-orm";
import {
  encodePacked,
  getAddress,
  isAddress,
  keccak256,
  toBytes,
  type Address,
  type Hex,
} from "viem";
import { getDbReady } from "@/db";
import {
  founderPhoneRegistry,
  founderTelegramUsers,
  founders,
  saleBindings,
  salePersonIdentifiers,
  salePersons,
} from "@/db/schema";
import {
  fetchHumanPassportScore,
  type HumanPassportScoreLookup,
} from "@/lib/founders/human-passport-verify";
import type { FoundersHumanPassportConfig } from "@/lib/founders/human-passport-config";
import { VERIFICATION_LEVEL_TELEGRAM_PHONE } from "@/lib/founders/verification";

export const SALE_IDENTIFIER_KINDS = ["hp_wallet", "world_nullifier", "tg", "phone"] as const;
export type SaleIdentifierKind = (typeof SALE_IDENTIFIER_KINDS)[number];

export type SaleIdentifier = {
  kind: SaleIdentifierKind;
  value: string;
};

export type SaleEligibilityReason =
  | "not_eligible"
  | "identifier_bound_elsewhere"
  | "account_bound_elsewhere";

export type SaleExistingBinding = {
  personKey: string;
  account: string;
};

export type SaleEligibilityInput = {
  hasTelegramPhone: boolean;
  hpScore: number | null;
  hpThreshold: number;
  identifierHashes: readonly string[];
  existingBindings:
    | ReadonlyMap<string, SaleExistingBinding>
    | Readonly<Record<string, SaleExistingBinding>>;
  requestedAccount: string;
  personKey: string;
  /** Bot-wave switch (`SALE_REQUIRE_HUMAN_PASSPORT`): Telegram phone alone no longer qualifies. */
  requireHumanPassport?: boolean;
};

/**
 * Off by default. When the owner sets `SALE_REQUIRE_HUMAN_PASSPORT=1` (e.g. a bot wave buying
 * with virtual phone numbers), new sale verifications need a Human Passport score at or above the
 * threshold. People already bound on-chain stay bound: the hub binding is permanent.
 */
export function saleRequiresHumanPassport(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  const raw = (env.SALE_REQUIRE_HUMAN_PASSPORT ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

export type SaleEligibilityDecision =
  | { ok: true }
  | { ok: false; reason: SaleEligibilityReason };

function normalizeText(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("identifier value is empty");
  return trimmed;
}

/** All sale identifiers are case-insensitive for matching; raw values are never persisted. */
export function normalizeIdentifier(kind: SaleIdentifierKind, value: string): string {
  void kind;
  return normalizeText(value).toLowerCase();
}

/**
 * Deterministic, non-reversible identifier hash for the sale census. The raw wallet,
 * nullifier, Telegram id or phone hash never leaves this function.
 */
export function hashIdentifier(kind: SaleIdentifierKind, value: string): string {
  const secret = process.env.SALE_ID_HMAC_SECRET?.trim();
  if (!secret) throw new Error("SALE_ID_HMAC_SECRET is not set");
  const normalized = normalizeIdentifier(kind, value);
  return createHmac("sha256", secret).update(`${kind}:${normalized}`).digest("hex");
}

/** 32-byte server secret derived from SALE_PERSON_SECRET. */
export function personSecretBytes32(): Hex {
  const secret = process.env.SALE_PERSON_SECRET?.trim();
  if (!secret) throw new Error("SALE_PERSON_SECRET is not set");
  return keccak256(toBytes(secret));
}

/** Public person id = keccak256(encodePacked(bytes32(secret), personKey)). */
export function derivePersonId(personKey: string): Hex {
  const key = normalizeText(personKey);
  return keccak256(encodePacked(["bytes32", "string"], [personSecretBytes32(), key]));
}

function readBinding(
  bindings: SaleEligibilityInput["existingBindings"],
  idHash: string,
): SaleExistingBinding | undefined {
  if (bindings instanceof Map) return bindings.get(idHash);
  return (bindings as Readonly<Record<string, SaleExistingBinding>>)[idHash];
}

function allBindings(
  bindings: SaleEligibilityInput["existingBindings"],
): SaleExistingBinding[] {
  return bindings instanceof Map ? [...bindings.values()] : Object.values(bindings);
}

/**
 * Pure sale eligibility rule. A Telegram-verified phone OR a Human Passport score at/above the
 * threshold is required; World ID is not an accepted path. Telegram/phone identifiers alone never
 * qualify (they are only extra keys on an already-eligible person). Any identifier owned by another
 * person, or a requested account already bound elsewhere, denies the request.
 */
export function decideSaleEligibility(input: SaleEligibilityInput): SaleEligibilityDecision {
  const hpPasses =
    typeof input.hpScore === "number" &&
    Number.isFinite(input.hpScore) &&
    input.hpScore >= input.hpThreshold;
  if (!input.hasTelegramPhone && !hpPasses) return { ok: false, reason: "not_eligible" };
  if (input.requireHumanPassport && !hpPasses) return { ok: false, reason: "not_eligible" };

  const requested = input.requestedAccount.trim().toLowerCase();
  if (!requested) return { ok: false, reason: "account_bound_elsewhere" };

  for (const idHash of input.identifierHashes) {
    const existing = readBinding(input.existingBindings, idHash);
    if (!existing) continue;
    if (existing.personKey !== input.personKey) {
      return { ok: false, reason: "identifier_bound_elsewhere" };
    }
    if (existing.account.trim().toLowerCase() !== requested) {
      return { ok: false, reason: "account_bound_elsewhere" };
    }
  }

  for (const existing of allBindings(input.existingBindings)) {
    const account = existing.account.trim().toLowerCase();
    if (account === requested && existing.personKey !== input.personKey) {
      return { ok: false, reason: "account_bound_elsewhere" };
    }
    if (existing.personKey === input.personKey && account !== requested) {
      return { ok: false, reason: "account_bound_elsewhere" };
    }
  }

  return { ok: true };
}

/** Short aliases for the pure rule and person-id derivation. */
export const decide = decideSaleEligibility;
export const decideEligibility = decideSaleEligibility;
export const computePersonId = derivePersonId;

export type CollectedSaleIdentifiers = {
  person: { personKey: string; personId: Hex; userId: string } | null;
  identifiers: SaleIdentifier[];
  hasTelegramPhone: boolean;
  hpLookup: HumanPassportScoreLookup;
  hpScore: number | null;
  hpThreshold: number;
};

export type CollectSaleIdentifiersDeps = {
  fetch?: typeof fetch;
  readConfig?: () => FoundersHumanPassportConfig | null;
};

function dedupeIdentifiers(identifiers: SaleIdentifier[]): SaleIdentifier[] {
  const seen = new Set<string>();
  return identifiers.filter((identifier) => {
    const key = `${identifier.kind}:${normalizeIdentifier(identifier.kind, identifier.value)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Collects every eligible identifier for a user. The wallet used for Human Passport is added
 * as `hp_wallet` only when the live score passes; the linked Telegram id and the stored phone
 * hash are always collected but cannot qualify on their own. A verified Telegram phone is
 * detected from the founder verification level plus a stored phone (founder row or registry).
 */
export async function collectSaleIdentifiersForUser(
  userId: string,
  deps: CollectSaleIdentifiersDeps = {},
): Promise<CollectedSaleIdentifiers> {
  const db = await getDbReady();
  const [founder] = await db
    .select({
      walletAddress: founders.walletAddress,
      passportWallet: founders.passportWallet,
      phoneHash: founders.phoneHash,
      verificationLevel: founders.verificationLevel,
    })
    .from(founders)
    .where(eq(founders.userId, userId))
    .limit(1);

  const [personRow] = await db
    .select({ personKey: salePersons.personKey, personId: salePersons.personId, userId: salePersons.userId })
    .from(salePersons)
    .where(eq(salePersons.userId, userId))
    .limit(1);

  const person = personRow
    ? { personKey: personRow.personKey, personId: personRow.personId as Hex, userId: personRow.userId }
    : null;

  if (!founder) {
    const hpLookup: HumanPassportScoreLookup = { ok: false, error: "wallet_not_linked" };
    return { person, identifiers: [], hasTelegramPhone: false, hpLookup, hpScore: null, hpThreshold: Number.POSITIVE_INFINITY };
  }

  const [telegramRows, phoneRows] = await Promise.all([
    db
      .select({ telegramUserId: founderTelegramUsers.telegramUserId })
      .from(founderTelegramUsers)
      .where(eq(founderTelegramUsers.userId, userId)),
    db
      .select({ phoneHash: founderPhoneRegistry.phoneHash })
      .from(founderPhoneRegistry)
      .where(eq(founderPhoneRegistry.userId, userId)),
  ]);

  const passportLinked = founder.passportWallet?.trim();
  const hpWallet =
    passportLinked && isAddress(passportLinked, { strict: false })
      ? passportLinked
      : founder.walletAddress?.trim() || null;
  const hpLookup = await fetchHumanPassportScore({
    walletAddress: hpWallet,
    fetch: deps.fetch ?? fetch,
    readConfig: deps.readConfig,
  });
  const hpScore = hpLookup.ok ? hpLookup.score : null;
  const hpThreshold = hpLookup.ok ? hpLookup.threshold : Number.POSITIVE_INFINITY;

  const identifiers: SaleIdentifier[] = [];
  if (hpLookup.ok && hpLookup.passing) {
    identifiers.push({ kind: "hp_wallet", value: hpLookup.address });
  }
  for (const row of telegramRows) {
    identifiers.push({ kind: "tg", value: row.telegramUserId });
  }
  if (founder.phoneHash?.trim()) {
    identifiers.push({ kind: "phone", value: founder.phoneHash });
  }
  for (const row of phoneRows) {
    identifiers.push({ kind: "phone", value: row.phoneHash });
  }

  const hasPhone = Boolean(founder.phoneHash?.trim()) || phoneRows.length > 0;
  const hasTelegramPhone =
    founder.verificationLevel >= VERIFICATION_LEVEL_TELEGRAM_PHONE && hasPhone;

  return {
    person,
    identifiers: dedupeIdentifiers(identifiers),
    hasTelegramPhone,
    hpLookup,
    hpScore,
    hpThreshold,
  };
}

export type SaleEligibilityServiceResult =
  | {
      ok: true;
      personKey: string;
      personId: Hex;
      identifiers: SaleIdentifier[];
      hasTelegramPhone: boolean;
      hpScore: number | null;
      hpThreshold: number;
    }
  | {
      ok: false;
      reason: SaleEligibilityReason | "not_registered" | "invalid_account";
    };

type BindingRow = { idHash: string; personKey: string; account: string | null };

async function loadExistingBindings(input: {
  hashes: string[];
  requestedAccount: string;
  personKey: string;
}): Promise<Map<string, SaleExistingBinding>> {
  const db = await getDbReady();
  const requested = input.requestedAccount.toLowerCase();
  const bindings = new Map<string, SaleExistingBinding>();

  if (input.hashes.length > 0) {
    const rows = (await db
      .select({
        idHash: salePersonIdentifiers.idHash,
        personKey: salePersons.personKey,
        account: saleBindings.account,
      })
      .from(salePersonIdentifiers)
      .innerJoin(salePersons, eq(salePersonIdentifiers.personKey, salePersons.personKey))
      .leftJoin(saleBindings, eq(salePersons.personId, saleBindings.personId))
      .where(inArray(salePersonIdentifiers.idHash, input.hashes))) as BindingRow[];
    for (const row of rows) {
      if (row.account) {
        bindings.set(row.idHash, { personKey: row.personKey, account: row.account });
      } else if (row.personKey !== input.personKey) {
        // Another person already claimed this identifier even before an attestation was issued.
        bindings.set(row.idHash, { personKey: row.personKey, account: "" });
      }
      // Same person + no attestation yet: nothing conflicts, so leave it out.
    }
  }

  const accountRows = await db
    .select({
      personId: saleBindings.personId,
      personKey: salePersons.personKey,
      account: saleBindings.account,
    })
    .from(saleBindings)
    .innerJoin(salePersons, eq(salePersons.personId, saleBindings.personId))
    .where(
      or(
        eq(sql`lower(${saleBindings.account})`, requested),
        eq(salePersons.personKey, input.personKey),
      ),
    );
  for (const row of accountRows) {
    bindings.set(`binding:${row.personId}`, { personKey: row.personKey, account: row.account });
  }

  return bindings;
}

/**
 * DB-backed eligibility + upsert. The pure decision runs first; only an eligible person is
 * written. Person and identifier upserts happen in one transaction so a race cannot create
 * two persons for one user or steal another person's identifier.
 */
export async function evaluateSaleEligibilityForUser(
  userId: string,
  requestedAccountRaw: string,
  deps: CollectSaleIdentifiersDeps = {},
): Promise<SaleEligibilityServiceResult> {
  if (!isAddress(requestedAccountRaw)) return { ok: false, reason: "invalid_account" };
  const requestedAccount = getAddress(requestedAccountRaw).toLowerCase();

  const collected = await collectSaleIdentifiersForUser(userId, deps);
  if (!collected.person && collected.identifiers.length === 0) {
    // No founder row and no sale identifiers: nothing to attest.
    const db = await getDbReady();
    const [founder] = await db
      .select({ userId: founders.userId })
      .from(founders)
      .where(eq(founders.userId, userId))
      .limit(1);
    if (!founder) return { ok: false, reason: "not_registered" };
  }

  const personKey = collected.person?.personKey ?? randomUUID();
  const personId = collected.person?.personId ?? derivePersonId(personKey);
  const hashes = collected.identifiers.map((identifier) => hashIdentifier(identifier.kind, identifier.value));

  const existingBindings = await loadExistingBindings({
    hashes,
    requestedAccount,
    personKey,
  });

  const decision = decideSaleEligibility({
    hasTelegramPhone: collected.hasTelegramPhone,
    hpScore: collected.hpScore,
    hpThreshold: collected.hpThreshold,
    identifierHashes: hashes,
    existingBindings,
    requestedAccount,
    personKey,
    requireHumanPassport: saleRequiresHumanPassport(),
  });
  if (!decision.ok) return decision;

  const db = await getDbReady();
  return db.transaction(async (tx) => {
    await tx
      .insert(salePersons)
      .values({ personKey, personId, userId })
      .onConflictDoNothing({ target: salePersons.userId });

    const [storedPerson] = await tx
      .select({ personKey: salePersons.personKey, personId: salePersons.personId })
      .from(salePersons)
      .where(eq(salePersons.userId, userId))
      .limit(1);
    if (!storedPerson) throw new Error("sale_person upsert failed");

    for (let i = 0; i < collected.identifiers.length; i += 1) {
      const identifier = collected.identifiers[i];
      const idHash = hashes[i];
      const claimed = await tx
        .insert(salePersonIdentifiers)
        .values({ idHash, kind: identifier.kind, personKey: storedPerson.personKey })
        .onConflictDoNothing()
        .returning({ personKey: salePersonIdentifiers.personKey });
      if (claimed.length === 0) {
        const [owner] = await tx
          .select({ personKey: salePersonIdentifiers.personKey })
          .from(salePersonIdentifiers)
          .where(eq(salePersonIdentifiers.idHash, idHash))
          .limit(1);
        if (owner && owner.personKey !== storedPerson.personKey) {
          return { ok: false as const, reason: "identifier_bound_elsewhere" as const };
        }
      }
    }

    return {
      ok: true as const,
      personKey: storedPerson.personKey,
      personId: storedPerson.personId as Hex,
      identifiers: collected.identifiers,
      hasTelegramPhone: collected.hasTelegramPhone,
      hpScore: collected.hpScore,
      hpThreshold: collected.hpThreshold,
    };
  });
}

export type SaleBindingStatus = "issued" | "bound" | "unbound";

/** Latest verifier attestation for a person. `deadline` is the on-chain uint256 timestamp. */
export async function recordSaleBinding(input: {
  personId: string;
  account: Address | string;
  chainId: number;
  hub: string;
  nonce: string;
  deadline: Date;
  status: SaleBindingStatus;
}): Promise<void> {
  const db = await getDbReady();
  const account = input.account.toLowerCase();
  const now = new Date();
  await db
    .insert(saleBindings)
    .values({
      personId: input.personId,
      account,
      chainId: input.chainId,
      hub: input.hub,
      nonce: input.nonce,
      deadline: input.deadline,
      status: input.status,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: saleBindings.personId,
      set: {
        account,
        chainId: input.chainId,
        hub: input.hub,
        nonce: input.nonce,
        deadline: input.deadline,
        status: input.status,
        updatedAt: now,
      },
    });
}

export async function findSaleBindingByAccount(
  accountRaw: string,
): Promise<{ personId: string; account: string; status: string } | null> {
  if (!isAddress(accountRaw)) return null;
  const db = await getDbReady();
  const [row] = await db
    .select({
      personId: saleBindings.personId,
      account: saleBindings.account,
      status: saleBindings.status,
    })
    .from(saleBindings)
    .where(eq(sql`lower(${saleBindings.account})`, accountRaw.toLowerCase()))
    .limit(1);
  return row ?? null;
}
