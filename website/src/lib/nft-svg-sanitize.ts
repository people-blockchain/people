/**
 * Static SVG sanitizer for NFT artwork.
 *
 * Kept in sync with PeopleScan `server/nft-svg.ts` (same tag/attribute allowlists, limits and
 * rebuild strategy) so the explorer renders exactly what this site pins. Parity is checked by
 * `scripts/nft-svg-sanitize.test.mjs`.
 *
 * The document is parsed and re-serialized from an allowlist; the original markup is never
 * returned and must never be injected into HTML. Show the result only through `<img src>`.
 */
import { SaxesParser } from "saxes";
const NS = "http://www.w3.org/2000/svg";
const XLINK = "http://www.w3.org/1999/xlink";
const tags = new Set(
  "svg g defs path rect circle ellipse line polyline polygon text tspan title desc linearGradient radialGradient stop clipPath mask pattern use symbol".split(
    " ",
  ),
);
const attrs = new Set(
  "id x y x1 y1 x2 y2 cx cy r rx ry width height d points viewBox preserveAspectRatio fill fill-opacity fill-rule stroke stroke-width stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset stroke-opacity opacity transform gradientTransform gradientUnits spreadMethod offset stop-color stop-opacity clip-path clip-rule clipPathUnits mask maskUnits maskContentUnits patternUnits patternContentUnits patternTransform font-family font-size font-weight font-style text-anchor dominant-baseline dx dy rotate textLength lengthAdjust color vector-effect".split(
    " ",
  ),
);
const local = /^#[A-Za-z_][A-Za-z0-9_.-]{0,79}$/;
const escape = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
function value(name: string, s: string): string | null {
  if (s.length > 65536 || s.includes("\\")) return null;
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31))
      return null;
  }
  if (name === "id")
    return /^[A-Za-z_][A-Za-z0-9_.-]{0,79}$/.test(s) ? s : null;
  if (name === "href") return local.test(s) ? s : null;
  if (/url\s*\(/i.test(s))
    return /^url\(\s*['"]?#[A-Za-z_][A-Za-z0-9_.-]{0,79}['"]?\s*\)$/.test(s)
      ? s
      : null;
  if (/(?:https?:|data:|file:|javascript:|@import|expression\s*\()/i.test(s))
    return null;
  return s;
}
function declarations(style: string) {
  const values = new Map<string, string>();
  for (const declaration of style.split(";")) {
    const colon = declaration.indexOf(":");
    if (colon < 0) continue;
    const name = declaration.slice(0, colon).trim(),
      raw = declaration.slice(colon + 1).trim();
    if (!attrs.has(name)) continue;
    const safe = value(name, raw);
    if (safe !== null) values.set(name, safe);
  }
  return values;
}
function staticStyles(input: string) {
  const parser = new SaxesParser({ xmlns: true });
  const stack: { allowed: boolean; style: boolean; content: string }[] = [];
  const rules: {
    selector: string;
    values: Map<string, string>;
    weight: number;
  }[] = [];
  let count = 0;
  parser.on("doctype", () => {
    throw Error("svg_doctype");
  });
  parser.on("processinginstruction", () => {
    throw Error("svg_instruction");
  });
  parser.on("opentag", (tag) => {
    if (++count > 2048 || stack.length >= 48) throw Error("svg_complexity");
    const allowed =
      (stack.length === 0 || stack.at(-1)!.allowed) &&
      (tag.uri === NS || tag.uri === "") &&
      (tags.has(tag.local) || tag.local === "style");
    stack.push({
      allowed,
      style: allowed && tag.local === "style",
      content: "",
    });
  });
  const text = (s: string) => {
    const top = stack.at(-1);
    if (top?.style) top.content += s;
  };
  parser.on("text", text);
  parser.on("cdata", text);
  parser.on("closetag", () => {
    const tag = stack.pop();
    if (!tag?.style) return;
    if (tag.content.length > 16384) throw Error("svg_css_complexity");
    let css = "",
      at = 0;
    for (;;) {
      const start = tag.content.indexOf("/*", at);
      if (start < 0) {
        css += tag.content.slice(at);
        break;
      }
      css += tag.content.slice(at, start);
      const end = tag.content.indexOf("*/", start + 2);
      if (end < 0) return;
      at = end + 2;
    }
    if (/[@\\]/.test(css)) return;
    let position = 0;
    for (;;) {
      const open = css.indexOf("{", position);
      if (open < 0) break;
      const close = css.indexOf("}", open + 1);
      if (close < 0) break;
      const nested = css.indexOf("{", open + 1);
      if (nested >= 0 && nested < close) return;
      const match = ["", css.slice(position, open), css.slice(open + 1, close)];
      position = close + 1;
      const values = declarations(match[2]);
      for (const selector of match[1].split(",").map((v) => v.trim())) {
        if (!/^[.#]?[A-Za-z_][A-Za-z0-9_-]{0,79}$/.test(selector)) continue;
        if (rules.length >= 128) throw Error("svg_css_complexity");
        rules.push({
          selector,
          values,
          weight: selector[0] === "#" ? 2 : selector[0] === "." ? 1 : 0,
        });
      }
    }
  });
  parser.write(input).close();
  return rules.sort((a, b) => a.weight - b.weight);
}
export const NFT_SVG_MAX_BYTES = 262_144;

// Serialize a small static SVG vocabulary. Never inject the original document into HTML.
function rebuildSvg(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length > NFT_SVG_MAX_BYTES) return null;
  try {
    const input = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const rules = staticStyles(input);
    const parser = new SaxesParser({ xmlns: true });
    const out: string[] = [];
    let outputBytes = 0;
    const append = (s: string) => {
      outputBytes += new TextEncoder().encode(s).length;
      if (outputBytes > 524288) throw Error("svg_output_limit");
      out.push(s);
    };
    const stack: {
      name: string;
      kept: boolean;
      id?: string;
      reference?: boolean;
    }[] = [];
    const safeIds = new Set<string>();
    let count = 0,
      root = false;
    parser.on("doctype", () => {
      throw Error("svg_doctype");
    });
    parser.on("processinginstruction", () => {
      throw Error("svg_instruction");
    });
    parser.on("opentag", (tag) => {
      if (
        ++count > 2048 ||
        stack.length >= 48 ||
        Object.keys(tag.attributes).length > 64
      )
        throw Error("svg_complexity");
      const top = stack.length === 0;
      if (top && (tag.local !== "svg" || (tag.uri !== NS && tag.uri !== "")))
        throw Error("not_svg");
      const kept =
        (top || stack.at(-1)?.kept === true) &&
        tags.has(tag.local) &&
        (tag.uri === NS || tag.uri === "");
      stack.push({ name: tag.local, kept });
      if (!kept) return;
      const values = new Map<string, string>();
      for (const attr of Object.values(tag.attributes)) {
        if (attr.local === "style" && attr.uri === "") {
          // Applied after the static tag/class/id rules below.
        } else {
          const name = attr.local;
          if (
            (attr.uri !== "" && !(attr.uri === XLINK && name === "href")) ||
            (!attrs.has(name) && name !== "href")
          )
            continue;
          const safe = value(name, attr.value);
          if (safe !== null) values.set(name, safe);
        }
      }
      const classes = (
        Object.values(tag.attributes).find(
          (a) => a.local === "class" && a.uri === "",
        )?.value ?? ""
      )
        .split(/\s+/)
        .slice(0, 8);
      for (const rule of rules) {
        const match =
          rule.selector[0] === "."
            ? classes.includes(rule.selector.slice(1))
            : rule.selector[0] === "#"
              ? values.get("id") === rule.selector.slice(1)
              : tag.local === rule.selector;
        if (match) for (const [name, v] of rule.values) values.set(name, v);
      }
      const inline = Object.values(tag.attributes).find(
        (a) => a.local === "style" && a.uri === "",
      )?.value;
      if (inline)
        for (const [name, v] of declarations(inline)) values.set(name, v);
      if (tag.local === "use") {
        stack.at(-1)!.reference = true;
        const href = values.get("href");
        if (!href || !safeIds.has(href.slice(1))) values.delete("href");
      }
      stack.at(-1)!.id = values.get("id");
      if (top) {
        if (root) throw Error("svg_root");
        root = true;
        const box = values
          .get("viewBox")
          ?.trim()
          .split(/[\s,]+/)
          .map(Number);
        if (
          box &&
          (box.length !== 4 ||
            box.some((n) => !Number.isFinite(n) || Math.abs(n) > 1000000) ||
            box[2] <= 0 ||
            box[3] <= 0)
        )
          throw Error("svg_viewbox");
        const w = Number(values.get("width")),
          h = Number(values.get("height"));
        const width = box?.[2] ?? (w > 0 && Number.isFinite(w) ? w : 1024),
          height = box?.[3] ?? (h > 0 && Number.isFinite(h) ? h : 1024);
        if (width > 1000000 || height > 1000000) throw Error("svg_dimensions");
        if (!box) values.set("viewBox", `0 0 ${width} ${height}`);
        const scale = Math.min(1, 2048 / Math.max(width, height));
        values.set("width", String(Math.max(1, Math.round(width * scale))));
        values.set("height", String(Math.max(1, Math.round(height * scale))));
        values.set("xmlns", NS);
      }
      append(
        "<" +
          tag.local +
          [...values].map(([name, v]) => ` ${name}="${escape(v)}"`).join("") +
          ">",
      );
    });
    parser.on("closetag", () => {
      const tag = stack.pop();
      if (tag?.kept) {
        append("</" + tag.name + ">");
        if (tag.id && !tag.reference) safeIds.add(tag.id);
      }
      if (tag?.reference && stack.length) stack.at(-1)!.reference = true;
    });
    const text = (s: string) => {
      if (stack.at(-1)?.kept) append(escape(s));
    };
    parser.on("text", text);
    parser.on("cdata", text);
    parser.write(input).close();
    return root ? new TextEncoder().encode(out.join("")) : null;
  } catch {
    return null;
  }
}

/**
 * Sanitizes an SVG for storage. On top of the PeopleScan rebuild, the output must fit the same
 * 262,144-byte input cap (PeopleScan sanitizes the stored file again) and must be a fixed point,
 * so what the explorer finally renders equals the bytes pinned here.
 */
export function sanitizeSvg(bytes: Uint8Array): Uint8Array | null {
  const first = rebuildSvg(bytes);
  if (!first || first.length > NFT_SVG_MAX_BYTES) return null;
  const second = rebuildSvg(first);
  if (!second || second.length !== first.length) return null;
  for (let i = 0; i < first.length; i++) if (first[i] !== second[i]) return null;
  return first;
}
