/**
 * Resume state for an NFT mint, so a retry or a page reload never sends a second mint.
 *
 * The draft is written to `localStorage` (scoped by wallet address) as soon as the metadata is
 * stored, and updated with every transaction hash *before* the page waits for its receipt. The
 * plan below turns a draft into the remaining steps; a draft that already has a `mintTx` can only
 * produce a wait, never a send. Storage failures (private mode) degrade to memory.
 */

export type NftMintMode = "single" | "collection";
export type NftMintKind = "image" | "video";

export type NftMintDraft = {
  version: 1;
  /** Lower-case wallet address the draft belongs to. */
  owner: string;
  status: "saved" | "in_progress" | "done";
  mode: NftMintMode;
  kind: NftMintKind;
  name: string;
  /** Permanent address of the metadata JSON; this is what the transaction carries. */
  tokenUri: string;
  /** HTTPS address of the stored image or cover, for showing the result. */
  imagePreviewUrl: string;
  /** HTTPS address of the stored video (video kind only). */
  videoPreviewUrl?: string;
  description?: string;
  /** Existing collection (collection mode). */
  collectionInput?: string;
  payWith: string;
  /** Collection created or chosen for this mint. */
  collection?: string;
  payTx?: string;
  payDone?: boolean;
  createTx?: string;
  /** Set just before a mint is sent; it makes the next run look for an already-minted token first. */
  mintAttempted?: boolean;
  mintTx?: string;
  tokenId?: string;
};

export type MintStep = "pay" | "wait_pay" | "create" | "wait_create" | "check_existing" | "mint" | "wait_mint" | "show_result";

/** What is left to do for this draft, in order. */
export function planResume(draft: NftMintDraft): MintStep[] {
  if (draft.status === "done") return ["show_result"];
  if (draft.mintTx) return ["wait_mint"];
  const steps: MintStep[] = [];
  if (draft.payWith !== "PPL" && !draft.payDone) steps.push(draft.payTx ? "wait_pay" : "pay");
  if (draft.mode === "single" && !draft.collection) steps.push(draft.createTx ? "wait_create" : "create");
  if (draft.mintAttempted) steps.push("check_existing");
  steps.push("mint", "wait_mint");
  return steps;
}

/** A draft worth offering to resume: it has progressed past plain "files saved". */
export function isResumable(draft: NftMintDraft | null): boolean {
  return Boolean(draft && draft.status !== "done" && (draft.payTx || draft.createTx || draft.mintTx || draft.collection || draft.mintAttempted));
}

export const NFT_DRAFT_KEY = "people_nft_mint_draft_v1";

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function isDraft(value: unknown): value is NftMintDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<NftMintDraft>;
  return (
    draft.version === 1 &&
    typeof draft.owner === "string" &&
    typeof draft.tokenUri === "string" &&
    draft.tokenUri.startsWith("ipfs://") &&
    (draft.mode === "single" || draft.mode === "collection") &&
    (draft.kind === "image" || draft.kind === "video") &&
    typeof draft.name === "string" &&
    typeof draft.payWith === "string" &&
    (draft.status === "saved" || draft.status === "in_progress" || draft.status === "done")
  );
}

/** Draft storage that falls back to memory when `localStorage` is unavailable or throws. */
export function createDraftStore(getStorage: () => StorageLike | null) {
  const memory = new Map<string, string>();
  const keyFor = (owner: string) => `${NFT_DRAFT_KEY}:${owner.toLowerCase()}`;
  return {
    load(owner: string): NftMintDraft | null {
      const key = keyFor(owner);
      let raw: string | null = memory.get(key) ?? null;
      try {
        raw = getStorage()?.getItem(key) ?? raw;
      } catch {
        /* memory copy */
      }
      if (!raw) return null;
      try {
        const parsed: unknown = JSON.parse(raw);
        return isDraft(parsed) && parsed.owner === owner.toLowerCase() ? parsed : null;
      } catch {
        return null;
      }
    },
    save(draft: NftMintDraft): void {
      const key = keyFor(draft.owner);
      const raw = JSON.stringify(draft);
      memory.set(key, raw);
      try {
        getStorage()?.setItem(key, raw);
      } catch {
        /* memory copy only */
      }
    },
    clear(owner: string): void {
      const key = keyFor(owner);
      memory.delete(key);
      try {
        getStorage()?.removeItem(key);
      } catch {
        /* nothing to clear */
      }
    },
  };
}

/** What the form tells the user after the stored transaction was checked against its receipt. */
export type DraftRestoreNotice = "payment_counted" | "failed" | null;

export type DraftRestore = {
  /** Fields to merge into the draft (`undefined` removes a hash that can never confirm). */
  patch: Partial<NftMintDraft>;
  notice: DraftRestoreNotice;
  /** The mint transaction succeeded: read its token id from the receipt and finish. */
  mintSucceeded: boolean;
};

/** The one transaction a reload has to look at: the most advanced hash the draft holds. */
export function pendingDraftTx(draft: NftMintDraft): { step: "pay" | "create" | "mint"; hash: string } | null {
  if (draft.status === "done") return null;
  if (draft.mintTx) return { step: "mint", hash: draft.mintTx };
  if (draft.createTx && !draft.collection) return { step: "create", hash: draft.createTx };
  if (draft.payTx && draft.payWith !== "PPL" && !draft.payDone) return { step: "pay", hash: draft.payTx };
  return null;
}

/**
 * Turns the receipt outcome of `pendingDraftTx` into draft changes. A failed transaction drops its
 * hash so the retry sends a fresh one; a confirmed payment is marked done so it is never charged twice.
 */
export function restoreFromReceipt(
  step: "pay" | "create" | "mint",
  outcome: "success" | "failed" | "pending",
): DraftRestore {
  const none: DraftRestore = { patch: {}, notice: null, mintSucceeded: false };
  if (outcome === "pending") return none;
  if (outcome === "success") {
    if (step === "mint") return { ...none, mintSucceeded: true };
    if (step === "pay") return { patch: { payDone: true }, notice: "payment_counted", mintSucceeded: false };
    return none;
  }
  if (step === "mint") return { patch: { mintTx: undefined, mintAttempted: undefined }, notice: "failed", mintSucceeded: false };
  if (step === "create") return { patch: { createTx: undefined }, notice: "failed", mintSucceeded: false };
  return { patch: { payTx: undefined }, notice: "failed", mintSucceeded: false };
}

export function browserStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
