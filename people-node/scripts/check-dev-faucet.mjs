import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const key = randomBytes(32).toString("hex");

function run(command, args, env, cwd = root) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

function assertNoSecret(label, text) {
  if (text.includes(key)) {
    throw new Error(`${label} logged the devnet faucet key`);
  }
}

const missingEnv = { ...process.env };
delete missingEnv.DEV_FAUCET_PRIVATE_KEY;
const missing = await run("npx", ["tsx", "scripts/dev-faucet-child.ts", "missing"], missingEnv);
const missingText = missing.stdout + missing.stderr;
assertNoSecret("missing-env", missingText);
if (missing.code === 0 || !missingText.includes("DEV_FAUCET_PRIVATE_KEY is not set")) {
  throw new Error(`missing env did not fail clearly (code ${missing.code})`);
}

const signed = await run("npx", ["tsx", "scripts/dev-faucet-child.ts", "sign"], {
  ...process.env,
  DEV_FAUCET_PRIVATE_KEY: key
});
assertNoSecret("sign", signed.stdout + signed.stderr);
if (signed.code !== 0 || !signed.stdout.includes("accepted")) {
  throw new Error(`devnet faucet tx was not accepted (code ${signed.code})`);
}

const dataDir = await mkdtemp(join(tmpdir(), "ovn-faucet-"));
const port = "4191";
const node = spawn("npx", ["tsx", "apps/node/src/index.ts"], {
  cwd: root,
  env: {
    ...process.env,
    DEV_FAUCET_PRIVATE_KEY: key,
    PORT: port,
    GOSSIP_PORT: "4192",
    DATA_DIR: dataDir,
    PEER_ID: "faucet-check",
    NODE_ENV: "development"
  },
  detached: true,
  stdio: ["ignore", "pipe", "pipe"]
});
let logs = "";
node.stdout.on("data", (chunk) => {
  logs += chunk.toString();
});
node.stderr.on("data", (chunk) => {
  logs += chunk.toString();
});

async function waitForHealth() {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) return;
    } catch {
      // node still starting
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("devnet node did not start");
}

try {
  await waitForHealth();
  const response = await fetch(`http://127.0.0.1:${port}/faucet/fund`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      address: "0x1111111111111111111111111111111111111111",
      amount: 1
    })
  });
  const body = await response.json();
  if (!response.ok || body.ok !== true || !body.txId) {
    throw new Error(`faucet http was not accepted (${response.status})`);
  }
  assertNoSecret("node", logs + JSON.stringify(body));
  console.log("faucet-check-ok");
} finally {
  if (node.pid) {
    try {
      process.kill(-node.pid, "SIGTERM");
    } catch {
      node.kill("SIGTERM");
    }
  }
  await Promise.race([
    new Promise((resolve) => node.on("close", resolve)),
    new Promise((resolve) => setTimeout(resolve, 2000))
  ]);
  if (node.pid) {
    try {
      process.kill(-node.pid, "SIGKILL");
    } catch {
      node.kill("SIGKILL");
    }
  }
  await rm(dataDir, { recursive: true, force: true });
}
