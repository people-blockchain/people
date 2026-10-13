import { test, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ChainStore } from './storage.js';
import { buildBlock, createInitialState, DEFAULT_CONFIG, trimChainWindow, tryApplyRemoteBlock } from './index.js';

test('archive keeps validated history beyond the RAM window, reopens and replays from genesis', async () => {
  const dir = await mkdtemp(join(tmpdir(),'people-archive-'));
  let store = new ChainStore(join(dir,'chain.db'),true);
  const state = createInitialState(DEFAULT_CONFIG);
  try {
    await store.open(); await store.archiveBlock(state.chain[0]!);
    for(let i=0;i<30;i++) {
      const block = await buildBlock(state,'bootstrap-validator',DEFAULT_CONFIG,process.env.BOOTSTRAP_PRIVATE_KEY);
      await store.archiveBlock(block); trimChainWindow(state,5);
    }
    await expect(store.pruneBefore(25)).rejects.toThrow('disabled');
    expect(state.chain.length).toBeLessThan(10);
    await store.close(); store = new ChainStore(join(dir,'chain.db'),true); await store.open();
    await store.assertArchiveComplete(state.chain.at(-1)!);
    const follower = createInitialState(DEFAULT_CONFIG);
    for(let h=1;h<=30;h++) expect(await tryApplyRemoteBlock(follower,(await store.getBlock(h))!,DEFAULT_CONFIG)).toBe(true);
    expect(follower.chain.at(-1)!.hash).toBe(state.chain.at(-1)!.hash);
  } finally { await store.close(); await rm(dir,{recursive:true,force:true}); }
});
test('enabling archive cannot disguise missing historical blocks', async () => {
  const dir = await mkdtemp(join(tmpdir(),'people-archive-gap-'));
  const store = new ChainStore(join(dir,'chain.db'),true);
  try {
    await store.open(); const state=createInitialState(DEFAULT_CONFIG);
    await store.archiveBlock(state.chain[0]!);
    await buildBlock(state,'bootstrap-validator',DEFAULT_CONFIG,process.env.BOOTSTRAP_PRIVATE_KEY);
    const head=await buildBlock(state,'bootstrap-validator',DEFAULT_CONFIG,process.env.BOOTSTRAP_PRIVATE_KEY);
    await store.archiveBlock(head);
    await expect(store.assertArchiveComplete(head)).rejects.toThrow('height 1');
  } finally {await store.close();await rm(dir,{recursive:true,force:true});}
});
