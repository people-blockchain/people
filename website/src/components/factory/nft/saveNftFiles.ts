import { fileForDirectUpload, MediaUploadError, uploadDirect, type MediaUploadCode } from "@/lib/media-upload-client";
import { normalizeUploadMime } from "@/lib/media-upload-rules";
import {
  NftSaveError,
  saveNftMetadata,
  uploadNftImage,
  type NftErrorKey,
  type StoredMetadata,
  type StoredVideo,
} from "@/lib/nft-media-client";
import { isAllowedMediaUri, type NftVideoType } from "@/lib/nft-media-rules";

export type NftKind = "image" | "video";
export type StageId = "image" | "cover" | "video" | "verify" | "metadata";
export type StageStatus = "pending" | "active" | "done" | "failed";
export type StageRow = { id: StageId; status: StageStatus; percent?: number };

/** Stages shown for a save, in order. */
export function stagesFor(kind: NftKind, hasImageFile: boolean): StageRow[] {
  const rows: StageId[] = kind === "video" ? ["cover", "video", "verify", "metadata"] : hasImageFile ? ["image", "metadata"] : ["metadata"];
  return rows.map((id) => ({ id, status: "pending" as const }));
}

export type SaveInput = {
  kind: NftKind;
  name: string;
  description: string;
  imageFile: File | null;
  imageMime: string;
  /** Permanent address pasted instead of a file (image kind only). */
  imageUrl: string;
  coverFile: File | null;
  coverMime: string;
  videoFile: File | null;
  videoMime: NftVideoType | "";
  onStage: (id: StageId, patch: Partial<StageRow>) => void;
};

export type SaveResult = {
  metadata: StoredMetadata;
  /** Address that goes into metadata as `image`, and an HTTPS/data address to show it. */
  imageUri: string;
  imagePreviewUrl: string;
  video?: StoredVideo;
};

// Uploads are idempotent (same bytes, same address), but a retry still skips work already done.
const imageCache = new WeakMap<File, { uri: string; previewUrl: string }>();
const videoCache = new WeakMap<File, StoredVideo>();

const UPLOAD_SAVE_KEY: Record<MediaUploadCode, NftErrorKey> = {
  file_too_large: "errTooLarge",
  unsupported_format: "errUnsupportedType",
  link_expired: "errTimeout",
  sha256_mismatch: "errContentMismatch",
  content_mismatch: "errContentMismatch",
  size_mismatch: "errContentMismatch",
  rate_limited: "errRateLimited",
  network: "errNetwork",
  wallet_rejected: "errWalletRejected",
  wallet_missing: "errWalletRejected",
  nonce_used: "errTimeout",
  nonce_expired: "errTimeout",
  nonce_missing: "errTimeout",
  storage_unavailable: "errStorageUnavailable",
  pin_failed: "errPinFailed",
  bad_signature: "errWalletRejected",
  verify_unavailable: "errVideoVerifyUnavailable",
  invalid_request: "errMissingFile",
};

function rethrowUpload(error: unknown): never {
  if (error instanceof MediaUploadError) throw new NftSaveError(UPLOAD_SAVE_KEY[error.code], error.code);
  throw error;
}

async function step<T>(input: SaveInput, id: StageId, work: () => Promise<T>): Promise<T> {
  input.onStage(id, { status: "active", percent: undefined });
  try {
    const out = await work();
    input.onStage(id, { status: "done" });
    return out;
  } catch (err) {
    input.onStage(id, { status: "failed" });
    throw err;
  }
}

async function storeImage(input: SaveInput, id: StageId, file: File, mime: string): Promise<{ uri: string; previewUrl: string }> {
  const cached = imageCache.get(file);
  if (cached) {
    input.onStage(id, { status: "done" });
    return cached;
  }
  const type = normalizeUploadMime(mime);
  const stored = await step(input, id, async () => {
    if (type === "image/svg+xml") {
      const legacy = await uploadNftImage(file, mime);
      return { uri: legacy.uri, previewUrl: legacy.previewUrl };
    }
    try {
      const out = await uploadDirect(fileForDirectUpload(file, type), "nft-image");
      return { uri: out.uri, previewUrl: out.gatewayUrl };
    } catch (error) {
      rethrowUpload(error);
    }
  });
  imageCache.set(file, stored);
  return stored;
}

/**
 * Stores everything the NFT needs, in order. Raster images and video use a direct signed upload.
 * SVG still uses the legacy image route. Metadata is saved after the files.
 */
export async function saveNftFiles(input: SaveInput): Promise<SaveResult> {
  let imageUri: string;
  let imagePreviewUrl: string;
  let video: StoredVideo | undefined;

  if (input.kind === "video") {
    if (!input.coverFile) throw new NftSaveError("errCoverRequired", "cover required");
    if (!input.videoFile || !input.videoMime) throw new NftSaveError("errMissingFile", "video required");
    const cover = await storeImage(input, "cover", input.coverFile, input.coverMime);
    imageUri = cover.uri;
    imagePreviewUrl = cover.previewUrl;

    const videoFile = input.videoFile;
    const videoMime = input.videoMime;
    video = videoCache.get(videoFile);
    if (video) {
      input.onStage("video", { status: "done" });
      input.onStage("verify", { status: "done" });
    } else {
      video = await step(input, "video", async () => {
        try {
          const out = await uploadDirect(fileForDirectUpload(videoFile, videoMime), "nft-video");
          return { uri: out.uri, gatewayUrl: out.gatewayUrl };
        } catch (error) {
          rethrowUpload(error);
        }
      });
      input.onStage("verify", { status: "done" });
      videoCache.set(videoFile, video);
    }
  } else if (input.imageFile) {
    const image = await storeImage(input, "image", input.imageFile, input.imageMime);
    imageUri = image.uri;
    imagePreviewUrl = image.previewUrl;
  } else {
    const url = input.imageUrl.trim();
    if (!isAllowedMediaUri(url)) throw new NftSaveError("errInvalidUrl", "image url");
    imageUri = url;
    imagePreviewUrl = url.startsWith("ipfs://") ? `https://ipfs.io/ipfs/${url.slice("ipfs://".length)}` : url;
  }

  const metadata = await step(input, "metadata", () =>
    saveNftMetadata({
      name: input.name,
      description: input.description,
      image: imageUri,
      ...(video ? { animationUrl: video.uri } : {}),
    }),
  );
  return { metadata, imageUri, imagePreviewUrl, video };
}
