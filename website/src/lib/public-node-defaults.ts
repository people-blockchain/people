/** Verified public testnet follower defaults (override via env on the server). */
export const DEFAULT_PUBLIC_NODE_NETWORK_URL =
  "https://node.peopleblockchain.network/network";

/**
 * Immutable GHCR image for the public testnet node launcher.
 * Update only after a verified anonymous `docker pull` of the new digest.
 */
export const DEFAULT_PUBLIC_NODE_IMAGE =
  "ghcr.io/rednaxelavoroge/people-node@sha256:d48cc23312667655e673a3f32c0636b1f84d2adde9464256fee90c8af648ef02";

export const PUBLIC_NODE_REPO = "rednaxelavoroge/Peoples-Blockchain";
export const PUBLIC_NODE_CLONE_DIR = "Peoples-Blockchain";
export const PUBLIC_NODE_ZIP_DIR = "Peoples-Blockchain-main";
export const PUBLIC_NODE_MONOREPO_DIR = "people-node";

export const manualNodeBuildCommand = `git clone https://github.com/${PUBLIC_NODE_REPO}.git
cd ${PUBLIC_NODE_CLONE_DIR}/${PUBLIC_NODE_MONOREPO_DIR}
npm ci
npm run build
node --env-file=.env.node apps/node/dist/index.js`;
