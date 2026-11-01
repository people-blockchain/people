# Node exposure and RPC security

Validators must not offer public RPC. Run user-facing JSON-RPC / REST on **sentry or full nodes** behind a reverse proxy with rate limits (and ideally Cloudflare or similar edge protection).

## Sentry architecture

| Role | Public ports | Notes |
| --- | --- | --- |
| **Validator** | None (P2P only to known peers) | `pex = false`, `private_peer_ids` / `unconditional_peer_ids` for sentries; no `26657` / `1317` / `8545` on the internet |
| **Sentry** | `26656` P2P | Relays blocks to validators; validators dial sentries, not the open internet |
| **Public RPC node** | `443` (HTTPS) via proxy | Terminates TLS, `limit_req`, forwards to loopback `8545` / `1317` |

## Suggested limits (CometBFT + JSON-RPC)

- `max_num_inbound_peers`: keep validators low (e.g. 10–20); sentries higher for discovery.
- `max_open_connections`: cap HTTP/gRPC (e.g. 900–2000 on RPC nodes).
- EVM JSON-RPC: set `gas-cap`, `evm-timeout`, and batch limits in `app.toml`; disable `personal` and `debug` on any host reachable from outside.
- Never publish Prometheus (`26660`) or CometBFT RPC (`26657`) on `0.0.0.0` on validators.

## Ports to expose publicly

| Port | Expose? |
| --- | --- |
| `26656` | P2P only on sentries / RPC nodes that participate in peering |
| `443` / `80` | Reverse proxy to RPC (HTTPS required) |
| `26657`, `1317`, `9090`, `8545`, `8546`, `26660` | **Loopback or private network only** on validators |

Local Docker testnet: see `chain/docker-compose.yml` (P2P wide, RPC on `127.0.0.1`).

## Reverse proxy example (rate-limited JSON-RPC)

### nginx

```nginx
limit_req_zone $binary_remote_addr zone=eth_rpc:10m rate=10r/s;

server {
  listen 443 ssl;
  server_name rpc.example.com;

  location /rpc {
    limit_req zone=eth_rpc burst=20 nodelay;
    proxy_pass http://127.0.0.1:8545;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
  }
}
```

### Caddy

```caddy
rpc.example.com {
  rate_limit {
    zone eth_rpc {
      key {remote_host}
      events 10
      window 1s
    }
  }
  reverse_proxy 127.0.0.1:8545
}
```

Adjust rates per capacity; add WAF / Cloudflare in front for production.
