// Shared mocks for the NFT media browser specs: a scripted wallet (EIP-1193), the chain RPC the
// page reads, the /api/factory/nft/* endpoints, storage upload host and the IPFS gateway.
// Nothing here reaches a real wallet, node or storage service.
import { readFileSync } from "node:fs";
import {
  decodeFunctionData,
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionResult,
  getAddress,
  parseAbi,
  parseAbiItem,
} from "viem";
import { sanitizeSvg } from "../src/lib/nft-svg-sanitize.ts";

export const ADDRESS = "0x1111111111111111111111111111111111111111";
export const FACTORY = getAddress("0x755fec41decd3147d693ee28b6442ef0dc9dd0df");
export const COLLECTION = getAddress("0x8f659a462c89314faa6a4065fb3d2deb51faef62");
export const DIR_CID = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
export const COVER_CID = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzda";
export const META_CID = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdb";
export const VIDEO_CID = "QmYwAPJzv5CZsnA625s3Xv2gteR83C12YCZqGbv3bdgqm4";
export const GATEWAY = "https://gateway.pinata.cloud/ipfs";
const FEE = 2_925_000_000_000_000_000n;

export const fixture = (name) => readFileSync(new URL(`./fixtures/nft-media/${name}`, import.meta.url));

const abi = parseAbi([
  "function createCollection(string name, string symbol) returns (address collection)",
  "function mint(address collection, string tokenURI) payable returns (uint256 tokenId)",
  "function mintFee() pure returns (uint256)",
  "function isCollection(address) view returns (bool)",
  "function creatorOf(address) view returns (address)",
  "function prepaidCredit(address) view returns (uint256)",
  "function nextTokenId() view returns (uint256)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function stableFeeUsd6(uint8) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
]);
const collectionCreated = parseAbiItem("event CollectionCreated(address indexed collection, address indexed creator, string name, string symbol)");
const nftMinted = parseAbiItem("event NftMinted(address indexed collection, uint256 indexed tokenId, address indexed owner, string tokenURI)");

const hex = (n) => `0x${n.toString(16)}`;
const hashFor = (n) => `0x${n.toString(16).padStart(64, "0")}`;

/** Mutable scenario state shared by every mock of one page. */
export function createWorld() {
  return {
    sent: [],
    rejectNextMint: false,
    holdReceipts: false,
    holdReceiptsGate: null,
    nextTokenId: 0,
    tokenUris: [],
    api: [], // ordered "METHOD path" log of /api/factory/nft calls and wallet sends
    metadataBodies: [],
    imageStatus: 200,
    imageError: "storage_unavailable",
    videoUploadGate: null,
    videoUploadHeld: false,
  };
}

function receiptFor(world, tx) {
  const base = {
    transactionHash: tx.hash,
    transactionIndex: "0x0",
    blockHash: `0x${"b".repeat(64)}`,
    blockNumber: "0x10",
    from: ADDRESS,
    to: FACTORY,
    cumulativeGasUsed: "0x5208",
    gasUsed: "0x5208",
    effectiveGasPrice: "0x1",
    contractAddress: null,
    logsBloom: `0x${"0".repeat(512)}`,
    status: "0x1",
    type: "0x2",
  };
  let log;
  if (tx.fn === "createCollection") {
    log = {
      address: FACTORY,
      topics: encodeEventTopics({ abi: [collectionCreated], eventName: "CollectionCreated", args: { collection: COLLECTION, creator: ADDRESS } }),
      data: encodeAbiParameters([{ type: "string" }, { type: "string" }], tx.args),
    };
  } else {
    log = {
      address: FACTORY,
      topics: encodeEventTopics({ abi: [nftMinted], eventName: "NftMinted", args: { collection: COLLECTION, tokenId: BigInt(tx.tokenId), owner: ADDRESS } }),
      data: encodeAbiParameters([{ type: "string" }], [tx.args[1]]),
    };
  }
  return {
    ...base,
    logs: [{ ...log, blockNumber: "0x10", blockHash: base.blockHash, transactionHash: tx.hash, transactionIndex: "0x0", logIndex: "0x0", removed: false }],
  };
}

async function walletRequest(world, method, params) {
  switch (method) {
    case "eth_accounts":
    case "eth_requestAccounts":
      return [ADDRESS];
    case "eth_chainId":
      return "0x17c79";
    case "eth_sendTransaction": {
      const tx = params[0];
      const decoded = decodeFunctionData({ abi, data: tx.data });
      if (decoded.functionName === "mint" && world.rejectNextMint) {
        world.rejectNextMint = false;
        world.api.push("WALLET rejected mint");
        throw new Error("User rejected the request.");
      }
      const entry = { fn: decoded.functionName, args: decoded.args, hash: hashFor(world.sent.length + 1), value: tx.value };
      if (decoded.functionName === "mint") {
        entry.tokenId = world.nextTokenId;
        world.tokenUris[world.nextTokenId] = decoded.args[1];
        world.nextTokenId += 1;
      }
      world.sent.push(entry);
      world.api.push(`WALLET ${decoded.functionName}`);
      return entry.hash;
    }
    default:
      return null;
  }
}

async function rpcResult(world, method, params) {
  switch (method) {
    case "eth_chainId":
      return "0x17c79";
    case "eth_blockNumber":
      return "0x20";
    case "eth_getBlockByNumber":
      return { number: "0x20", hash: `0x${"b".repeat(64)}`, parentHash: `0x${"a".repeat(64)}`, timestamp: "0x65000000", transactions: [], gasLimit: "0x1c9c380", gasUsed: "0x0", baseFeePerGas: "0x1" };
    case "eth_getTransactionByHash":
      return null;
    case "eth_getTransactionReceipt": {
      const tx = world.sent.find((entry) => entry.hash === params[0]);
      if (!tx) return null;
      if (world.holdReceipts) await world.holdReceiptsGate;
      return receiptFor(world, tx);
    }
    case "eth_call": {
      const decoded = decodeFunctionData({ abi, data: params[0].data });
      let value;
      switch (decoded.functionName) {
        case "mintFee":
          value = FEE;
          break;
        case "isCollection":
          value = true;
          break;
        case "creatorOf":
        case "ownerOf":
          value = ADDRESS;
          break;
        case "nextTokenId":
          value = BigInt(world.nextTokenId);
          break;
        case "tokenURI":
          value = world.tokenUris[Number(decoded.args[0])] ?? "";
          break;
        default:
          value = 0n;
      }
      return encodeFunctionResult({ abi, functionName: decoded.functionName, result: value });
    }
    default:
      return null;
  }
}

/** Installs every mock on the page; returns the world for assertions and scenario control. */
export async function installNftMocks(page, { lang = "en", theme = "light" } = {}) {
  const world = createWorld();
  // Anything not mocked below and not local stays offline.
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "localhost" || url.protocol === "data:" || url.protocol === "blob:") return route.fallback();
    return route.abort();
  });

  await page.exposeFunction("__nftWalletRequest", (method, params) => walletRequest(world, method, params));
  await page.addInitScript(
    ({ l, t }) => {
      localStorage.setItem("people_lang", l);
      localStorage.setItem("people_theme", t);
      document.cookie = `people_lang=${l}; path=/; max-age=31536000; SameSite=Lax`;
      window.ethereum = {
        isMetaMask: true,
        request: ({ method, params }) => window.__nftWalletRequest(method, params ?? []),
        on: () => {},
        removeListener: () => {},
      };
    },
    { l: lang, t: theme },
  );

  await page.route("**/api/evm/rpc", async (route) => {
    const body = route.request().postDataJSON();
    const one = async (req) => ({ jsonrpc: "2.0", id: req.id, result: await rpcResult(world, req.method, req.params ?? []) });
    const out = Array.isArray(body) ? await Promise.all(body.map(one)) : await one(body);
    await route.fulfill({ json: out });
  });

  await page.route("**/api/factory/nft/image", async (route) => {
    world.api.push("POST image");
    if (world.imageStatus !== 200) return route.fulfill({ status: world.imageStatus, json: { error: world.imageError } });
    const request = route.request().postDataBuffer()?.toString("latin1") ?? "";
    const isSvg = /image\/svg\+xml/.test(request);
    if (isSvg) {
      // The same sanitizer the server route runs, applied to the uploaded file.
      const raw = /<svg[\s\S]*<\/svg>/.exec(route.request().postDataBuffer().toString("utf8"))?.[0] ?? "";
      const clean = sanitizeSvg(Buffer.from(raw));
      if (!clean) return route.fulfill({ status: 422, json: { error: "svg_rejected" } });
      return route.fulfill({
        json: { uri: `ipfs://${DIR_CID}/image.svg`, gatewayUrl: `${GATEWAY}/${DIR_CID}/image.svg`, kind: "svg", sanitizedSvgBase64: Buffer.from(clean).toString("base64") },
      });
    }
    const png = /Content-Type: image\/png/i.test(request);
    return route.fulfill({
      json: { uri: `ipfs://${png ? DIR_CID : COVER_CID}/image.png`, gatewayUrl: `${GATEWAY}/${DIR_CID}/image.png`, kind: "png" },
    });
  });
  await page.route("**/api/factory/nft/video/sign", (route) => {
    world.api.push("POST video/sign");
    return route.fulfill({ json: { url: "https://uploads.pinata.cloud/v3/files/mock-token" } });
  });
  await page.route("https://uploads.pinata.cloud/**", async (route) => {
    world.api.push("POST storage-upload");
    if (world.videoUploadGate) {
      world.videoUploadHeld = true;
      await world.videoUploadGate;
    }
    return route.fulfill({ headers: { "access-control-allow-origin": "*" }, json: { data: { id: "file-1234" } } });
  });
  await page.route("**/api/factory/nft/video/verify", (route) => {
    world.api.push("POST video/verify");
    return route.fulfill({ json: { uri: `ipfs://${VIDEO_CID}`, gatewayUrl: `${GATEWAY}/${VIDEO_CID}`, size: 26796, type: "video/mp4" } });
  });
  await page.route("**/api/factory/nft/metadata", (route) => {
    world.api.push("POST metadata");
    const body = route.request().postDataJSON();
    world.metadataBodies.push(body);
    return route.fulfill({ json: { tokenUri: `ipfs://${META_CID}/metadata.json`, gatewayUrl: `${GATEWAY}/${META_CID}/metadata.json`, json: body } });
  });

  // The gateway serves the stored files back for previews.
  await page.route(`${GATEWAY}/**`, (route) => {
    const url = route.request().url();
    if (url.includes(VIDEO_CID)) return route.fulfill({ contentType: "video/mp4", body: fixture("video.mp4"), headers: { "access-control-allow-origin": "*" } });
    if (url.endsWith(".svg")) return route.fulfill({ contentType: "image/svg+xml", body: Buffer.from(sanitizeSvg(fixture("clean.svg"))) });
    return route.fulfill({ contentType: "image/png", body: fixture("image.png") });
  });
  return world;
}

export async function holdReceipts(world) {
  let release;
  world.holdReceipts = true;
  world.holdReceiptsGate = new Promise((resolve) => (release = resolve));
  return () => {
    world.holdReceipts = false;
    release();
  };
}

export function holdVideoUpload(world) {
  let release;
  world.videoUploadGate = new Promise((resolve) => (release = resolve));
  return () => {
    world.videoUploadGate = null;
    release();
  };
}

export const mintSends = (world) => world.sent.filter((entry) => entry.fn === "mint").length;
export { hex };
