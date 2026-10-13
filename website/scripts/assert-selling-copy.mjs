#!/usr/bin/env node
/**
 * Copy/economics guards for the selling landing. Presentation only —
 * does not import protocol packages.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");

function extractConstObject(file, name) {
  const text = src(file);
  const start = text.indexOf(`export const ${name}`);
  assert.ok(start >= 0, `missing ${name} in ${file}`);
  const brace = text.indexOf("[", start);
  const end = text.indexOf("] as const", brace);
  assert.ok(end > brace, `could not slice ${name}`);
  const body = text.slice(brace, end + 1);
  const rows = [...body.matchAll(/pct:\s*(\d+)/g)].map((m) => Number(m[1]));
  const ids = [...body.matchAll(/id:\s*"([^"]+)"/g)].map((m) => m[1]);
  return { rows, ids };
}

test("Token Factory public copy is confirmed 10%, not 10%+", () => {
  const economics = src("src/lib/selling-economics.ts");
  assert.match(economics, /TOKEN_COMMUNITY_ALLOCATION_PCT = 10/);
  assert.match(economics, /TOKEN_COMMUNITY_ALLOCATION_PLUS = false/);
  // Headline community share: 10% pool at launch + ~16.7% swept from the curve (owner decision P0-4).
  assert.match(economics, /TOKEN_COMMUNITY_SHARE_PCT = 27/);

  const hub = src("src/lib/hub-content.ts");
  assert.doesNotMatch(hub, /10%\+/);
  assert.doesNotMatch(hub, /10% \+/);
  assert.doesNotMatch(hub, /27%\+/);
  assert.doesNotMatch(hub, /27% \+/);
  assert.match(hub, /27% of every new token goes to the community pool/);
  assert.match(hub, /27% каждого нового токена — в пул сообщества/);
  assert.match(hub, /27% to the community pool/);
  assert.match(hub, /Of every new token's supply goes to the community pool/);
  assert.match(hub, /27% — в пул сообщества/);
  assert.match(hub, /От каждого нового токена идёт в пул сообщества/);
  assert.doesNotMatch(hub, /Token community allocation/i);
  assert.doesNotMatch(hub, /Аллокация сообществу/);
  assert.doesNotMatch(hub, /can flow to the community/i);
  assert.doesNotMatch(hub, /могут идти сообществу/i);
  assert.doesNotMatch(hub, /передаётся сообществу/i);
});

test("Model A fee split is 30/25/20/10/15/0 and sums to 100", () => {
  const { rows, ids } = extractConstObject("src/lib/selling-economics.ts", "MODEL_A_FEE_SPLIT");
  assert.deepEqual(ids, ["validators", "community", "treasury", "liquidity", "growth", "burn"]);
  assert.deepEqual(rows, [30, 25, 20, 10, 15, 0]);
  assert.equal(rows.reduce((a, b) => a + b, 0), 100);
});

test("Growth paid lines mirror runtime L1/L2 at 70/30", () => {
  const economics = src("src/lib/selling-economics.ts");
  assert.match(economics, /GROWTH_L1_WEIGHT = 70/);
  assert.match(economics, /GROWTH_L2_WEIGHT = 30/);
  assert.doesNotMatch(economics, /\bPARTNER_LINES\b/);
  assert.doesNotMatch(economics, /OLD_PARTNER|LEGACY_PARTNER|\bPARTNER_LINE/);
  const { rows, ids } = extractConstObject("src/lib/selling-economics.ts", "GROWTH_PAID_LINES");
  assert.deepEqual(ids, ["L1", "L2"]);
  assert.deepEqual(rows, [70, 30]);
  assert.equal(rows.reduce((a, b) => a + b, 0), 100);
  assert.equal(rows[0], 70);
  assert.equal(rows[1], 30);
});


test("public CURRENT copy forbids L3/L4/L5 and five-level graph depth language", () => {
  // Public visitor surfaces: no L3–L5 labels and no "depth 5" / five-level referral framing.
  const files = [
    "src/lib/hub-content.ts",
    "src/lib/selling-economics.ts",
    "src/lib/content.ts",
    "src/lib/site.ts",
    "src/components/selling/SellingSections.tsx",
    "src/components/HowItWorksBottomCta.tsx",
    "src/components/how-it-works/HowItWorksPublic.tsx",
    "src/lib/locales/surfaces/home-en.json",
    "src/lib/locales/surfaces/hiw-en.json",
    "src/app/page.tsx",
  ];
  for (const rel of files) {
    const text = src(rel);
    assert.doesNotMatch(text, /\bL3\b/);
    assert.doesNotMatch(text, /\bL4\b/);
    assert.doesNotMatch(text, /\bL5\b/);
    assert.doesNotMatch(text, /depth\s*5/i);
    assert.doesNotMatch(text, /graph depth/i);
    assert.doesNotMatch(text, /пятиуров/i);
  }
});

test("public CURRENT copy forbids the retired five-line Partner Program 15/5/3/2/1", () => {
  const files = [
    "src/lib/selling-economics.ts",
    "src/lib/hub-content.ts",
    "src/lib/content.ts",
    "src/lib/site.ts",
    "src/components/selling/SellingSections.tsx",
    "src/components/HowItWorksBottomCta.tsx",
    "src/components/Hero.tsx",
    "src/lib/locales/surfaces/home-en.json",
  ];
  const forbidden = [
    /15\s*\/\s*5\s*\/\s*3\s*\/\s*2\s*\/\s*1/,
    /L1 15%\s*·\s*L2 5%/,
    /\bPARTNER_LINES\b/,
    /five-line partner/i,
    /пятилинейн/i,
    /Approved partner lines:\s*L1 15%/,
  ];
  for (const file of files) {
    const body = src(file);
    for (const pattern of forbidden) {
      assert.doesNotMatch(body, pattern, `${file} matched ${pattern}`);
    }
  }
});

test("selling copy avoids unsupported legal and payout claims", () => {
  const files = [
    "src/lib/hub-content.ts",
    "src/lib/home-public-content.ts",
    "src/components/Hero.tsx",
    "src/components/home/HomeBlocks.tsx",
    "src/lib/site.ts",
  ];
  const forbidden = [
    /legally owns the blockchain/i,
    /every participant legally owns/i,
    /every PPL holder automatically/i,
    /10%\+/,
    /automatically receives 10%/,
  ];
  for (const file of files) {
    const text = src(file);
    for (const pattern of forbidden) {
      assert.doesNotMatch(text, pattern, `${file} matched ${pattern}`);
    }
  }
});

test("EN and RU home copy JSON expose the same keys", () => {
  const en = JSON.parse(src("src/lib/locales/surfaces/home-en.json"));
  const ru = JSON.parse(src("src/lib/locales/surfaces/home-ru.json"));
  assert.equal(en.blocks.length, ru.blocks.length);
  assert.ok(en.hero.headlineMain && ru.hero.headlineMain);
  assert.ok(en.footerCta.cta && ru.footerCta.cta);
});

test("join CTA routes to wallet; the header sign-in opens the modal", () => {
  const hero = src("src/components/Hero.tsx");
  const headerAuth = src("src/components/wallet/HeaderWalletMenu.tsx");
  assert.match(hero, /HomeWalletCta/);
  assert.match(hero, /href="\/create\/token"/);
  // The header's one auth control is the localized nav.signIn button, and it
  // opens the unified modal rather than routing anywhere.
  assert.match(headerAuth, /OpenSignInModalButton/);
  assert.match(headerAuth, /content\[lang\]\.nav/);
  assert.match(headerAuth, /\{t\.signIn\}/);
  // Neither hero nor header may route the auth action to /login.
  assert.doesNotMatch(src("src/components/Navbar.tsx"), /\/login/);
  assert.doesNotMatch(hero, /href="#join"/);
  assert.doesNotMatch(hero, /supabase/i);
});

test("public website copy must not mention Model A", () => {
  const forbidden = [/Model A/i, /MODEL A/];
  for (const file of PUBLIC_COPY_FILES) {
    const text = src(file);
    for (const pattern of forbidden) {
      assert.doesNotMatch(text, pattern, `${file} matched ${pattern}`);
    }
  }
  for (const file of readdirSync(join(root, "src/lib/locales/surfaces")).filter(
    (f) => f.endsWith(".json") && !f.startsWith("roadmap-") && !f.startsWith("tokenomics-"),
  )) {
    const text = readFileSync(join(root, "src/lib/locales/surfaces", file), "utf8");
    for (const pattern of forbidden) {
      assert.doesNotMatch(text, pattern, `${file} matched ${pattern}`);
    }
  }
});

test("owner-approved EN hero copy on homepage", () => {
  const en = JSON.parse(src("src/lib/locales/surfaces/home-en.json"));
  assert.match(en.hero.headlineMain, /Launch a token for your community/);
  assert.match(en.hero.headlineAccent, /27% goes to your people/);
  assert.match(en.hero.testnetBadge, /Public testnet is live/);
});

test("RU home hero is translated, not legacy lockup", () => {
  const ru = JSON.parse(src("src/lib/locales/surfaces/home-ru.json"));
  const hero = src("src/components/Hero.tsx");
  assert.match(ru.hero.headlineMain, /Запустите токен/);
  assert.match(ru.hero.headlineAccent, /27%/);
  assert.match(hero, /headlineMainLines/);
  assert.match(hero, /t\.headlineAccent/);
  assert.doesNotMatch(hero, /PEOPLE&apos;S/);
});

const PUBLIC_COPY_FILES = [
  "src/lib/hub-content.ts",
  "src/lib/content.ts",
  "src/lib/locales/en.ts",
  "src/lib/locales/ru.ts",
  "src/lib/nodes.ts",
  "src/lib/site.ts",
  "src/components/Hero.tsx",
  "src/components/home/HomeBlocks.tsx",
  "src/components/home/HomeFooterCta.tsx",
  "src/components/how-it-works/HowItWorksPublic.tsx",
  "src/lib/home-public-content.ts",
  "src/lib/hiw-public-content.ts",
  "src/lib/locales/surfaces/home-en.json",
  "src/lib/locales/surfaces/hiw-en.json",
  "src/components/Navbar.tsx",
  "src/components/Footer.tsx",
  "src/components/ArchitectureDiagram.tsx",
  "src/components/ProtocolInvariants.tsx",
  "src/components/HowItWorksBottomCta.tsx",
  "src/components/how-it-works/HowItWorksPublic.tsx",
  "src/components/visuals/PowerDiagram.tsx",
  "src/app/page.tsx",
  "src/app/how-it-works/page.tsx",
  "src/app/layout.tsx",
  "src/lib/factory-content.ts",
  "src/components/factory/FactoryHub.tsx",
  "src/components/factory/FactoryWizard.tsx",
];

test("public website copy has no legacy brand or internal diary language", () => {
  const forbidden = [
    /Open Validator Network/,
    /Open Validate Network/,
    /OVN Foundation/,
    /legacy VLS/,
    /не устаревший VLS/,
    /ECONOMIC-MODEL-v0\.1\.md/,
    /implementation decision/i,
    /subject to audit/i,
    /Internal testnet/,
    /Внутренний тестнет/,
    /Production не задеплоен/,
    /Mainnet не запущен/,
    /Production is not deployed/,
    /hardware SLOs/,
    /LevelDB/,
    /BondingCurveEngine/,
    /TOKEN-ECONOMY\.md/,
    /account\.balances\['vls'\]/,
  ];
  for (const file of PUBLIC_COPY_FILES) {
    const text = src(file);
    for (const pattern of forbidden) {
      assert.doesNotMatch(text, pattern, `${file} matched ${pattern}`);
    }
  }
  const layout = src("src/app/layout.tsx");
  assert.match(layout, /ovn_theme/, "code identifier ovn_theme must remain");
});

test("homepage still leads with user-value props in both locales", () => {
  const en = JSON.parse(src("src/lib/locales/surfaces/home-en.json"));
  const ru = JSON.parse(src("src/lib/locales/surfaces/home-ru.json"));
  assert.match(en.blocks[1].body, /27% of every new token/);
  assert.match(ru.blocks[1].body, /27% каждого нового токена/);
  assert.match(en.hero.headlineAccent, /27%/);
  assert.doesNotMatch(JSON.stringify(en), /10%\+/);
  assert.doesNotMatch(JSON.stringify(en), /27%\+/);
  assert.doesNotMatch(JSON.stringify(en), /L1 15%/);
});

test("how-it-works uses 30/25/20/10/15/0 fee split, not legacy 40/5", () => {
  const hiw = JSON.parse(src("src/lib/locales/surfaces/hiw-en.json"));
  const rewards = hiw.blocks.find((b) => b.id === "rewards");
  const pcts = rewards.feeSplit.map((r) => r.pct);
  assert.deepEqual(pcts, [30, 25, 20, 10, 15, 0]);
  const page = src("src/app/how-it-works/page.tsx");
  assert.doesNotMatch(page, /StoryHero|QuickStart|<Story/);
  // #215 replaced the Story/HowItWorksPublic flow with the warm public layout; the
  // fee-split figures above are the canonical part of this check.
  assert.match(page, /HiwWarm/);
});

test("homepage has four content blocks including contract builder CTA", () => {
  const en = JSON.parse(src("src/lib/locales/surfaces/home-en.json"));
  assert.equal(en.blocks.length, 4);
  const contract = en.blocks.find((b) => b.id === "contracts");
  assert.ok(contract?.ctaHref === "/create/contract");
  assert.match(contract?.body ?? "", /OpenZeppelin/i);
  assert.equal(contract?.ctaLabel, "Create a contract");
});

test("nav uses the single localized Sign in label and Testnet v0.1 footer badge", () => {
  const nav = src("src/components/Navbar.tsx");
  const headerAuth = src("src/components/wallet/HeaderWalletMenu.tsx");
  const footer = src("src/components/Footer.tsx");
  const en = src("src/lib/locales/en.ts");
  assert.match(en, /"login": "Sign in"/);
  assert.match(en, /"signIn": "Sign in"/);
  assert.match(en, /Testnet v0\.1/);
  assert.doesNotMatch(footer, /baselineNote/);
  // The footer keeps nav.login; the header renders nav.signIn exactly once and
  // no longer duplicates the action as a nav link.
  assert.match(footer, /nav\.login/);
  assert.doesNotMatch(nav, /nav\.login/);
  assert.match(headerAuth, /t\.signIn/);
});

test("explainer video caption is owner-approved EN copy", () => {
  const en = src("src/lib/locales/en.ts");
  assert.match(en, /"title": "Launch a token in 60 seconds"/);
  assert.match(en, /"eyebrow": "Watch"/);
  // Owner-approved caption must not drift. The section is remounted on the homepage
  // directly under the warm hero (not inside it).
  assert.match(src("src/components/ExplainerVideoSection.tsx"), /content\[lang\]\.explainerVideo/);
  assert.match(src("src/components/ExplainerVideoSection.tsx"), /muted/);
  assert.match(src("src/components/ExplainerVideoSection.tsx"), /playsInline/);
  assert.match(src("src/components/ExplainerVideoSection.tsx"), /preload="none"/);
  const page = src("src/app/page.tsx");
  assert.match(page, /HomeWarmHero[\s\S]*ExplainerVideoSection/);
  assert.match(page, /ExplainerVideoSection/);
  const hero = src("src/components/Hero.tsx");
  assert.doesNotMatch(hero, /ExplainerVideoSection/);
  const warmHero = src("src/components/home/HomeWarmHero.tsx");
  assert.doesNotMatch(warmHero, /ExplainerVideoSection/);
});

test("how-it-works is five public blocks with Take part as a person, not Coming soon", () => {
  const hiwEn = JSON.parse(src("src/lib/locales/surfaces/hiw-en.json"));
  assert.deepEqual(
    hiwEn.blocks.map((b) => b.id),
    ["live", "participation", "ppl-supply", "rewards", "anti-bot", "honest"],
  );
  const participation = hiwEn.blocks.find((b) => b.id === "participation");
  assert.equal(participation.title, "Take part as a person");
  assert.equal(participation.items.length, 3);
  assert.match(participation.items[0].title, /One-tap participation sessions from your phone/i);
  assert.match(participation.items[1].title, /Proof of humanity without biometrics/i);
  assert.match(participation.items[2].title, /Participation points decide your share/i);
  const hiwComponent = src("src/components/how-it-works/HowItWorksPublic.tsx");
  assert.match(hiwComponent, /id === "participation"/);
  assert.doesNotMatch(hiwComponent, /comingSoon|comingSoonBadge|id === "soon"/);
  // The canonical six-block locale files. #215 added the redesigned `hiw-warm-*` files
  // with a different shape (hero/steps/…), so they are not held to the block format.
  for (const file of readdirSync(join(root, "src/lib/locales/surfaces")).filter(
    (f) => f.startsWith("hiw-") && !f.startsWith("hiw-warm-"),
  )) {
    const hiw = JSON.parse(readFileSync(join(root, "src/lib/locales/surfaces", file), "utf8"));
    assert.equal(hiw.blocks.length, 6, `${file} must have 6 blocks`);
    assert.ok(!hiw.blocks.some((b) => b.id === "soon"), `${file} must not include soon block`);
    assert.ok(!("comingSoonBadge" in hiw), `${file} must not include comingSoonBadge`);
    const part = hiw.blocks.find((b) => b.id === "participation");
    assert.ok(part && part.items?.length === 3, `${file} must include participation items`);
  }
  // The live page (#215 warm layout) carries the same intent: proving you are a person
  // is a first-class step, and there is no "coming soon" block.
  const warmEn = JSON.parse(src("src/lib/locales/surfaces/hiw-warm-en.json"));
  assert.ok(
    warmEn.steps.items.some((item) => /Prove you are a human/i.test(item.title)),
    "warm how-it-works must present human participation as a step",
  );
  assert.ok(!("soon" in warmEn), "warm how-it-works must not carry a soon block");
  assert.doesNotMatch(src("src/components/how-it-works/HiwWarm.tsx"), /comingSoon|coming soon/i);
});

test("public surfaces forbid coming soon / soon / planned marketing wording", () => {
  const scanRoots = [
    join(root, "src/lib/locales/surfaces"),
    join(root, "src/components"),
    join(root, "src/app"),
  ];
  const forbidden = [
    /coming\s*soon/i,
    /\bsoon\b/i,
    /\bplanned\b/i,
    /comingSoon/i,
    /PLANEJADO/i,
    /PLANIFIÉ/i,
    /planejad/i,
    /direncanakan/i,
    /pianificat/i,
    /запланир/i,
    /即将/,
    /\bbald ab\b/i,
    /vorgesehen/i,
  ];
  const files = [];
  for (const base of scanRoots) {
    for (const name of readdirSync(base, { withFileTypes: true })) {
      const p = join(base, name.name);
      if (name.isDirectory()) {
        for (const inner of readdirSync(p, { withFileTypes: true })) {
          if (!inner.isDirectory() && /\.(tsx|ts|json)$/.test(inner.name)) files.push(join(p, inner.name));
        }
      } else if (/\.(tsx|ts|json)$/.test(name.name)) files.push(p);
    }
  }
  const skipPaths = [
    "/surfaces/agents-",
    "/surfaces/roadmap-",
    "/surfaces/wallet-ux-",
    "WalletSoonOption.tsx",
    "/app/roadmap/page.tsx",
    "/app/login/LoginForm.tsx",
  ];
  for (const file of files) {
    if (skipPaths.some((s) => file.includes(s))) continue;
    const text = readFileSync(file, "utf8");
    for (const pattern of forbidden) {
      assert.doesNotMatch(text, pattern, `${file} matched ${pattern}`);
    }
  }
});

test("homepage omits hub selling sections", () => {
  const page = src("src/app/page.tsx");
  assert.doesNotMatch(page, /HubHome|CommunityValue|GrowthReferral|ClosingCta/);
  // #215 replaced the hub-style homepage with the warm layout; it must stay that layout.
  assert.match(page, /HomeWarmHero/);
});

test("Create factory routes exist and copy stays honest", () => {
  const tokenPage = src("src/app/create/token/page.tsx");
  const nftPage = src("src/app/create/nft/page.tsx");
  const hubPage = src("src/app/create/page.tsx");
  const factory = src("src/lib/factory-content.ts");
  const nav = src("src/lib/locales/en.ts");
  const diagram = src("src/components/ArchitectureDiagram.tsx");
  assert.match(tokenPage, /CreateTokenPage/);
  assert.match(nftPage, /CreateNftPage/);
  assert.match(hubPage, /FactoryHub/);
  assert.match(nav, /"?href"?: "\/create"/);
  assert.match(nav, /"?href"?: "\/create\/token"/);
  assert.match(nav, /"?href"?: "\/create\/nft"/);
  assert.match(nav, /"?href"?: "\/create\/contract"/);
  assert.match(nav, /"?href"?: "\/fees"/);
  // /wallet left the nav when the header collapsed to a single Sign in; the
  // route must stay reachable from the signed-in wallet menu's «My wallet» item.
  assert.match(
    src("src/components/wallet/HeaderWalletMenu.tsx"),
    /href="\/wallet"/,
  );
  assert.match(nav, /"?href"?: "\/explorer"/);
  assert.match(factory, /statusUnavailable/);
  assert.match(factory, /statusTestnet/);
  assert.doesNotMatch(factory, /STATUS: AVAILABLE/);
  assert.doesNotMatch(factory, /Solana-aligned draft/);
  assert.doesNotMatch(factory, /черновик на уровне Solana/);
  const fees = src("src/lib/factory-fees.ts");
  assert.match(fees, /1\.045005/);
  assert.match(fees, /2\.925/);
  assert.match(fees, /0\.004875/);
  assert.match(fees, /8\.7e-7/);
  assert.doesNotMatch(fees, /\$0\.12/);
  assert.doesNotMatch(diagram, /AVAILABLE/);
  assert.match(diagram, /statusImplemented|IN PROTOCOL/);
});

test("Wallet and explorer pages exist and stay non-custodial in copy", () => {
  const walletPage = src("src/app/wallet/page.tsx");
  const explorerPage = src("src/app/explorer/page.tsx");
  const vault = src("src/lib/wallet-vault.ts");
  const proxy = src("src/app/api/network/[...path]/route.ts");
  const walletCopy = src("src/lib/wallet-copy.ts");
  const hub = src("src/lib/hub-content.ts");
  const hero = src("src/components/Hero.tsx");
  assert.match(walletPage, /WalletApp/);
  assert.match(explorerPage, /ExplorerHome/);
  assert.match(vault, /ppl-web-wallets/);
  assert.match(vault, /AES-GCM/);
  assert.match(proxy, /path_not_allowed/);
  assert.doesNotMatch(proxy, /console\.log/);
  assert.match(walletCopy, /never sent to our servers/);
  assert.match(hub, /href: "\/wallet"/);
  assert.match(hub, /href: "\/explorer"/);
  assert.match(hero, /HomeWalletCta/);
  assert.match(hero, /href="\/create\/token"/);
});
