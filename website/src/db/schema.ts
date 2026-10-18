import { sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/** Auth.js / NextAuth tables — names match @auth/drizzle-adapter defaults. */

export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [primaryKey({ columns: [account.provider, account.providerAccountId] })],
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (verificationToken) => [
    primaryKey({ columns: [verificationToken.identifier, verificationToken.token] }),
  ],
);

/** First-party mobile message connection; migration is reviewed/applied separately. */
export const mobileWalletSessions = pgTable("mobile_wallet_session", {
  id: text("id").primaryKey(),
  data: jsonb("data").notNull(),
  expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true }).notNull(),
}, (table) => [index("mobile_wallet_session_expires_idx").on(table.expiresAt)]);

/**
 * Partner profile. Referral graph here is off-chain CRM for the public site.
 * It mirrors Growth L1/L2 depth only and does not write consensus state.
 */
/** Encrypted embedded wallet per Auth.js user (cloud People Wallet). */
export const userWalletVaults = pgTable(
  "user_wallet_vault",
  {
    userId: text("userId")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    address: text("address").notNull(),
    publicKey: text("publicKey").notNull(),
    encryptedPrivateKey: text("encryptedPrivateKey").notNull(),
    vaultVersion: integer("vaultVersion").notNull().default(1),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().$defaultFn(() => new Date()),
  },
  (row) => [uniqueIndex("user_wallet_vault_address_idx").on(row.address)],
);

/**
 * recon.md R1: durable access log + rate-limit source for the wrap-key route specifically
 * (the in-memory `checkSlidingWindowRateLimit` resets on every deploy/restart and gives no
 * forensic trail). No key material is ever stored here, only who/when/outcome.
 */
export const walletVaultAccessLogs = pgTable(
  "wallet_vault_access_log",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    route: text("route").notNull(),
    outcome: text("outcome").notNull(),
    ip: text("ip"),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().$defaultFn(() => new Date()),
  },
  (row) => [index("wallet_vault_access_log_user_idx").on(row.userId, row.createdAt)],
);

export const partners = pgTable(
  "partner",
  {
    userId: text("userId")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    referralCode: text("referralCode").notNull(),
    referredByUserId: text("referredByUserId").references(() => users.id, { onDelete: "set null" }),
    walletAddress: text("walletAddress"),
    walletPublicKey: text("walletPublicKey"),
    walletBoundAt: timestamp("walletBoundAt", { mode: "date" }),
    challengeNonce: text("challengeNonce"),
    challengeExpiresAt: timestamp("challengeExpiresAt", { mode: "date" }),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().$defaultFn(() => new Date()),
  },
  (partner) => [
    uniqueIndex("partner_referral_code_idx").on(partner.referralCode),
    uniqueIndex("partner_wallet_address_idx").on(partner.walletAddress),
  ],
);

/** Project feed cards (off-chain curation; not consensus). */
export const discoverProjects = pgTable("discover_project", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  authorUserId: text("authorUserId").references(() => users.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  videoUri: text("videoUri"),
  screenshotUris: text("screenshotUris").notNull().default("[]"),
  tokenIconUri: text("tokenIconUri"),
  idea: text("idea").notNull(),
  audience: text("audience").notNull(),
  whyToken: text("whyToken").notNull(),
  tokenAssetId: text("tokenAssetId").notNull(),
  tokenLink: text("tokenLink").notNull(),
  productUrl: text("productUrl"),
  stageIndex: integer("stageIndex").notNull().default(0),
  revision: integer("revision").notNull().default(1),
  status: text("status").notNull().default("active"),
  weightedScore: doublePrecision("weightedScore").notNull().default(0),
  isSeed: boolean("isSeed").notNull().default(false),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().$defaultFn(() => new Date()),
});

export const discoverExposures = pgTable(
  "discover_exposure",
  {
    projectId: text("projectId")
      .notNull()
      .references(() => discoverProjects.id, { onDelete: "cascade" }),
    userId: text("userId").notNull(),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().$defaultFn(() => new Date()),
  },
  (row) => [primaryKey({ columns: [row.projectId, row.userId] })],
);

export const discoverReactions = pgTable(
  "discover_reaction",
  {
    projectId: text("projectId")
      .notNull()
      .references(() => discoverProjects.id, { onDelete: "cascade" }),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    vote: text("vote").notNull(),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().$defaultFn(() => new Date()),
  },
  (row) => [primaryKey({ columns: [row.projectId, row.userId, row.revision] })],
);

export const discoverFollows = pgTable(
  "discover_follow",
  {
    projectId: text("projectId")
      .notNull()
      .references(() => discoverProjects.id, { onDelete: "cascade" }),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().$defaultFn(() => new Date()),
  },
  (row) => [primaryKey({ columns: [row.projectId, row.userId] })],
);

export const discoverQuestions = pgTable("discover_question", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  projectId: text("projectId")
    .notNull()
    .references(() => discoverProjects.id, { onDelete: "cascade" }),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  revision: integer("revision").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().$defaultFn(() => new Date()),
});

export const discoverProductClicks = pgTable("discover_product_click", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  projectId: text("projectId")
    .notNull()
    .references(() => discoverProjects.id, { onDelete: "cascade" }),
  userId: text("userId").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().$defaultFn(() => new Date()),
});

export const discoverCardVisits = pgTable(
  "discover_card_visit",
  {
    projectId: text("projectId")
      .notNull()
      .references(() => discoverProjects.id, { onDelete: "cascade" }),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    visitCount: integer("visitCount").notNull().default(1),
    firstAt: timestamp("firstAt", { mode: "date" }).notNull().$defaultFn(() => new Date()),
    lastAt: timestamp("lastAt", { mode: "date" }).notNull().$defaultFn(() => new Date()),
  },
  (row) => [primaryKey({ columns: [row.projectId, row.userId] })],
);

/** Returning-user metric: first and subsequent /discover visits per account. */
export const discoverSiteVisits = pgTable("discover_site_visit", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  visitedAt: timestamp("visitedAt", { mode: "date" }).notNull().$defaultFn(() => new Date()),
});

/** Million founders program (testnet; off-chain until on-chain registry ships). */
export const founders = pgTable(
  "founder",
  {
    userId: text("userId")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    founderNumber: integer("founderNumber").notNull(),
    countryCode: text("countryCode").notNull(),
    entryMultiplier: doublePrecision("entryMultiplier").notNull(),
    totalPoints: integer("totalPoints").notNull().default(0),
    walletAddress: text("walletAddress").notNull(),
    verificationLevel: integer("verificationLevel").notNull().default(0),
    phoneHash: text("phoneHash"),
    invitedByUserId: text("invitedByUserId").references(() => users.id, { onDelete: "set null" }),
    isBot: boolean("isBot").notNull().default(false),
    /** Set only by a real Telegram-phone / Human Passport (strong) verification. */
    verifiedAt: timestamp("verifiedAt", { mode: "date" }),
    /**
     * Opt-in for public founder lists (transparency page): the next-auth name/avatar is
     * shown only when the founder turned this on themselves. Default off — no profile
     * data is ever published implicitly.
     */
    publicProfileOptIn: boolean("publicProfileOptIn").notNull().default(false),
    deviceSlotHash: text("deviceSlotHash"),
    ipSlotHash: text("ipSlotHash"),
    /**
     * Separate wallet scored for Human Passport (anti-sybil: a wallet already used as
     * someone's `walletAddress` or `passportWallet` can never be linked again). Lowercase.
     * When set, Human Passport scores this instead of `walletAddress`.
     */
    passportWallet: text("passportWallet"),
    registeredAt: timestamp("registeredAt", { mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (row) => [
    uniqueIndex("founder_number_idx").on(row.founderNumber),
    uniqueIndex("founder_wallet_idx").on(row.walletAddress),
    uniqueIndex("founder_phone_hash_idx").on(row.phoneHash),
    uniqueIndex("founder_passport_wallet_idx").on(row.passportWallet),
  ],
);

/** Single-use nonce for proving ownership of a wallet to be linked as `founder.passportWallet`. */
export const founderPassportNonces = pgTable(
  "founder_passport_nonce",
  {
    code: text("code").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expiresAt", { mode: "date" }).notNull(),
    usedAt: timestamp("usedAt", { mode: "date" }),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().$defaultFn(() => new Date()),
  },
  (row) => [index("founder_passport_nonce_user_idx").on(row.userId)],
);

export const founderPhoneRegistry = pgTable("founder_phone_registry", {
  phoneHash: text("phoneHash").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().$defaultFn(() => new Date()),
});

export const founderSlotCounts = pgTable("founder_slot_count", {
  slotHash: text("slotHash").primaryKey(),
  kind: text("kind").notNull(),
  founderCount: integer("founderCount").notNull().default(0),
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().$defaultFn(() => new Date()),
});

export const founderWorldIdNullifiers = pgTable(
  "founder_world_id_nullifier",
  {
    nullifier: numeric("nullifier", { precision: 78, scale: 0 }).notNull(),
    action: text("action").notNull(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    verifiedAt: timestamp("verifiedAt", { mode: "date" }).notNull().$defaultFn(() => new Date()),
  },
  (row) => [
    primaryKey({ columns: [row.nullifier, row.action] }),
    uniqueIndex("founder_world_id_user_action_idx").on(row.userId, row.action),
  ],
);

export const founderTelegramChats = pgTable("founder_telegram_chat", {
  chatId: text("chatId").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expiresAt", { mode: "date" }).notNull(),
  startCode: text("startCode"),
});

export const founderTelegramStartCodes = pgTable(
  "founder_telegram_start_code",
  {
    code: text("code").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expiresAt", { mode: "date" }).notNull(),
    usedAt: timestamp("usedAt", { mode: "date" }),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().$defaultFn(() => new Date()),
  },
  (row) => [index("founder_telegram_start_code_user_idx").on(row.userId)],
);

export const founderTelegramUsers = pgTable(
  "founder_telegram_user",
  {
    telegramUserId: text("telegramUserId").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().$defaultFn(() => new Date()),
  },
  (row) => [uniqueIndex("founder_telegram_user_user_idx").on(row.userId)],
);

export const founderDiscoverPeers = pgTable(
  "founder_discover_peer",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    peerUserId: text("peerUserId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().$defaultFn(() => new Date()),
  },
  (row) => [primaryKey({ columns: [row.userId, row.peerUserId] })],
);

export const founderCountryStats = pgTable("founder_country", {
  countryCode: text("countryCode").primaryKey(),
  founderCount: integer("founderCount").notNull().default(0),
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().$defaultFn(() => new Date()),
});

/** One-time demo ERC-20 pack for verified founders (L1+), cap 10k wallets. */
export const founderDemoTokenAirdrops = pgTable("founder_demo_token_airdrop", {
  userId: text("userId")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  walletAddress: text("walletAddress").notNull(),
  grantedAt: timestamp("grantedAt", { mode: "date" }).notNull().$defaultFn(() => new Date()),
  txSummary: text("txSummary"),
});

/** Lavka — local merchant loyalty (testnet). */
export const lavkaMerchants = pgTable(
  "lavka_merchant",
  {
    userId: text("userId")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    displayName: text("displayName").notNull(),
    countryCode: text("countryCode").notNull(),
    walletAddress: text("walletAddress").notNull(),
    ratingSum: integer("ratingSum").notNull().default(0),
    ratingCount: integer("ratingCount").notNull().default(0),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().$defaultFn(() => new Date()),
  },
  (row) => [
    uniqueIndex("lavka_merchant_slug_idx").on(row.slug),
    uniqueIndex("lavka_merchant_wallet_idx").on(row.walletAddress),
  ],
);

export const lavkaLoyaltyPrograms = pgTable(
  "lavka_loyalty_program",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    merchantUserId: text("merchantUserId")
      .notNull()
      .references(() => lavkaMerchants.userId, { onDelete: "cascade" }),
    chainProgramId: integer("chainProgramId").notNull(),
    title: text("title").notNull(),
    visitsPerPurchase: integer("visitsPerPurchase").notNull(),
    validUntil: timestamp("validUntil", { mode: "date" }),
    transferable: boolean("transferable").notNull().default(false),
    pricePpl: doublePrecision("pricePpl").notNull().default(0),
    createTxHash: text("createTxHash"),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().$defaultFn(() => new Date()),
  },
  (row) => [uniqueIndex("lavka_program_chain_id_idx").on(row.chainProgramId)],
);

export const lavkaRedemptions = pgTable(
  "lavka_redemption",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    programId: text("programId")
      .notNull()
      .references(() => lavkaLoyaltyPrograms.id, { onDelete: "cascade" }),
    customerUserId: text("customerUserId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    walletAddress: text("walletAddress").notNull(),
    visits: integer("visits").notNull().default(1),
    txHash: text("txHash").notNull(),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().$defaultFn(() => new Date()),
  },
  (row) => [uniqueIndex("lavka_redemption_tx_idx").on(row.txHash)],
);

export const lavkaCustomerLinks = pgTable(
  "lavka_customer_link",
  {
    merchantUserId: text("merchantUserId")
      .notNull()
      .references(() => lavkaMerchants.userId, { onDelete: "cascade" }),
    customerUserId: text("customerUserId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    firstRedeemAt: timestamp("firstRedeemAt", { mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (row) => [primaryKey({ columns: [row.merchantUserId, row.customerUserId] })],
);

export const lavkaEscrowRecords = pgTable(
  "lavka_escrow_record",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    chainEscrowId: integer("chainEscrowId").notNull(),
    merchantUserId: text("merchantUserId")
      .notNull()
      .references(() => lavkaMerchants.userId, { onDelete: "cascade" }),
    customerUserId: text("customerUserId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    amountPpl: doublePrecision("amountPpl").notNull(),
    deadline: timestamp("deadline", { mode: "date" }),
    status: text("status").notNull(),
    termsNote: text("termsNote"),
    createTxHash: text("createTxHash").notNull(),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().$defaultFn(() => new Date()),
  },
  (row) => [uniqueIndex("lavka_escrow_chain_idx").on(row.chainEscrowId)],
);

export const founderPointsLedger = pgTable(
  "founder_points_ledger",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    actionType: text("actionType").notNull(),
    basePoints: integer("basePoints").notNull(),
    entryMultiplier: doublePrecision("entryMultiplier").notNull(),
    awardedPoints: integer("awardedPoints").notNull(),
    dayKey: text("dayKey").notNull(),
    idempotencyKey: text("idempotencyKey").notNull(),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().$defaultFn(() => new Date()),
  },
  (row) => [uniqueIndex("founder_points_idempotency_idx").on(row.idempotencyKey)],
);

/** Million Founders referral bounty (2 levels). Spec: docs/FOUNDERS-REFERRAL.md */
export const founderReferralActivations = pgTable(
  "founder_referral_activation",
  {
    inviteeUserId: text("inviteeUserId")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    inviterUserId: text("inviterUserId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    season: integer("season").notNull(),
    /** Idempotency key of the first real action that proved the invitee active. */
    proofKey: text("proofKey").notNull(),
    proofAction: text("proofAction").notNull(),
    activatedAt: timestamp("activatedAt", { mode: "date" }).notNull().$defaultFn(() => new Date()),
  },
  (row) => [index("founder_referral_activation_inviter_idx").on(row.inviterUserId, row.season)],
);

export const founderReferralCredits = pgTable(
  "founder_referral_credit",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    beneficiaryUserId: text("beneficiaryUserId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourceInviteeUserId: text("sourceInviteeUserId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    season: integer("season").notNull(),
    level: integer("level").notNull(),
    kind: text("kind").notNull(),
    points: integer("points").notNull(),
    /** micro-PPL (PPL × 1e6) */
    pplMicro: numeric("pplMicro", { precision: 38, scale: 0 }).notNull(),
    dayKey: text("dayKey").notNull(),
    idempotencyKey: text("idempotencyKey").notNull(),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().$defaultFn(() => new Date()),
  },
  (row) => [
    uniqueIndex("founder_referral_credit_idem_idx").on(row.idempotencyKey),
    index("founder_referral_credit_benef_idx").on(row.beneficiaryUserId, row.season),
  ],
);

export const founderReferralPool = pgTable("founder_referral_pool", {
  season: integer("season").primaryKey(),
  spentPoints: integer("spentPoints").notNull().default(0),
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().$defaultFn(() => new Date()),
});

export const founderReferralAmbassadors = pgTable("founder_referral_ambassador", {
  userId: text("userId")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  maxActiveInvitees: integer("maxActiveInvitees").notNull(),
  approvedBy: text("approvedBy").notNull(),
  approvedAt: timestamp("approvedAt", { mode: "date" }).notNull().$defaultFn(() => new Date()),
});

/** Queued vesting claims. Payout is accounting only until the mainnet distribution contract exists. */
export const founderReferralClaims = pgTable(
  "founder_referral_claim",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** "ppl" for the Million Founders pool, else lowercase issuer token address. */
    asset: text("asset").notNull(),
    amount: numeric("amount", { precision: 38, scale: 0 }).notNull(),
    status: text("status").notNull().default("queued"),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().$defaultFn(() => new Date()),
  },
  (row) => [index("founder_referral_claim_user_idx").on(row.userId, row.asset)],
);

/** Issuer option on token launch. OFF unless a row with enabled=true exists. */
export const founderIssuerReferralPrograms = pgTable("founder_issuer_referral_program", {
  tokenAddress: text("tokenAddress").primaryKey(),
  issuerUserId: text("issuerUserId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(false),
  allocationBps: integer("allocationBps").notNull(),
  l1Bps: integer("l1Bps").notNull(),
  /** Token base units reserved for this program (total supply × allocationBps). */
  allocationAmount: numeric("allocationAmount", { precision: 38, scale: 0 }).notNull(),
  spentAmount: numeric("spentAmount", { precision: 38, scale: 0 }).notNull().default("0"),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().$defaultFn(() => new Date()),
});

export const founderIssuerReferralCredits = pgTable(
  "founder_issuer_referral_credit",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tokenAddress: text("tokenAddress").notNull(),
    beneficiaryUserId: text("beneficiaryUserId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    buyerUserId: text("buyerUserId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    level: integer("level").notNull(),
    amount: numeric("amount", { precision: 38, scale: 0 }).notNull(),
    idempotencyKey: text("idempotencyKey").notNull(),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().$defaultFn(() => new Date()),
  },
  (row) => [
    uniqueIndex("founder_issuer_referral_credit_idem_idx").on(row.idempotencyKey),
    index("founder_issuer_referral_credit_benef_idx").on(row.beneficiaryUserId, row.tokenAddress),
  ],
);

/** PPL community sale — off-chain orders + payment matching (multichain). */
export const pplSaleOrders = pgTable(
  "ppl_sale_order",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    networkId: text("networkId").notNull(),
    stable: text("stable").notNull(),
    peopleAddress: text("peopleAddress").notNull(),
    // M05-7: the wallet the buyer pays FROM, for the three non-EVM rails (Tron/TON/Solana).
    // EVM leaves this null — it is already bound via the on-chain Purchased event's destination.
    payerAddress: text("payerAddress"),
    status: text("status").notNull().default("pending_payment"),
    usdtQuoted: doublePrecision("usdtQuoted").notNull(),
    pplQuoted: doublePrecision("pplQuoted").notNull(),
    paymentMicro: numeric("paymentMicro", { precision: 24, scale: 0 }).notNull(),
    paymentMemo: text("paymentMemo"),
    soldPplAtQuote: doublePrecision("soldPplAtQuote").notNull(),
    paymentTxId: text("paymentTxId"),
    paymentSeenAt: timestamp("paymentSeenAt", { mode: "date" }),
    confirmedAt: timestamp("confirmedAt", { mode: "date" }),
    deliveryTxId: text("deliveryTxId"),
    deliveredAt: timestamp("deliveredAt", { mode: "date" }),
    expiresAt: timestamp("expiresAt", { mode: "date" }).notNull(),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().$defaultFn(() => new Date()),
  },
  (row) => [
    // M05-4: tx hashes are compared case-insensitively — RPCs accept hex in any letter case.
    uniqueIndex("ppl_sale_payment_tx_lower_idx").on(row.networkId, sql`lower(${row.paymentTxId})`),
  ],
);

/** Bug bounty reports submitted from the floating bug button (any page). */
export const bugReports = pgTable(
  "bug_report",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    /** Null for Telegram reporters who have no linked site account. */
    userId: text("userId").references(() => users.id, { onDelete: "cascade" }),
    /** "bug" | "support". */
    type: text("type").notNull().default("bug"),
    /** "site" (bug button) | "telegram" (bot DM). */
    source: text("source").notNull().default("site"),
    telegramChatId: text("telegramChatId"),
    telegramUsername: text("telegramUsername"),
    telegramPhotoFileId: text("telegramPhotoFileId"),
    description: text("description").notNull(),
    /** Compressed JPEG data URL (client-captured), or null when no screenshot was attached. */
    screenshotData: text("screenshotData"),
    /** Auto-captured context: url, route, viewport, userAgent, theme, locale, appVersion, walletAddress. */
    context: jsonb("context").notNull().default({}),
    status: text("status").notNull().default("new"),
    severity: text("severity"),
    rewardPoints: integer("rewardPoints").notNull().default(0),
    adminNote: text("adminNote"),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().$defaultFn(() => new Date()),
  },
  (row) => [
    index("bug_report_user_idx").on(row.userId, row.createdAt),
    index("bug_report_status_idx").on(row.status, row.createdAt),
  ],
);

/** Small key/value store for the Telegram bot (owner chat id, per-chat conversation state). */
export const telegramBotState = pgTable("telegram_bot_state", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().$defaultFn(() => new Date()),
});

/**
 * api-cron.md M2: one-shot on-chain payments already consumed by an AI-icon batch. The
 * previous in-process `Set` reset on every deploy/restart and was per Vercel instance, so the
 * same payment could be replayed for unlimited batches. `paymentTxId` (lowercased) is unique,
 * so insert-on-claim is atomic across instances and a unique violation means "already used".
 */
export const factoryIconPaymentTxs = pgTable(
  "factory_icon_payment_tx",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    paymentTxId: text("paymentTxId").notNull(),
    walletAddress: text("walletAddress").notNull(),
    dayKey: text("dayKey").notNull(),
    claimedAt: timestamp("claimedAt", { mode: "date" }).notNull().$defaultFn(() => new Date()),
  },
  (row) => [uniqueIndex("factory_icon_payment_tx_id_idx").on(row.paymentTxId)],
);

/**
 * api-cron.md M2: durable per-UTC-day generation counters (free quota, paid/global cap).
 * `walletAddress` = "*" is the all-wallets global row. The previous Map counters were scoped
 * to a single instance, multiplying the effective daily cap by the number of instances.
 */
export const factoryIconDailyUsage = pgTable(
  "factory_icon_daily_usage",
  {
    dayKey: text("dayKey").notNull(),
    walletAddress: text("walletAddress").notNull(),
    usedCount: integer("usedCount").notNull().default(0),
    updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().$defaultFn(() => new Date()),
  },
  (row) => [primaryKey({ columns: [row.dayKey, row.walletAddress] })],
);

/**
 * api-cron.md M2: generic durable fixed-window rate limiter for routes where the in-process
 * `checkSlidingWindowRateLimit` is not enough (it multiplies by instance count and forgets on
 * every cold start). Keyed by namespace:subject:windowStart so an upsert is a single atomic
 * increment even under concurrency.
 */
export const apiRateLimits = pgTable(
  "api_rate_limit",
  {
    bucketKey: text("bucketKey").primaryKey(),
    count: integer("count").notNull().default(0),
    expiresAt: timestamp("expiresAt", { mode: "date" }).notNull(),
  },
  (row) => [index("api_rate_limit_expires_idx").on(row.expiresAt)],
);
