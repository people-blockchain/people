# TERMINOLOGY — PEOPLE'S BLOCKCHAIN

**Status:** Source of truth for product, brand and asset naming
**Date:** 2026-09-23
**Scope:** Whole repository (`README.md`, `docs/`, `website/`, protocol code)

> This document defines the official terminology of the project. Every other document,
> the public website and all new code must follow it. When another document conflicts
> with this one, this document wins for *naming only* — it never overrides economic,
> consensus or protocol specifications.

---

## 1. Official terminology

These are the only approved names. Each row is the canonical spelling and casing.

| Concept | Official term | Notes |
| --- | --- | --- |
| Brand | **People** | The public brand. Used alone for the organization and the product family. |
| Blockchain / network | **People's Blockchain** | Full network name. Capital `P`, apostrophe-s. |
| Native token | **People** | The native economic and settlement asset. |
| Ticker / symbol | **PPL** | Uppercase, always three letters. |

### Naming chain

Public surfaces (website, social cards, metadata, README, marketing copy) must keep this
order of specificity consistent:

```text
People  →  People's Blockchain  →  PPL
brand      network                 ticker
```

Example usages:

- "People is the native asset of People's Blockchain. Its ticker is PPL."
- "Stake PPL to operate a validator."
- "Network fees are denominated in PPL."
- "`PROJECT / PPL` is the settlement pair for user-created tokens."

### Slogans

| Language | Official slogan |
| --- | --- |
| English | “Created by people. For the community.” |
| Russian | «Создано людьми. Для сообщества.» |

The English slogan uses typographic double quotation marks; the Russian slogan uses
guillemets. Do not paraphrase, translate the other language's slogan, or invent variants.

---

## 2. Deprecated terminology

The following terms must **not** be used as current product, network or brand names:

| Deprecated term | Status | Replacement |
| --- | --- | --- |
| `NATIVE` | Deprecated as a token name/symbol | **People (PPL)** |
| `VLS` | Deprecated as a public ticker | **PPL** |
| `Vallis` | Deprecated as a public token name | **People** |
| `OVN` | Historical/technical origin only | **People's Blockchain** (product); OVN only as origin |
| `Open Validator Network` | Historical/technical origin only | **People's Blockchain** |
| `OnPeople` | Not an approved product or network name | **People** / **People's Blockchain** |

### The only permitted way to present OVN

OVN may be referenced **only** as the technical/historical origin of the codebase, in this
form (or an equivalent single sentence):

> People's Blockchain was developed from the Open Validator Network (OVN) reference codebase.

OVN must never appear as:

- a current product, network, protocol or brand name;
- a company, foundation or organization name;
- a ticker or asset name;
- the name of the public website.

---

## 3. Classification of legacy occurrences

Every occurrence of a deprecated term in this repository falls into exactly one bucket.
The bucket decides whether it is migrated or preserved.

| # | Bucket | Action |
| --- | --- | --- |
| 1 | Current product / documentation | **Migrate** to People / People's Blockchain / PPL |
| 2 | New protocol code (added for People's Blockchain) | **Migrate** to People / PPL when the occurrence is a product-facing string |
| 3 | Legacy compatibility | **Preserve** — required for serialization, storage, imports, builds or consensus |
| 4 | Historical reference | **Preserve** — records what the code or audit found at a point in time |
| 5 | Uncertain | **Report** — never guess; surface for explicit product decision |

**Hard rule:** never perform a blind global replacement. A string that is persisted,
hashed, serialized, indexed, or used as an import path or package scope is bucket 3 and
must be preserved even if it contains a deprecated word.

---

## 4. Preserved legacy references (bucket 3 — legacy compatibility)

These are **intentional** and must not be "cleaned up" without a migration plan and an
explicit product decision.

### 4.1 On-chain native asset identity (consensus / storage critical)

**Current runtime (owner decision, implemented):** id `ppl`, name `People`, symbol `PPL`.
Defined in `people-node/packages/core/src/native-asset.ts` and genesis
`NATIVE_ASSET`. There is **no** parallel current `vls` registry entry.

**Load-time migration:** snapshots and checkpoints that still key maps as `vls` are remapped
to `ppl` (`migrateLegacyNativeAssetState`) without changing amounts. Apply-time
`canonicalizeAssetId` treats `vls` as an alias so historical txs still settle to native PPL.

**Still preserved (not the asset id):** `@ovn/*` packages, `ovn-*` localStorage, Prometheus
`ovn_*`, Docker `ovn-data*`. Env `VLS_PRICE_USD` remains a **fallback** for
`PPL_PRICE_USD` (demo reference price, not a market rate).

Historical documents in §5 still quote `vls`/`VLS`/`Vallis` as the OVN baseline. That is
archive, not live identity.

### 4.2 Build, storage and operations namespaces

| Location | Preserved value | Why |
| --- | --- | --- |
| `people-node/**` | npm workspace scope `@ovn/*` (7 package names, ~105 imports) | Package names, imports, `file:` workspace deps and Turbo filters. Renaming is mechanical but repo-wide and requires a full rebuild; deferred. Does not affect consensus. |
| `people-node/**` | directory name, `open-validator-network` package name, `chainId` default `"ovn-devnet"` | Legacy foundation; the original OVN source must remain recoverable (`AGENTS.md` §13). `chainId` is network identity (not part of the state root) but `apps/web/src/networkEnv.ts` branches on the literal `id === "ovn"`, so it must change together with that logic. |
| `people-node/**` | browser `localStorage` keys (`ovn-wallets`, `ovn-devices`, `ovn-tx-queue`, `ovn-referrer*`, `ovn-address-book`, `ovn-language`, `ovn-theme`, `ovn-status-*`), Prometheus `ovn_*` metric names, Docker volumes `ovn-data*`, env `VLS_PRICE_USD` | Ops/persistence contracts. `ovn-wallets` and `ovn-devices` hold encrypted user key material: renaming them without a migration shim would orphan existing users' keys. |
| `website/src/app/layout.tsx`, `website/src/lib/preferences.ts` | `localStorage` keys `ovn_theme`, `ovn_lang` | Persisted browser preference keys. Renaming silently resets every visitor's saved theme/language; not user-visible. |

### 4.3 Generic internal identifiers

Identifiers such as `nativeAssetId`, `NATIVE_ASSET_ID`, `VIRTUAL_NATIVE_RESERVE_BASE`
and the English phrase "native asset" are **ordinary domain vocabulary**, not the
deprecated product name `NATIVE`. They may remain. Only *displayed* strings change.

---

## 5. Preserved historical references (bucket 4)

These documents record what a specific commit or audit actually contained. Rewriting them
would falsify the record, so the legacy terms stay:

| Document | Why legacy terms remain |
| --- | --- |
| `docs/BASELINE-AUDIT.md` | Code-level audit of the OVN/VLS baseline as it was. |
| `docs/ECONOMIC-BASELINE-VERIFICATION.md` | Verifies exact `VLS` monetary values at named commits. |
| `docs/PHASE-1-IMPLEMENTATION.md` | Records that the native asset id intentionally stayed `"vls"`. |
| `docs/PHASE-2-IMPLEMENTATION.md` | Records the Phase 2 implementation against the legacy asset id. |
| `docs/ARCHITECTURE-MIGRATION.md` | Migration matrix describing the OVN → People's Blockchain mapping. |
| `docs/DEVELOPMENT.md` | Describes the repository as based on the OVN baseline. |

Each of these carries a terminology note pointing here. Their legacy terms describe
*code and history*, never the current product name.

---

## 6. Migration status

| Surface | State |
| --- | --- |
| Public website (`website/`) | Migrated to People / People's Blockchain / PPL |
| Social cards / metadata / canonical URLs | Migrated (cards regenerated from the same brand script) |
| Current product & economic docs | Migrated |
| Historical audit / implementation records | Preserved, noted |
| OVN reference codebase (`people-node/`) | Live native asset is People/PPL; `@ovn/*` package scope preserved |
| On-chain asset metadata | **Migrated** to People / PPL / id `ppl` (legacy `vls` alias on load/apply) |
| New-protocol product-facing strings in code | Migrated with the on-chain identity |

---

## 7. Open decisions

1. **On-chain asset identity.** **Decided:** genesis and runtime native asset is People / PPL
   (`ppl`). Legacy `vls` is an alias + snapshot migration, not a second live asset. The
   launch-fee error string may still say `NATIVE` (unit of the native asset, now PPL).
2. **Entity name.** The public site previously named "OVN Foundation" as the steward.
   It now uses the brand **People**. If a distinct legal entity name is required, provide
   it explicitly.
3. **Steward description.** The site's architecture section now describes the steward as
   the "Brand and steward of People's Blockchain", with OVN named only as the reference
   codebase. Confirm whether a distinct organisational entity should be named instead.
4. **Legacy OVN web/node application.** `people-node/apps/web` remains the
   OVN-named consumer UI (product chrome still says Open Validator Network). Native token
   copy is now People / PPL. Whether to retire or fully rebrand the app shell is still open.
5. **Official slogan placement.** The official slogans are defined in §1 but are not yet
   rendered in the public site UI (no approved placement). Footer or hero tagline are the
   natural candidates — provide the placement or confirm that the slogans stay
   documentation-only.
6. **Product tagline.** The previous social-card alt text used the unofficial tagline
   "Powered by people. Owned by communities."; it now uses the official English slogan.
   If that tagline was approved brand copy, confirm and it can be restored.

---

## 8. Rules for contributors and AI agents

1. Read this document before renaming anything.
2. Classify each occurrence with §3 and act accordingly.
3. Never modify a persisted, hashed or serialized identifier to satisfy terminology.
4. Never change economic, consensus or token-supply values as part of a rename. Naming and
   economics are separate decisions.
5. When a term's classification is unclear, leave it and report it as `TBD` (bucket 5).
6. Keep code and documentation consistent: if a displayed string changes, update the test
   or document that asserts it in the same change.
