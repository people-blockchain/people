// Parity and hardening tests for the NFT SVG sanitizer (a port of PeopleScan server/nft-svg.ts).
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { NFT_SVG_MAX_BYTES, sanitizeSvg } from "../src/lib/nft-svg-sanitize.ts";

const fixture = (name) => readFileSync(new URL(`./fixtures/nft-media/${name}`, import.meta.url));
const svg = (s) => sanitizeSvg(Buffer.from(s));
const str = (bytes) => Buffer.from(bytes).toString();
const NS = 'xmlns="http://www.w3.org/2000/svg"';

test("static SVG keeps shapes, gradients, text, safe CSS and local reuse", () => {
  const out = str(sanitizeSvg(fixture("clean.svg")));
  assert.match(out, /linearGradient/);
  assert.match(out, /fill="url\(#paint\)"/);
  assert.match(out, /<text[^>]*fill="white"/);
  assert.match(out, /font-size="24px"/);
  assert.ok(!out.includes("<style"));
  const reused = str(
    svg(
      `<svg ${NS}><defs><path id="p" d="M0 0h10v10Z"/></defs><use href="#p"/><use href="#later"/><g id="later"><use href="#p"/></g><use href="#later"/></svg>`,
    ),
  );
  assert.equal((reused.match(/href="#p"/g) ?? []).length, 2);
  assert.ok(!reused.includes('href="#later"'));
});

test("hostile SVG loses scripts, events, HTML, images and remote references", () => {
  const hostile =
    `<svg ${NS} xmlns:xlink="http://www.w3.org/1999/xlink" onload="alert(1)"><script>alert(1)</script><foreignObject><iframe src="https://evil.invalid"/></foreignObject><image xlink:href="file:///etc/passwd"/><style>@import url(https://evil.invalid);</style><rect width="10" height="10" style="fill:url(https://evil.invalid);stroke:red"/><use href="https://evil.invalid/x.svg#p"/><a href="javascript:alert(1)"><text>click</text></a></svg>`;
  const out = str(svg(hostile));
  assert.ok(!/script|onload|foreignObject|iframe|evil|passwd|javascript|<a[ >]|<image/.test(out), out);
  assert.match(out, /stroke="red"/);
});

test("the malicious fixture is neutralized", () => {
  const out = str(sanitizeSvg(fixture("malicious.svg")));
  assert.ok(!/script|onload|foreignObject|iframe|evil|<image/.test(out), out);
  assert.match(out, /<rect[^>]*fill="blue"/);
});

test("more attack shapes: XHTML namespace, animate/set, CDATA script, xlink and url() leaks", () => {
  const cases = [
    `<svg ${NS}><div xmlns="http://www.w3.org/1999/xhtml"><script>alert(1)</script></div><rect width="1" height="1"/></svg>`,
    `<svg ${NS}><animate attributeName="href" values="javascript:alert(1)"/><set attributeName="onload" to="alert(1)"/><rect width="1" height="1"/></svg>`,
    `<svg ${NS}><script><![CDATA[alert(1)]]></script><rect width="1" height="1"/></svg>`,
    `<svg ${NS} xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="https://evil.invalid/a.svg#x"/><rect width="1" height="1"/></svg>`,
    `<svg ${NS}><rect width="1" height="1" fill="url(https://evil.invalid/x)" stroke="url(data:image/svg+xml;base64,AAAA)"/></svg>`,
    `<svg ${NS}><style>rect{fill:red} @import "https://evil.invalid/a.css";</style><rect width="1" height="1"/></svg>`,
    `<svg ${NS}><style>rect{fill:\\72 ed}</style><rect width="1" height="1"/></svg>`,
    `<svg ${NS}><rect width="1" height="1" onclick="alert(1)" onmouseover="alert(2)"/></svg>`,
  ];
  for (const source of cases) {
    const out = svg(source);
    assert.ok(out, source);
    const text = str(out);
    assert.ok(!/script|alert|evil|xhtml|<div|<animate|<set|onclick|onmouseover|javascript|data:|@import|\\/i.test(text), text);
  }
});

test("DTD, entities, processing instructions, malformed XML and non-SVG roots are rejected", () => {
  for (const source of [
    '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg>&x;</svg>',
    '<!DOCTYPE svg [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;&a;&a;">]><svg>&b;</svg>',
    '<?xml-stylesheet href="https://evil.invalid/x"?><svg/>',
    "<svg><g></svg>",
    '<html xmlns="http://www.w3.org/1999/xhtml"/>',
    "<html><body/></html>",
    "",
    "not xml at all",
  ])
    assert.equal(svg(source), null, source);
  assert.equal(sanitizeSvg(new Uint8Array([0x3c, 0x73, 0x76, 0x67, 0x3e, 0xff, 0xfe, 0x3c, 0x2f, 0x73, 0x76, 0x67, 0x3e])), null);
});

test("complexity and size limits match PeopleScan", () => {
  assert.equal(svg("<svg>" + "<g>".repeat(49) + "</g>".repeat(49) + "</svg>"), null);
  assert.ok(svg("<svg>" + "<g>".repeat(47) + "</g>".repeat(47) + "</svg>"));
  assert.equal(svg("<svg>" + "<path/>".repeat(2049) + "</svg>"), null);
  assert.equal(sanitizeSvg(Buffer.alloc(NFT_SVG_MAX_BYTES + 1)), null);
  assert.equal(NFT_SVG_MAX_BYTES, 262_144);
  assert.equal(svg("<svg><style>" + "x".repeat(16385) + "</style></svg>"), null);
  assert.equal(
    svg("<svg><style>.x{font-family:" + "a".repeat(8000) + "}</style>" + '<text class="x">x</text>'.repeat(100) + "</svg>"),
    null,
  );
  assert.equal(svg('<svg viewBox="0 0 Infinity 2"/>'), null);
  assert.match(str(svg('<svg width="10000" height="5000"/>')), /width="2048" height="1024"/);
});

test("output is a fixed point and fits the input cap", () => {
  for (const source of [str(fixture("clean.svg")), str(fixture("malicious.svg")), `<svg ${NS} width="900" height="300"><g fill="red"><rect width="5" height="5"/></g></svg>`]) {
    const once = sanitizeSvg(Buffer.from(source));
    assert.ok(once && once.length <= NFT_SVG_MAX_BYTES);
    assert.deepEqual(Buffer.from(sanitizeSvg(once)), Buffer.from(once));
  }
});
