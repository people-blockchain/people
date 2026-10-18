# Public testnet node onboarding

Status: implementation and local testing; the public v2 archive seed is already
running at `https://node.peopleblockchain.network` with
`CHAIN_ID=people-public-testnet-v2-2026-09-30`. Public Docker image digest for
anonymous pull may still be pending. This is not Mainnet.
Owner approval (2026-09-30): public Docker distribution while keeping repository private; archive seed; public-only faucet identity; separate v2 testnet, preserving the old chain.

## User path

After release, `/docs#node` displays a single Docker command. Docker must already be running. The image is pinned by SHA-256 digest. The command mounts `people-node-data`, binds the HTTP API to localhost, and provides `NODE_NETWORK_URL` (the HTTPS URL of `/network`). Gossip uses an outbound seed connection; no incoming firewall rule is required for an ordinary follower. Initial image supports Linux amd64; other platforms must not be advertised as verified yet.

No wallet, stake, account or private key is needed to verify the network. Validator registration is a separate operation under the existing rules.

The launcher accepts only schema 1 / protocol 2 testnet manifests with an archive seed. It allows only known fields, bounds download size/time, rejects redirects, pins the manifest in the data volume, and checks the derived genesis hash before joining. The first HTTPS endpoint is a trust anchor: use the project's published URL. Restart reuses the pinned settings even if the manifest server is offline. Changing networks requires a separate volume; never delete existing data automatically.

## Public settings and secrets

`GENESIS_FAUCET_ADDRESS` replaces the need to distribute `DEV_FAUCET_PRIVATE_KEY`. With the same address, initial balances and genesis hash are unchanged. A faucet process may retain its private key; if both public address and key are present, mismatch is fatal. A public-only follower cannot dispense funds or sign faucet-funded slash reports. It still verifies received evidence by the existing rules.

`BOOTSTRAP_ADDRESS` is public. `BOOTSTRAP_PRIVATE_KEY` remains on the designated seed only. Public join mode refuses signing keys and disables faucet/dev endpoints. No consensus selection, fees or reward percentages change here.

## Archive seed

Set `ARCHIVE_MODE=1` from the first block of the new network. Each accepted block is stored before it can leave the RAM window. Disk pruning is rejected by the store in this mode; RAM/snapshot trimming remains bounded. Gossip requests read older blocks from disk, capped at 100 blocks and the local head. Followers still replay signatures and state transitions from genesis.

On restart, an archive checks continuity from genesis to its persisted head. A previously pruned database cannot be relabeled as complete. Enabling this setting does not restore missing history, migrate v1 state, or reset any database. Disk growth remains unmeasured; collect actual measurements before forecasting capacity. Archive storage is not an off-host backup.

## Release gate

1. Review and approve the exact commit (or merge PR) before building on the server. Existing v1 data and service configuration stay recoverable.
2. Build/test with `npm ci`, `npm run build`, `npm run typecheck`, `npm test`, `npm run test:public-node` in `people-node`.
3. Run the manual `node-image.yml` workflow at that approved revision. The workflow does not change repository visibility. GHCR package visibility must be set to public separately, then verify `docker pull` without credentials. Record the immutable digest. Do not claim publication from a successful authenticated push alone.
4. Start the separate archive seed with its own CHAIN_ID, DATA_DIR and newly generated secret keys. Keep `.env` files out of git and image layers. Configure reachable gossip and HTTPS `/network`. Do not reuse v1 data with v2.
5. From another host, run the published image without secrets and verify catch-up, matching hash/state root at the same height, restart and closed faucet/dev endpoints.
6. Set website `PUBLIC_NODE_IMAGE=ghcr.io/<owner>/people-node@sha256:<verified digest>` and `PUBLIC_NODE_NETWORK_URL=https://<published endpoint>/network`. Until then, the website explicitly says release is pending. No invented production endpoint or mutable `latest` tag.

For a private local test only, launcher `NODE_ALLOW_HTTP=1` permits HTTP. Public instructions must use HTTPS.

## Validation

`npm run test:public-node` covers configuration injection rejection, malformed/version-mismatched manifests, pinned configuration and offline restart, plus a live seed/follower test with an 8-block memory window. The follower receives more than 20 blocks from genesis using public configuration, matches the state root, refuses faucet use and restarts while the manifest server is offline. Core archive tests replay signed history beyond the memory window and reject missing history.

Docker image build, anonymous pull and remote public-network checks must be reported separately from these local source checks.

## VPS operator note)

The node monorepo directory in this repository is **`people-node/`**. After `git pull` on the server, use `cd people-node` for `npm ci`, `npm run build`, Docker builds (`Dockerfile.node`), and manual `.env.node` startup.

**Unchanged on upgrade:** keep the same `DATA_DIR` volume/path and `CHAIN_ID=people-public-testnet-v2-2026-09-30`.
