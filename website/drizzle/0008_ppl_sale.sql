CREATE TABLE IF NOT EXISTS "ppl_sale_order" (
  "id" text PRIMARY KEY NOT NULL,
  "networkId" text NOT NULL,
  "stable" text NOT NULL,
  "peopleAddress" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending_payment',
  "usdtQuoted" double precision NOT NULL,
  "pplQuoted" double precision NOT NULL,
  "paymentMicro" numeric(24, 0) NOT NULL,
  "paymentMemo" text,
  "soldPplAtQuote" double precision NOT NULL,
  "paymentTxId" text,
  "paymentSeenAt" timestamp,
  "confirmedAt" timestamp,
  "deliveryTxId" text,
  "deliveredAt" timestamp,
  "expiresAt" timestamp NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "ppl_sale_payment_tx_idx" ON "ppl_sale_order" ("networkId", "paymentTxId");
