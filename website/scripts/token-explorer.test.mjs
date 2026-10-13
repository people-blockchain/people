import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenHolders, holderChart, creationTimestamp, formatShare } from '../src/lib/token-explorer.ts';
test('positive holders sorted by token rather than native balance', () => {
 const result = tokenHolders([{address:'a',balance:1000,balances:{token:2}},{address:'b',balance:1,balances:{token:8}},{address:'c',balances:{other:40}},{address:'d',balances:{token:-2}},{address:'e',balances:{token:Infinity}}], 'TOKEN');
 assert.equal(result.total,10); assert.deepEqual(result.holders.map(x=>[x.address,x.share]),[['b',80],['a',20]]);
});
test('PPL stays in native units and explicit zero overrides legacy balance',()=>{
 const result=tokenHolders([{address:'a',balance:1.25},{address:'b',balance:50,balances:{ppl:0}}],'ppl');
 assert.equal(result.total,1.25);assert.equal(result.holders.length,1);
});
test('remaining wallets grouped without losing share',()=>{
 const {holders}=tokenHolders(Array.from({length:8},(_,i)=>({address:String(i),balances:{token:1}})),'token');
 const slices=holderChart(holders);assert.equal(slices.length,6);assert.equal(slices.at(-1).label,'other');assert.equal(slices.reduce((s,r)=>s+r.share,0),100);assert.deepEqual(holderChart([]),[]);
});
test('block height is never treated as a creation timestamp',()=>{
 assert.equal(creationTimestamp(null,23127),null);assert.equal(creationTimestamp({header:{height:23128,timestamp:1790923346339}},23127),null);assert.equal(creationTimestamp({header:{height:23127,timestamp:1790923346339}},23127),1790923346339);
});

test('tiny positive ownership is not rounded to zero', () => {
 assert.equal(formatShare(0.00001), '<0.01%'); assert.equal(formatShare(0), '0.00%'); assert.equal(formatShare(80), '80.00%');
});
