import { parseIpfsUri, ipfsGatewayUrl } from "@/lib/ipfs";

export function resolveDiscoverVideoUrl(videoUri: string | null | undefined): string {
  const trimmed = videoUri?.trim() ?? "";
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  const cid = parseIpfsUri(trimmed);
  if (cid) {
    try {
      return ipfsGatewayUrl(cid);
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

import { DISCOVER_SCORING } from "@/lib/discover/scoring-config";

export const DISCOVER_VIDEO_MIN_SECONDS = DISCOVER_SCORING.videoMinSeconds;
export const DISCOVER_VIDEO_MAX_SECONDS = DISCOVER_SCORING.videoMaxSeconds;

export async function readVideoDurationSeconds(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(video.duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("invalid_video"));
    };
    video.src = url;
  });
}
