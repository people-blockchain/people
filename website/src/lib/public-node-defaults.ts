/** Verified public testnet follower defaults (override via env on the server). */
export const DEFAULT_PUBLIC_NODE_NETWORK_URL =
  "https://node.peopleblockchain.network/network";

/**
 * Immutable GHCR image for the public testnet node launcher.
 * Update only after a verified anonymous `docker pull` of the new digest.
 */
export const DEFAULT_PUBLIC_NODE_IMAGE =
  "ghcr.io/people-blockchain/people-node@sha256:e1bf81ba2ca10f70e02edee08d85921480ccdd4c7811dfc50837c5b0bc2ffe36";

export const PUBLIC_NODE_REPO = "people-blockchain/people";
export const PUBLIC_NODE_CLONE_DIR = "people";
export const PUBLIC_NODE_ZIP_DIR = "people-main";
export const PUBLIC_NODE_MONOREPO_DIR = "people-node";

export const manualNodeBuildCommand = `git clone https://github.com/${PUBLIC_NODE_REPO}.git
cd ${PUBLIC_NODE_CLONE_DIR}/${PUBLIC_NODE_MONOREPO_DIR}
npm ci
npm run build
node --env-file=.env.node apps/node/dist/index.js`;
