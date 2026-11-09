#!/usr/bin/env node
/**
 * CLI for /api/telegram/support-ops — reads TELEGRAM_SUPPORT_OPS_SECRET and
 * PEOPLE_SUPPORT_OPS_URL from env only (never prints the secret).
 *
 * Usage:
 *   node scripts/support-tickets-ops.mjs list
 *   node scripts/support-tickets-ops.mjs reply <uuid> "message text"
 *   node scripts/support-tickets-ops.mjs status <uuid> accept|duplicate|fixed|reject|accepted|...
 */

const DEFAULT_URL = "https://www.peopleblockchain.network/api/telegram/support-ops";

function usage() {
  console.error(`Usage:
  support-tickets-ops.mjs list
  support-tickets-ops.mjs reply <ticket-id> <text>
  support-tickets-ops.mjs status <ticket-id> <status>`);
  process.exit(2);
}

function envSecret() {
  const s = process.env.TELEGRAM_SUPPORT_OPS_SECRET?.trim();
  if (!s) {
    console.error("TELEGRAM_SUPPORT_OPS_SECRET is not set");
    process.exit(1);
  }
  return s;
}

function baseUrl() {
  return (process.env.PEOPLE_SUPPORT_OPS_URL?.trim() || DEFAULT_URL).replace(/\/$/, "");
}

async function api(method, body) {
  const secret = envSecret();
  const res = await fetch(baseUrl(), {
    method,
    headers: {
      authorization: `Bearer ${secret}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    console.error(JSON.stringify(json ?? { status: res.status }, null, 2));
    process.exit(1);
  }
  return json;
}

const [cmd, id, ...rest] = process.argv.slice(2);
if (!cmd || cmd === "-h" || cmd === "--help") usage();

if (cmd === "list") {
  const data = await api("GET");
  console.log(JSON.stringify(data, null, 2));
} else if (cmd === "reply") {
  const text = rest.join(" ").trim();
  if (!id || !text) usage();
  const data = await api("POST", { action: "reply", id, text });
  console.log(JSON.stringify(data, null, 2));
} else if (cmd === "status") {
  const status = rest[0]?.trim();
  if (!id || !status) usage();
  const data = await api("POST", { action: "status", id, status });
  console.log(JSON.stringify(data, null, 2));
} else {
  usage();
}
