-- M05-4: on-chain tx hashes can arrive in any hex letter case, but the old unique index
-- compared raw strings, so "0xAB.." and "0xab.." were different keys and one payment could
-- confirm many orders. Before applying, check for existing duplicate
-- (networkId, lower(paymentTxId)) rows and resolve them manually — this migration does not
-- touch data.
DROP INDEX IF EXISTS "ppl_sale_payment_tx_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "ppl_sale_payment_tx_lower_idx" ON "ppl_sale_order" ("networkId", (lower("paymentTxId")));
