import { PeopleClient, generateKeyPair } from "@people/sdk";

async function main() {
  const baseUrl = process.env.SMOKE_API_URL ?? "http://127.0.0.1:4101";
  const client = new PeopleClient({ baseUrl });
  const health = await client.getHealth();
  if (!health.ok) {
    throw new Error("health_not_ok");
  }
  const details = await client.getHealthDetails();
  if (details.height < 0) {
    throw new Error("invalid_height");
  }
  const metrics = await client.getMetrics();
  if (!metrics.ok || metrics.height < 0 || metrics.finalizedLag < 0) {
    throw new Error("invalid_metrics");
  }

  const key = generateKeyPair();
  await client.fundFromFaucet(key.address, 5);
  const account = await client.getAddress(key.address);
  if (account.balance < 0) {
    throw new Error("invalid_account_balance");
  }
  console.log("sdk smoke ok");
}

void main();
