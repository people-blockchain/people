# People's chain node (peopled) — built from pinned cosmos/evm (tag + commit in
# COSMOS_EVM_VERSION / COSMOS_EVM_COMMIT; the build verifies both).
FROM golang:1.23-bookworm AS builder
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /src
COPY COSMOS_EVM_VERSION COSMOS_EVM_VERSION
COPY COSMOS_EVM_COMMIT COSMOS_EVM_COMMIT
COPY overrides/ overrides/
COPY scripts/build-peopled.sh scripts/build-peopled.sh
RUN chmod +x scripts/build-peopled.sh && ./scripts/build-peopled.sh

FROM debian:bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl jq bash && rm -rf /var/lib/apt/lists/*
COPY --from=builder /src/build/peopled /usr/local/bin/peopled
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh
EXPOSE 26656 26657 1317 9090 8545 8546
VOLUME ["/data"]
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["start"]
