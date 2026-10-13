#!/usr/bin/env bash
# Write contracts/deployments/97401.json from Foundry broadcast + optional asset map.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RUN="$ROOT/broadcast/Deploy.s.sol/97401/run-latest.json"
OUT="$ROOT/deployments/97401.json"
RPC="${RPC_URL:-https://node.peopleblockchain.network/rpc}"

if [[ ! -f "$RUN" ]]; then
  echo "missing $RUN — run forge script with --broadcast first"
  exit 1
fi

load_addr() {
  jq -r --arg n "$1" '.transactions[] | select(.contractName==$n) | .contractAddress' "$RUN" | tail -1
}

REGISTRY="$(load_addr PeopleProtocolRegistry)"
FACTORY="$(load_addr TokenFactory)"
CURVE="$(load_addr BondingCurveMarket)"
ROUTER="$(load_addr PeopleRouter)"
WPPL="$(load_addr WPPL)"
AMM="$(load_addr PeopleAmmFactory)"
NFT="$(load_addr NftFactory)"
AGENT="$(load_addr CommunityAgentWallet)"
GOV="$(load_addr GovernanceToken)"
TIME="$(load_addr PeopleTimelock)"
GOVR="$(load_addr PeopleGovernor)"
VESTING="$(load_addr CreatorVesting)"
VAULT="$(load_addr CommunityTokenVault)"
MULTISIG="$(load_addr PeopleMultisig)"
DEPLOYER="$(cast wallet address --private-key "${DEPLOYER_PRIVATE_KEY:?set DEPLOYER_PRIVATE_KEY}")"

ASSET_MAP='{}'
POOLS='[]'
if [[ -f "$ROOT/deployments/97401-export-overlay.json" ]]; then
  ASSET_MAP="$(jq -c '.assetMap // {}' "$ROOT/deployments/97401-export-overlay.json")"
  POOLS="$(jq -c '.pools // []' "$ROOT/deployments/97401-export-overlay.json")"
fi

jq -n \
  --argjson chainId 97401 \
  --arg cosmos "people_97401-1" \
  --arg rpc "$RPC" \
  --arg deployedAt "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
  --arg deployer "$DEPLOYER" \
  --arg registry "$REGISTRY" \
  --arg tokenFactory "$FACTORY" \
  --arg bondingCurve "$CURVE" \
  --arg router "$ROUTER" \
  --arg wppl "$WPPL" \
  --arg ammFactory "$AMM" \
  --arg nftFactory "$NFT" \
  --arg agentWallet "$AGENT" \
  --arg governanceToken "$GOV" \
  --arg timelock "$TIME" \
  --arg governor "$GOVR" \
  --arg creatorVesting "$VESTING" \
  --arg communityVault "$VAULT" \
  --arg peopleMultisig "$MULTISIG" \
  --argjson assetMap "$ASSET_MAP" \
  --argjson pools "$POOLS" \
  '{
    chainId: $chainId,
    cosmosChainId: $cosmos,
    rpcUrl: $rpc,
    deployedAt: $deployedAt,
    deployer: $deployer,
    contracts: {
      registry: $registry,
      tokenFactory: $tokenFactory,
      bondingCurve: $bondingCurve,
      router: $router,
      wppl: $wppl,
      ammFactory: $ammFactory,
      nftFactory: $nftFactory,
      creatorVesting: $creatorVesting,
      communityVault: $communityVault,
      peopleMultisig: $peopleMultisig,
      agentWallet: $agentWallet,
      governanceToken: $governanceToken,
      timelock: $timelock,
      governor: $governor
    },
    assetMap: $assetMap,
    pools: $pools
  }' > "$OUT"

echo "wrote $OUT"
