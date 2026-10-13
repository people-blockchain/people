import { test, expect } from '@playwright/test';
const hex = n => `0x${n.toString(16)}`;

test('Cosmos EVM explorer streams blocks over WebSocket, preserves rows offline and resubscribes', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ovn_lang', 'en'));
  let socket;
  let recovering = false;
  const httpLists = [];
  page.on('request', request => {
    if (/\/api\/(?:network|evm\/compat)\/(blocks|transactions)/.test(request.url())) httpLists.push(request.url());
  });
  await page.routeWebSocket(/\/ws$/, ws => {
    socket = ws;
    ws.onMessage(data => {
      const r = JSON.parse(String(data));
      let result;
      if (r.method === 'eth_chainId') result = '0x17c79';
      else if (r.method === 'eth_subscribe') result = 'subscription';
      else if (r.method === 'eth_blockNumber') result = hex(recovering ? 15 : 10);
      else if (r.method === 'eth_getBlockByNumber') {
        const height = Number(BigInt(r.params[0]));
        result = { number: hex(height), hash: `hash-${height}`, timestamp: hex(height), transactions: height === 11 ? [
          { hash: 'confirmed-live-tx', value: '0xde0b6b3a7640000', from: '0x0000000000000000000000000000000000000001' },
        ] : [] };
      } else throw new Error(`Unexpected RPC ${r.method}`);
      ws.send(JSON.stringify({ jsonrpc: '2.0', id: r.id, result }));
    });
  });
  await page.goto('/explorer');
  await expect(page.getByRole('link', { name: '#10', exact: true })).toBeVisible();
  await expect(page.getByTestId('network-status')).toContainText('Testnet');
  await expect(page.getByTestId('people-loader')).toHaveCount(0);
  // Covers the former four-second phase reset, even if no new block arrives.
  await page.waitForTimeout(4500);
  await expect(page.getByTestId('network-status')).toContainText('Testnet');
  socket.send(JSON.stringify({ method: 'eth_subscription', params: {
    subscription: 'subscription', result: { number: '0xb' },
  } }));
  await expect(page.getByRole('link', { name: '#11', exact: true })).toBeVisible();
  await expect(page.locator('a[href="/explorer/tx/confirmed-live-tx"]')).toBeVisible();
  recovering = true;
  await socket.close();
  await expect(page.getByTestId('network-status')).toContainText(/unavailable/i);
  await expect(page.getByRole('link', { name: '#11', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: '#15', exact: true })).toBeVisible();
  await expect(page.getByTestId('network-status')).toContainText('Testnet');
  expect(httpLists).toEqual([]);
});
