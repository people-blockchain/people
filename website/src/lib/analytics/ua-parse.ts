export type ParsedUa = {
  browser: string;
  os: string;
  deviceType: "desktop" | "mobile" | "tablet" | "other";
};

export function parseUserAgent(userAgent: string | null | undefined): ParsedUa {
  const ua = userAgent ?? "";

  let deviceType: ParsedUa["deviceType"] = "desktop";
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/i.test(ua)) deviceType = "tablet";
  else if (/mobi|iphone|ipod|android.*mobile|windows phone/i.test(ua)) deviceType = "mobile";
  else if (!ua) deviceType = "other";

  let os = "Unknown";
  if (/windows nt/i.test(ua)) os = "Windows";
  else if (/mac os x|macintosh/i.test(ua)) os = "macOS";
  else if (/android/i.test(ua)) os = "Android";
  else if (/iphone|ipad|ipod/i.test(ua)) os = "iOS";
  else if (/linux/i.test(ua)) os = "Linux";
  else if (/cros/i.test(ua)) os = "Chrome OS";

  let browser = "Unknown";
  if (/edg\//i.test(ua)) browser = "Edge";
  else if (/opr\//i.test(ua) || /opera/i.test(ua)) browser = "Opera";
  else if (/chrome\//i.test(ua) && !/edg\//i.test(ua)) browser = "Chrome";
  else if (/safari\//i.test(ua) && !/chrome\//i.test(ua)) browser = "Safari";
  else if (/firefox\//i.test(ua)) browser = "Firefox";

  return { browser, os, deviceType };
}
