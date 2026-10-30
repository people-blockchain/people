import assert from "node:assert/strict";
import test from "node:test";
import { MediaUploadError } from "../src/lib/media-upload-client.ts";
import { NftSaveError } from "../src/lib/nft-media-client.ts";
import { saveNftFiles } from "../src/components/factory/nft/saveNftFiles.ts";

const CODES = [
  "size_mismatch",
  "sha256_mismatch",
  "content_mismatch",
  "rate_limited",
  "nonce_used",
  "nonce_expired",
  "nonce_missing",
  "verify_unavailable",
  "network",
  "timeout",
];

function imageInput(upload, stages) {
  return {
    kind: "image",
    name: "Badge",
    description: "A badge",
    imageFile: new File([Buffer.from("GIF89a")], "a.gif", { type: "image/gif" }),
    imageMime: "image/gif",
    imageUrl: "",
    coverFile: null,
    coverMime: "",
    videoFile: null,
    videoMime: "",
    upload,
    onStage: (id, patch) => stages.push({ id, ...patch }),
  };
}

test("saveNftFiles ends the saving stage and surfaces every direct-upload error", async () => {
  for (const code of CODES) {
    const stages = [];
    await assert.rejects(
      () => saveNftFiles(imageInput(async () => {
        throw new MediaUploadError(code);
      }, stages)),
      (err) => err instanceof NftSaveError && err.uploadCode === code && err.key === "errUnknown",
      code,
    );
    assert.deepEqual(
      stages.filter((row) => row.id === "image").map((row) => row.status),
      ["active", "failed"],
      code,
    );
  }
});
