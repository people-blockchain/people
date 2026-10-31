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

/**
 * The mint is already on chain. Close the draft so a reload shows the result instead of the
 * "still in progress" notice, and so the next click cannot send a second mint.
 */
export function applyConfirmedMint(draft: NftMintDraft, tokenId: string, mintTx?: string): NftMintDraft {
  return {
    ...draft,
    status: "done",
    tokenId,
    ...(mintTx ? { mintTx } : {}),
    mintAttempted: false,
  };
}

/**
 * The attempt ended without a mint to resume: the wallet refused, the tx reverted, or the
 * inputs were rejected. `status` leaves `in_progress` so the form stops saying a previous
 * attempt is still running. A collection and its create hash stay, so a retry does not deploy
 * a second collection. A reverted mint hash is dropped so the retry can send a new one.
 */
export function releaseMintAttempt(draft: NftMintDraft, clearMintTx = false): NftMintDraft {
  return {
    ...draft,
    status: "saved",
    mintAttempted: false,
    ...(clearMintTx ? { mintTx: undefined } : {}),
  };
}

/**
 * Timeout and a dropped connection are not finished: the tx may still land, so the draft stays
 * open. `unknown` after a mint was broadcast stays open for the same reason. Everything else
 * (reject, revert, not enough fee, bad input) is finished.
 */
export function shouldReleaseAttempt(code: string, draft: Pick<NftMintDraft, "mintTx" | "mintAttempted">): boolean {
  if (code === "timeout" || code === "network") return false;
  if (code === "unknown" && (draft.mintTx || draft.mintAttempted)) return false;
  return true;
}

/**
 * The notice is for a stored attempt that is not the one running now. `busy` is the in-flight
 * attempt; a second click is refused by the caller while that is true. A confirmed mint
 * (`done`) and a released attempt (`saved`) do not show it.
 */
export function showsResumeNotice(draft: NftMintDraft | null, busy: boolean): boolean {
  if (busy || !draft || draft.status !== "in_progress") return false;
  return Boolean(draft.payTx || draft.createTx || draft.mintTx || draft.mintAttempted);
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

export function browserStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
