/** Vault decrypt succeeded but the recovered key does not match the stored address. */
export const LEGACY_ADDRESS_MISMATCH = "legacy_address_mismatch";

/** Client stages of the vault → Turnkey import. Logged on import/complete 409s. */
export const TURNKEY_IMPORT_STAGES = ["decrypt", "match", "stamp", "init"] as const;
export type TurnkeyImportStage = (typeof TURNKEY_IMPORT_STAGES)[number];

export const TURNKEY_API_PUBKEY_STORAGE_KEY = "ppl-turnkey-api-pubkey";
