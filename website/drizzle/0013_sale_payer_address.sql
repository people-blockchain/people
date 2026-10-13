-- M05-7: sale orders/payments weren't bound to payer identity on the non-EVM rails. Each
-- Tron/TON/Solana order now records the exact wallet the buyer pays FROM, so an unrelated
-- transfer of the right amount can no longer satisfy someone else's order. EVM is unaffected —
-- it is already bound via the on-chain Purchased event's destination (order.peopleAddress).
-- Nullable: rows created before this migration have no payerAddress, and the matcher keeps the
-- old amount-only behavior for those in-flight orders.
ALTER TABLE "ppl_sale_order" ADD COLUMN IF NOT EXISTS "payerAddress" text;
