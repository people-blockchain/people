#!/usr/bin/env bash
# Build the People's chain node binary (peopled) from pinned cosmos/evm.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$(tr -d '[:space:]' < "$ROOT/COSMOS_EVM_VERSION")"
# M11-6: a git tag is mutable upstream, so the build also pins the commit it must resolve to.
COMMIT="$(tr -d '[:space:]' < "$ROOT/COSMOS_EVM_COMMIT")"
[[ "$COMMIT" =~ ^[0-9a-f]{40}$ ]] || { echo "COSMOS_EVM_COMMIT must be a full commit SHA (got '$COMMIT')"; exit 1; }
CACHE="$ROOT/.cache/cosmos-evm"
BUILD_OUT="$ROOT/build/peopled"
OVERRIDES="$ROOT/overrides/evmd"

mkdir -p "$ROOT/build" "$ROOT/.cache"

if [[ ! -d "$CACHE/.git" ]]; then
  git clone --depth 1 --branch "$VERSION" https://github.com/cosmos/evm.git "$CACHE"
fi

cd "$CACHE"
# A failed fetch (offline, or the tag moved and git refuses to clobber it) is not fatal: the
# commit check below decides whether what is in the cache is the tree we pinned.
git fetch --depth 1 origin tag "$VERSION" 2>/dev/null || true
git checkout --detach "$VERSION" 2>/dev/null || git checkout --detach "tags/$VERSION"
# Discard the overrides a previous run copied in, so what is verified below is upstream's tree.
git reset --hard "$VERSION" >/dev/null

ACTUAL="$(git rev-parse HEAD)"
if [[ "$ACTUAL" != "$COMMIT" ]]; then
  echo "cosmos/evm $VERSION resolved to $ACTUAL, expected the pinned $COMMIT — refusing to build"
  echo "(either the upstream tag moved, or .cache/cosmos-evm is stale; remove it and retry)"
  exit 1
fi
if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo "cosmos/evm checkout at $ACTUAL has modified tracked files; refusing to build"
  exit 1
fi

cp "$OVERRIDES/cmd/evmd/config/config.go" "$CACHE/evmd/cmd/evmd/config/config.go"
cp "$OVERRIDES/cmd/evmd/config/evmd_config.go" "$CACHE/evmd/cmd/evmd/config/evmd_config.go"
rm -rf "$CACHE/evmd/peoplefees"
cp -a "$OVERRIDES/peoplefees" "$CACHE/evmd/peoplefees"
rm -rf "$CACHE/evmd/upgrades"
cp -a "$OVERRIDES/upgrades" "$CACHE/evmd/upgrades"
cp "$OVERRIDES/upgrades.go" "$CACHE/evmd/upgrades.go"
python3 "$ROOT/scripts/apply-evm-overrides.py" "$CACHE"

TESTNET_GO="$CACHE/evmd/cmd/evmd/cmd/testnet.go"
sed -i 's/const TEST_DENOM = "atest"/const TEST_DENOM = "appl"/' "$TESTNET_GO"
sed -i 's/sdk.NewCoin(sdk.DefaultBondDenom,/sdk.NewCoin(TEST_DENOM,/g' "$TESTNET_GO"
# M11-5: the 4 well-known upstream mnemonics are funded only when explicitly requested (local
# dev convenience); mainnet/public genesis generation must not carry pre-funded known keys.
python3 - "$TESTNET_GO" <<'PYEOF'
import sys
path = sys.argv[1]
text = open(path).read()
old = "\t\tif i == 0 {\n\t\t\tbals, accs := addExtraAccounts(kb, algo)\n"
new = "\t\tif i == 0 && os.Getenv(\"TESTNET_SEED_WELL_KNOWN_ACCOUNTS\") == \"1\" {\n\t\t\tbals, accs := addExtraAccounts(kb, algo)\n"
if old not in text:
    if new in text:
        sys.exit(0)
    sys.exit("M11-5: addExtraAccounts anchor not found; upstream testnet.go changed")
open(path, "w").write(text.replace(old, new, 1))
PYEOF
# M11-5: default validator commission 10% (rate), 20% (max rate), 1% (max daily change) —
# the upstream example genesis hardcodes 100%/100%/100%, acceptable only for throwaway testnets.
sed -i 's/stakingtypes.NewCommissionRates(math.LegacyOneDec(), math.LegacyOneDec(), math.LegacyOneDec())/stakingtypes.NewCommissionRates(math.LegacyNewDecWithPrec(10, 2), math.LegacyNewDecWithPrec(20, 2), math.LegacyNewDecWithPrec(1, 2))/' "$TESTNET_GO"

# M11-6: `sed` reports success whether or not it matched, so every override is asserted here —
# a build that silently kept upstream's denom or BeginBlocker would ship a different chain.
assert_patched() {
  grep -q "$1" "$2" || { echo "override did not apply: $1 in $2"; exit 1; }
}
assert_patched 'const TEST_DENOM = "appl"' "$TESTNET_GO"
assert_patched 'sdk.NewCoin(TEST_DENOM,' "$TESTNET_GO"
assert_patched 'TESTNET_SEED_WELL_KNOWN_ACCOUNTS' "$TESTNET_GO"
assert_patched 'math.LegacyNewDecWithPrec(10, 2), math.LegacyNewDecWithPrec(20, 2), math.LegacyNewDecWithPrec(1, 2)' "$TESTNET_GO"
assert_patched 'evmd/peoplefees' "$CACHE/evmd/app.go"
assert_patched 'RouteModelAFees' "$CACHE/evmd/app.go"
assert_patched 'StreamValidatorPool' "$CACHE/evmd/app.go"
assert_patched 'evmd/upgrades' "$CACHE/evmd/upgrades.go"
assert_patched 'RegisterUpgradeHandler' "$CACHE/evmd/upgrades.go"

export LEDGER_ENABLED=false
make build

(cd "$CACHE/evmd" && go test ./peoplefees/... ./upgrades/...)

cp "$CACHE/build/evmd" "$BUILD_OUT.new"
chmod +x "$BUILD_OUT.new"
mv -f "$BUILD_OUT.new" "$BUILD_OUT"
echo "Built $BUILD_OUT from cosmos/evm $VERSION"
