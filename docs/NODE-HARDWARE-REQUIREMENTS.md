# PEOPLE node hardware requirements (measured on testnet)

These numbers come from measurements on the live PEOPLE testnet (`people_97401-1`), not from the generic Cosmos SDK or Evmos guidance.

## How we measured

- **Date:** 2026-10-20, 19:08–19:20 (UTC+4). Two snapshots 728 s apart, so the window was about 12 minutes.
- **Nodes:** two validator processes (`peopled`, cosmos/evm v0.4.0, CometBFT) run on one shared host: 8 vCPU AMD EPYC-Rome, 16 GiB RAM, NVMe/virtio disk.
  - **node0** is a validator that also serves the public CometBFT RPC, REST and EVM JSON-RPC (`eth,net,web3`). In practice it is a validator plus an RPC full node.
  - **node1** is a validator only. It also exposes JSON-RPC, but almost nothing calls it.
- **Node config:** `pruning = "default"`, `min-retain-blocks = 0` (all blocks are kept), `indexer = "kv"`, state-sync snapshots off.
- **Chain at measurement time:** height 739,599 → 740,152 (+546 blocks in 727 s of chain time). That is **1.33 s per block, about 64,800 blocks per day**. Genesis was 2026-10-09 04:22 UTC, about 11.5 days of history.
- **Tools, all read-only:** `ps`, `/proc/<pid>/stat` (CPU ticks), `/proc/<pid>/io`, `du -sb` on the data dir, `free`, `df`, `ss -ti` per-socket byte counters for the `peopled` processes, `/proc/net/dev`, and CometBFT `/status`.
- **Activity:** testnet traffic is light. Expect mainnet load with real users to be higher. See the safety margins below.

## Measured results

| Metric | node0 (validator + public RPC) | node1 (validator only) |
|---|---|---|
| CPU, 12-min average | **0.65 core** (65 % of one vCPU) | **0.24 core** |
| CPU, lifetime average (10 days uptime) | 0.33 core | 0.16 core |
| RAM (RSS) | **1.9 GiB** | **1.9 GiB** |
| Data dir size (height ~740k) | **4.49 GB** | **4.49 GB** |
| ├ application.db (state) | 1.5 GB | 1.5 GB |
| ├ blockstore.db | 0.89 GB | 0.89 GB |
| ├ cs.wal (consensus WAL) | 1.0 GB | 1.0 GB |
| ├ tx_index.db | 0.51 GB | 0.51 GB |
| └ state.db | 0.39 GB | 0.39 GB |
| Disk growth, 12-min window, extrapolated | 0.41 GB/day | 0.59 GB/day |
| Disk growth, average since genesis | **≈0.39 GB/day** (~6.1 KB/block) | same |
| Disk write throughput (incl. compaction and WAL) | 0.32 MB/s (~27 GB/day written) | 0.33 MB/s |
| P2P traffic (sum over peopled sockets) | 2.6 KB/s out + 2.5 KB/s in ≈ **0.44 GB/day** | same |

The disk growth over a 12-minute window is noisy because LevelDB compaction makes it jump around. Use the average since genesis (about 0.39 GB/day, roughly 140 GB/year at current activity) for planning.

The P2P traffic figure covers only the one validator↔validator link on this testnet. Each extra peer adds roughly the same per-link amount (about 0.2 GB/day each way at current load). RPC traffic depends on how many clients use the node and comes on top of that.

## Recommendations

We size with about 4× headroom on CPU and RAM and at least one year of disk growth, because testnet load is lower than expected mainnet load.

### Validator

| | Minimum | Recommended |
|---|---|---|
| CPU | 2 vCPU | 4 vCPU (dedicated/high-frequency) |
| RAM | 4 GB | 8 GB |
| Disk | 100 GB NVMe SSD | 200–250 GB NVMe SSD (≈140 GB/yr at current load) |
| Network | 10 Mbit/s, ~1 GB/day | 100 Mbit/s, unmetered or ≥100 GB/month, stable low latency |

Do not expose RPC on a validator. Keep its signing path isolated, as node1 is.

### Full node (RPC / sentry)

| | Minimum | Recommended |
|---|---|---|
| CPU | 2 vCPU | 4–8 vCPU (RPC load drives CPU: 0.65 vs 0.24 core measured) |
| RAM | 4 GB | 8–16 GB |
| Disk | 100 GB NVMe SSD | 250 GB+ NVMe (archive: plan ≥150 GB/yr, more with tx growth) |
| Network | 10 Mbit/s | 100 Mbit/s+. Add egress for RPC clients on top of ~0.2 GB/day per peer |

### Light / pruned node: estimate, not measured

PEOPLE has no separate light-client binary or mode. The closest option is a full node with aggressive pruning, for example `pruning = "everything"` or `"custom"`, plus `min-retain-blocks` set to a few thousand and `indexer = "null"`. **No pruned PEOPLE node was running, so these numbers are estimates.** They come from the measured validator data like this:

- **Disk:** the measured layout is application state 1.5 GB plus state.db 0.39 GB plus WAL ~1 GB. With block and tx history pruned (blockstore 0.89 GB and tx_index 0.51 GB mostly removed) and old state versions pruned, expect about **2–3 GB today**. Growth should stay well under 0.1 GB/day, driven only by live state size.
- **CPU and RAM:** about the same as the validator-only node, **~0.25 core and ~2 GB RSS**. Block execution cost is the same whether or not you prune.
- **Network:** about the same P2P per peer (~0.2 GB/day each way per peer at current load).
- **Suggested spec:** 2 vCPU, 4 GB RAM, 50 GB SSD, 10 Mbit/s.

Re-measure once a pruned node exists.

## Re-measuring

On a node host, run these read-only commands twice, 10–15 minutes apart:

```bash
du -sb $HOME_DIR/data                      # disk
ps -o pid,pcpu,rss,etimes -p $(pidof peopled)
awk '{print $14+$15}' /proc/$(pidof peopled)/stat   # CPU ticks (CLK_TCK=100)
cat /proc/$(pidof peopled)/io               # write_bytes
ss -tinp | grep -A1 peopled                 # bytes_acked / bytes_received
curl -s localhost:26657/status              # latest_block_height
```

Divide the deltas by elapsed seconds.
