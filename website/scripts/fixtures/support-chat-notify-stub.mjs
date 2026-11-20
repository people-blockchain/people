/** Test notifier: records calls; rejects when `globalThis.__supportNotifyFails` is set. */
globalThis.__supportNotifyCalls = [];

export async function notifySupportMessage(opts) {
  globalThis.__supportNotifyCalls.push(opts);
  if (globalThis.__supportNotifyFails) throw new Error("telegram down");
}
