import {test, expect} from "vitest";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {Level} from "level";
import {ChainStore,createInitialState,buildBlock,DEFAULT_CONFIG} from "./index.js";

test("corrupt snapshots fail closed and remain on disk", async () => {
  const dir = await mkdtemp(join(tmpdir(),"people-corruption-"));
  const path = join(dir,"db");
  const db = new Level(path); await db.put("snapshot","broken-json"); await db.close();
  const store = new ChainStore(path);
  try { await store.open(); await expect(store.load()).rejects.toThrow("refusing"); }
  finally {await store.close();}
  const inspect = new Level(path); expect(await inspect.get("snapshot")).toBe("broken-json"); await inspect.close();
  await rm(dir,{recursive:true,force:true});
});

test("saving multiple new blocks indexes every height, and restart preserves the head", async () => {
  const dir = await mkdtemp(join(tmpdir(),"people-storage-"));
  const store = new ChainStore(join(dir,"db"));
  try {
    await store.open();
    const state = createInitialState();
    for(let i=0;i<3;i++) await buildBlock(state,"bootstrap-validator",structuredClone(DEFAULT_CONFIG));
    await store.save({chainState:state,feePool:0,latestReward:null});
    for(const block of state.chain) expect((await store.getBlock(block.header.height))?.hash).toBe(block.hash);
    expect((await store.load())?.chainState.chain.at(-1)?.hash).toBe(state.chain.at(-1)?.hash);
  } finally { await store.close(); await rm(dir,{recursive:true,force:true}); }
});
