/**
 * Browser-side half of the NFT media flow: cheap pre-checks (the server stays authoritative)
 * and the calls to `/api/factory/nft/*`. Nothing here produces a `blob:` or `data:` value that
 * could reach the metadata; stored addresses come only from the server responses.
 */
import {
  NFT_IMAGE_MAX_BYTES,
  NFT_SVG_MAX_BYTES,
  NFT_VIDEO_MAX_BYTES,
  directImageKindFromMime,
  maxBytesForDirectImage,
  type NftDirectImageKind,
  type NftImageKind,
  type NftVideoType,
} from "./nft-media-rules";

export type NftErrorKey =
  | "errCoverRequired"
  | "errUnsupportedType"
  | "errTooLarge"
  | "errContentMismatch"
  | "errSvgRejected"
  | "errVideoRejected"
  | "errVideoVerifyUnavailable"
  | "errStorageUnavailable"
  | "errVideoStorageUnavailable"
  | "errRateLimited"
  | "errNetwork"
  | "errNetworkRpc"
  | "errStableFeeUnavailable"
  | "errStableDailyCap"
  | "errInsufficientPpl"
  | "errInsufficientPplGeneric"
  | "errPinFailed"
  | "errMissingFile"
  | "errInvalidName"
  | "errInvalidDescription"
  | "errInvalidUrl"
  | "errWalletRejected"
  | "errReverted"
  | "errNotCreator"
  | "errNotCollection"
  | "errInvalidAddress"
  | "errFactoryMissing"
  | "errWrongNetwork"
  | "errTimeout"
  | "errUnknown";

/** Error codes returned by the `/api/factory/nft/*` routes, mapped to a copy key. */
const SERVER_ERROR_KEYS: Record<string, NftErrorKey> = {
  unsupported_type: "errUnsupportedType",
  file_too_large: "errTooLarge",
  content_type_mismatch: "errContentMismatch",
  svg_rejected: "errSvgRejected",
  video_rejected: "errVideoRejected",
  video_verify_unavailable: "errVideoVerifyUnavailable",
  storage_unavailable: "errStorageUnavailable",
  video_storage_unavailable: "errVideoStorageUnavailable",
  rate_limited: "errRateLimited",
  pin_failed: "errPinFailed",
  missing_file: "errMissingFile",
  invalid_name: "errInvalidName",
  invalid_description: "errInvalidDescription",
  invalid_image_uri: "errInvalidUrl",
  invalid_animation_uri: "errInvalidUrl",
  metadata_too_large: "errInvalidDescription",
  invalid_metadata: "errUnknown",
};

export class NftSaveError extends Error {
  readonly key: NftErrorKey;
  readonly detail: string;
  /** Direct-upload error code, when the alert should use the media-upload strings. */
  readonly uploadCode?: string;
  constructor(key: NftErrorKey, detail: string, uploadCode?: string) {
    super(detail);
    this.key = key;
    this.detail = detail;
    this.uploadCode = uploadCode;
    this.name = "NftSaveError";
  }
}

export function errorKeyForServerCode(code: string): NftErrorKey {
  return SERVER_ERROR_KEYS[code] ?? "errUnknown";
}

const EXT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  mp4: "video/mp4",
  webm: "video/webm",
};

/** Declared MIME type, or one inferred from the extension when the browser reports none. */
export function effectiveMime(file: { name: string; type: string }): string {
  if (file.type) return file.type.toLowerCase();
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TYPES[ext] ?? "";
}

export type PickedFile<K> = { ok: true; kind: K; mime: string } | { ok: false; key: NftErrorKey };

/** UX pre-check for an image or cover. */
export function checkImageFile(file: { name: string; type: string; size: number }): PickedFile<NftDirectImageKind> {
  const mime = effectiveMime(file);
  const kind = directImageKindFromMime(mime);
  if (!kind) return { ok: false, key: "errUnsupportedType" };
  if (file.size <= 0) return { ok: false, key: "errMissingFile" };
  if (file.size > maxBytesForDirectImage(kind)) return { ok: false, key: "errTooLarge" };
  return { ok: true, kind, mime };
}

/** UX pre-check for a video. QuickTime (`.mov`) is refused: PeopleScan would not play it. */
export function checkVideoFile(file: { name: string; type: string; size: number }): PickedFile<NftVideoType> {
  const mime = effectiveMime(file);
  if (mime !== "video/mp4" && mime !== "video/webm") return { ok: false, key: "errUnsupportedType" };
  if (file.size <= 0) return { ok: false, key: "errMissingFile" };
  if (file.size > NFT_VIDEO_MAX_BYTES) return { ok: false, key: "errTooLarge" };
  return { ok: true, kind: mime, mime };
}

export { NFT_IMAGE_MAX_BYTES, NFT_SVG_MAX_BYTES, NFT_VIDEO_MAX_BYTES };

export type StoredImage = {
  uri: string;
  gatewayUrl: string;
  kind: NftImageKind;
  /** Browser-safe preview: the data URL of the sanitized SVG, or the gateway URL. */
  previewUrl: string;
};

export type StoredVideo = { uri: string; gatewayUrl: string };

export type StoredMetadata = { tokenUri: string; gatewayUrl: string };

async function readError(res: Response): Promise<NftSaveError> {
  const body = (await res.json().catch(() => ({}))) as { error?: unknown };
  const code = typeof body.error === "string" ? body.error : `http_${res.status}`;
  return new NftSaveError(errorKeyForServerCode(code), code);
}

async function postJson<T>(url: string, payload: unknown, fetchImpl: typeof fetch): Promise<T> {
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    throw new NftSaveError("errNetwork", err instanceof Error ? err.message : "network");
  }
  if (!res.ok) throw await readError(res);
  return (await res.json()) as T;
}

export async function uploadNftImage(file: File, mime: string, fetchImpl: typeof fetch = fetch): Promise<StoredImage> {
  const form = new FormData();
  form.append("file", new File([file], file.name, { type: mime }));
  let res: Response;
  try {
    res = await fetchImpl("/api/factory/nft/image", { method: "POST", body: form });
  } catch (err) {
    throw new NftSaveError("errNetwork", err instanceof Error ? err.message : "network");
  }
  if (!res.ok) throw await readError(res);
  const body = (await res.json()) as {
    uri: string;
    gatewayUrl: string;
    kind: NftImageKind;
    sanitizedSvgBase64?: string;
  };
  return {
    uri: body.uri,
    gatewayUrl: body.gatewayUrl,
    kind: body.kind,
    previewUrl: body.sanitizedSvgBase64 ? `data:image/svg+xml;base64,${body.sanitizedSvgBase64}` : body.gatewayUrl,
  };
}

function putVideo(url: string, file: File, mime: string, onProgress: (percent: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
    };
    xhr.onerror = () => reject(new NftSaveError("errNetwork", "video upload failed"));
    xhr.ontimeout = () => reject(new NftSaveError("errNetwork", "video upload timed out"));
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new NftSaveError(xhr.status === 413 ? "errTooLarge" : "errVideoRejected", `storage ${xhr.status}`));
        return;
      }
      try {
        const body = JSON.parse(xhr.responseText) as { data?: { id?: unknown } };
        const id = body.data?.id;
        if (typeof id !== "string" || !id) throw new Error("no id");
        onProgress(100);
        resolve(id);
      } catch {
        reject(new NftSaveError("errPinFailed", "video upload response"));
      }
    };
    const form = new FormData();
    form.append("file", new File([file], file.name, { type: mime }));
    xhr.send(form);
  });
}

/** Sign, upload straight to storage, and return the stored file id. The id still needs `verifyNftVideo`. */
export async function uploadNftVideo(
  file: File,
  mime: NftVideoType,
  onProgress: (percent: number) => void,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const { url } = await postJson<{ url: string }>("/api/factory/nft/video/sign", { type: mime, size: file.size }, fetchImpl);
  return putVideo(url, file, mime, onProgress);
}

export async function verifyNftVideo(id: string, fetchImpl: typeof fetch = fetch): Promise<StoredVideo> {
  const body = await postJson<{ uri: string; gatewayUrl: string }>("/api/factory/nft/video/verify", { id }, fetchImpl);
  return { uri: body.uri, gatewayUrl: body.gatewayUrl };
}

export async function saveNftMetadata(
  input: { name: string; description: string; image: string; animationUrl?: string },
  fetchImpl: typeof fetch = fetch,
): Promise<StoredMetadata> {
  return postJson<StoredMetadata>("/api/factory/nft/metadata", input, fetchImpl);
}
