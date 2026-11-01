export type OEmbedPayload = {
  author_url?: string;
  html?: string;
};

export type XReplyCheckInput = {
  replyUrl: string;
  linkedHandle: string;
  personalCode: string;
  fetchOEmbed?: (url: string) => Promise<OEmbedPayload | null>;
};

export type XReplyCheckResult =
  | { ok: true }
  | { ok: false; reason: "invalid_url" | "fetch_failed" | "author_mismatch" | "code_missing" };

const X_STATUS =
  /^https?:\/\/(?:(?:www\.)?(?:twitter|x)\.com)\/([a-zA-Z0-9_]{1,15})\/status\/(\d+)/i;

export function parseXStatusUrl(raw: string): { handle: string; statusId: string } | null {
  const url = raw.trim();
  const m = X_STATUS.exec(url);
  if (!m) return null;
  return { handle: m[1].toLowerCase(), statusId: m[2] };
}

export async function verifyXReplyViaOembed(input: XReplyCheckInput): Promise<XReplyCheckResult> {
  const parsed = parseXStatusUrl(input.replyUrl);
  if (!parsed) return { ok: false, reason: "invalid_url" };
  const linked = input.linkedHandle.trim().replace(/^@/, "").toLowerCase();
  if (parsed.handle !== linked) return { ok: false, reason: "author_mismatch" };

  const fetchImpl =
    input.fetchOEmbed ??
    (async (replyUrl: string) => {
      const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(replyUrl)}`;
      const res = await fetch(oembedUrl, { headers: { accept: "application/json" } });
      if (!res.ok) return null;
      return (await res.json()) as OEmbedPayload;
    });

  const payload = await fetchImpl(input.replyUrl.trim());
  if (!payload) return { ok: false, reason: "fetch_failed" };

  const author = (payload.author_url ?? "").replace(/\/$/, "").split("/").pop()?.toLowerCase() ?? "";
  if (author && author !== linked) return { ok: false, reason: "author_mismatch" };

  const haystack = `${payload.html ?? ""} ${payload.author_url ?? ""}`.toLowerCase();
  if (!haystack.includes(input.personalCode.trim().toLowerCase())) {
    return { ok: false, reason: "code_missing" };
  }
  return { ok: true };
}
