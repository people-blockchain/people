export async function checkDurableRateLimit() {
  throw new Error("simulated db outage");
}

export async function resetDurableRateLimitForTests() {}
