import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRequest, parsePplAmount, createFaucet, clientSource, DEFAULT_TRUSTED_PROXY_PEERS } from './faucet-core.mjs';
const address='0x'+'12'.repeat(20), sender='0x'+'34'.repeat(20), hash='0x'+'ab'.repeat(32);
function setup(overrides={}) {
  const sends=[];
  const provider={getNetwork:async()=>({chainId:97401n}),getBlock:async()=>({hash}),estimateGas:async()=>21000n,getFeeData:async()=>({gasPrice:2n}),getBalance:async()=>100n*10n**18n,...overrides};
  const wallet={address:sender,sendTransaction:async tx=>{sends.push(tx);return {hash};}};
  return {sends, faucet:createFaucet({provider,wallet,firstBlockHash:hash})};
}
test('preserves 18-decimal amounts without floating point',()=>{assert.equal(parseRequest({address,amount:'1.000000000000000001'}).value,1000000000000000001n);});
test('rejects zero, negative, exponential, nonfinite and excessive precision',()=>{for(const amount of ['0','-1','1e5','NaN','Infinity','0.0000000000000000001','1.',' 10','01','1,2'])assert.throws(()=>parseRequest({address,amount}),/invalid_amount/);});
test('rejects malformed and zero addresses',()=>{for(const target of ['abc','0x'+'00'.repeat(20),address+'a'])assert.throws(()=>parseRequest({address:target,amount:'1'}),/invalid_address/);});
test('sends the requested amount and returns a real submitted hash',async()=>{const {faucet,sends}=setup();const result=await faucet.fund({address,amount:'7.25'});assert.equal(sends[0].value,7250000000000000000n);assert.equal(result.amount,'7.25');assert.equal(result.txId,hash);assert.equal(result.pending,true);});
test('reserves gas and rejects insufficient funds without sending',async()=>{const {faucet,sends}=setup();await assert.rejects(faucet.fund({address,amount:'100'}),/insufficient_funds/);assert.equal(sends.length,0);});
test('rejects a different chain ID',async()=>{const {faucet,sends}=setup({getNetwork:async()=>({chainId:1n})});await assert.rejects(faucet.fund({address,amount:'1'}),/wrong_network/);assert.equal(sends.length,0);});
test('rejects another genesis with the same chain ID',async()=>{const {faucet,sends}=setup({getBlock:async()=>({hash:'0x'+'cd'.repeat(32)})});await assert.rejects(faucet.fund({address,amount:'1'}),/wrong_network/);assert.equal(sends.length,0);});
test('serializes concurrent sends and blocks duplicate requests',async()=>{const {faucet,sends}=setup();const results=await Promise.allSettled([faucet.fund({address,amount:'1'}),faucet.fund({address,amount:'1'})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(sends.length,1);assert.match(results.find(r=>r.status==='rejected').reason.message,/rate_limited/);});
test('cannot transfer to itself',async()=>{const {faucet}=setup();await assert.rejects(faucet.fund({address:sender,amount:'1'}),/invalid_address/);});
test('fails closed if fee estimate is unavailable',async()=>{const {faucet,sends}=setup({getFeeData:async()=>({gasPrice:null})});await assert.rejects(faucet.fund({address,amount:'1'}),/fee_unavailable/);assert.equal(sends.length,0);});
test('one source cannot occupy the whole queue',async()=>{
  let release;
  const gate=new Promise(resolve=>{release=resolve;});
  const sends=[];
  const provider={getNetwork:async()=>({chainId:97401n}),getBlock:async()=>({hash}),estimateGas:async()=>{await gate;return 21000n;},getFeeData:async()=>({gasPrice:2n}),getBalance:async()=>100n*10n**18n};
  const wallet={address:sender,sendTransaction:async tx=>{sends.push(tx);return {hash};}};
  const faucet=createFaucet({provider,wallet,firstBlockHash:hash,maxInFlightPerSource:1,maxQueue:4});
  const a1=faucet.fund({address:'0x'+'11'.repeat(20),amount:'1'},'ip-a');
  const a2=faucet.fund({address:'0x'+'22'.repeat(20),amount:'1'},'ip-a');
  const b1=faucet.fund({address:'0x'+'33'.repeat(20),amount:'1'},'ip-b');
  await assert.rejects(a2,/faucet_busy/);
  release();
  await Promise.all([a1,b1]);
  assert.equal(sends.length,2);
});
test('refuses a recipient whose gas estimate exceeds the faucet cap',async()=>{
  const {faucet,sends}=setup({estimateGas:async()=>500000n});
  await assert.rejects(faucet.fund({address,amount:'1'},'ip-a'),/recipient_gas_too_high/);
  assert.equal(sends.length,0);
});
test('rejects a request above the 100 PPL per-request cap',async()=>{
  const {faucet,sends}=setup();
  await assert.rejects(faucet.fund({address,amount:'100.000001'}),/amount_too_large/);
  assert.equal(sends.length,0);
});
test('allows exactly the 100 PPL cap',async()=>{
  const {faucet,sends}=setup({getBalance:async()=>101n*10n**18n});
  const result=await faucet.fund({address,amount:'100'});
  assert.equal(result.amount,'100');
  assert.equal(sends.length,1);
});
const addr=n=>'0x'+BigInt(n).toString(16).padStart(40,'0');
const trusted={trustProxyHeaders:true,trustedPeers:DEFAULT_TRUSTED_PROXY_PEERS};
const fwd=ip=>({'x-people-client-ip':ip});
test('ignores a forwarded client-ip header unless forwarded headers are trusted (fail closed)',()=>{
  assert.equal(clientSource('127.0.0.1',fwd('9.9.9.9'),{trustedPeers:DEFAULT_TRUSTED_PROXY_PEERS}),'127.0.0.1');
  assert.equal(clientSource('127.0.0.1',fwd('9.9.9.9')),'127.0.0.1');
});
test('honours the legacy forwarded header name from a trusted proxy peer',()=>{
  assert.equal(clientSource('127.0.0.1',{'x-ovn-client-ip':'9.9.9.9'},trusted),'9.9.9.9');
});
test('honours the forwarded header only from a trusted proxy peer',()=>{
  assert.equal(clientSource('127.0.0.1',fwd('9.9.9.9'),trusted),'9.9.9.9');
  assert.equal(clientSource('10.0.0.7',fwd('9.9.9.9'),trusted),'10.0.0.7');
  assert.equal(clientSource('127.0.0.1',fwd('9.9.9.9'),{trustProxyHeaders:true,trustedPeers:['10.0.0.7']}),'127.0.0.1');
});
test('falls back to the peer for a malformed or absent forwarded header',()=>{
  assert.equal(clientSource('127.0.0.1',fwd('unknown'),trusted),'127.0.0.1');
  assert.equal(clientSource('127.0.0.1',fwd('a'),trusted),'127.0.0.1');
  assert.equal(clientSource('127.0.0.1',{},trusted),'127.0.0.1');
  assert.equal(clientSource('',{},trusted),'unknown');
});
test('global daily budget defaults to 10000 PPL and refuses the next distinct address',async()=>{
  const {faucet,sends}=setup({getBalance:async()=>1_000_000n*10n**18n});
  for(let i=1;i<=100;i++) await faucet.fund({address:addr(i),amount:'100'},'src'+i);
  await assert.rejects(faucet.fund({address:addr(101),amount:'100'},'src101'),/daily_budget_exhausted/);
  assert.equal(sends.length,100);
});
test('daily budget counts value, not requests, and resets at the next UTC day',async()=>{
  let clock=2*86_400_000;
  const sends=[];
  const provider={getNetwork:async()=>({chainId:97401n}),getBlock:async()=>({hash}),estimateGas:async()=>21000n,getFeeData:async()=>({gasPrice:2n}),getBalance:async()=>1000n*10n**18n};
  const wallet={address:sender,sendTransaction:async tx=>{sends.push(tx);return {hash};}};
  const faucet=createFaucet({provider,wallet,firstBlockHash:hash,now:()=>clock,dailyCapPpl:150n});
  await faucet.fund({address:addr(1),amount:'100'});
  await assert.rejects(faucet.fund({address:addr(2),amount:'100'}),/daily_budget_exhausted/);
  await faucet.fund({address:addr(2),amount:'50'}); // 100 + 50 hits the cap exactly
  assert.equal(sends.length,2);
  clock=3*86_400_000; // next UTC midnight
  await faucet.fund({address:addr(3),amount:'100'});
  assert.equal(sends.length,3);
});
test('dailyCapPpl null disables the global budget',async()=>{
  const sends=[];
  const provider={getNetwork:async()=>({chainId:97401n}),getBlock:async()=>({hash}),estimateGas:async()=>21000n,getFeeData:async()=>({gasPrice:2n}),getBalance:async()=>1000n*10n**18n};
  const wallet={address:sender,sendTransaction:async tx=>{sends.push(tx);return {hash};}};
  const faucet=createFaucet({provider,wallet,firstBlockHash:hash,dailyCapPpl:null,sourceDailyCapPpl:null});
  for(let i=1;i<=5;i++) await faucet.fund({address:addr(i),amount:'100'});
  assert.equal(sends.length,5);
});
test('default rate limit is one request per address per day: blocked just under 24h, allowed just after',async()=>{
  let clock=0;
  const sends=[];
  const provider={getNetwork:async()=>({chainId:97401n}),getBlock:async()=>({hash}),estimateGas:async()=>21000n,getFeeData:async()=>({gasPrice:2n}),getBalance:async()=>100n*10n**18n};
  const wallet={address:sender,sendTransaction:async tx=>{sends.push(tx);return {hash};}};
  const faucet=createFaucet({provider,wallet,firstBlockHash:hash,now:()=>clock});
  await faucet.fund({address,amount:'1'});
  clock = 24*60*60_000 - 1;
  await assert.rejects(faucet.fund({address,amount:'1'}),/rate_limited/);
  clock = 24*60*60_000 + 1;
  await faucet.fund({address,amount:'1'});
  assert.equal(sends.length,2);
});
test('rejects dust amounts (1 wei) without burning the per-address slot',async()=>{
  const {faucet,sends}=setup();
  await assert.rejects(faucet.fund({address,amount:'0.000000000000000001'},'ip-a'),/amount_too_small/);
  await assert.rejects(faucet.fund({address,amount:'0.99'},'ip-a'),/amount_too_small/);
  assert.equal(sends.length,0);
  await faucet.fund({address,amount:'1'},'ip-a'); // the slot is still available
  assert.equal(sends.length,1);
});
test('minAmount is configurable and must be positive',async()=>{
  const sends=[];
  const provider={getNetwork:async()=>({chainId:97401n}),getBlock:async()=>({hash}),estimateGas:async()=>21000n,getFeeData:async()=>({gasPrice:2n}),getBalance:async()=>100n*10n**18n};
  const wallet={address:sender,sendTransaction:async tx=>{sends.push(tx);return {hash};}};
  assert.throws(()=>createFaucet({provider,wallet,firstBlockHash:hash,minAmount:0n}),/invalid_min_amount/);
  const faucet=createFaucet({provider,wallet,firstBlockHash:hash,minAmount:parsePplAmount('0.5')});
  await faucet.fund({address,amount:'0.5'},'ip-a');
  assert.equal(sends.length,1);
});
test('parsePplAmount converts decimals and rejects junk',()=>{
  assert.equal(parsePplAmount('1.5'),1500000000000000000n);
  for(const bad of ['','-1','1e3','abc'])assert.throws(()=>parsePplAmount(bad),/invalid_amount/);
});
test('per-source daily cap spans addresses and resets next UTC day',async()=>{
  let clock=2*86_400_000;
  const sends=[];
  const provider={getNetwork:async()=>({chainId:97401n}),getBlock:async()=>({hash}),estimateGas:async()=>21000n,getFeeData:async()=>({gasPrice:2n}),getBalance:async()=>1000n*10n**18n};
  const wallet={address:sender,sendTransaction:async tx=>{sends.push(tx);return {hash};}};
  const faucet=createFaucet({provider,wallet,firstBlockHash:hash,now:()=>clock,sourceDailyCapPpl:150n});
  await faucet.fund({address:addr(1),amount:'100'},'ip-a');
  await assert.rejects(faucet.fund({address:addr(2),amount:'100'},'ip-a'),/source_daily_limit/);
  await faucet.fund({address:addr(3),amount:'100'},'ip-b'); // other sources unaffected
  await faucet.fund({address:addr(2),amount:'50'},'ip-a');
  assert.equal(sends.length,3);
  clock=3*86_400_000;
  await faucet.fund({address:addr(4),amount:'100'},'ip-a');
  assert.equal(sends.length,4);
});
test('expired claims are evicted before the tracking table reports faucet_busy',async()=>{
  let clock=0;
  const sends=[];
  const provider={getNetwork:async()=>({chainId:97401n}),getBlock:async()=>({hash}),estimateGas:async()=>21000n,getFeeData:async()=>({gasPrice:2n}),getBalance:async()=>1000n*10n**18n};
  const wallet={address:sender,sendTransaction:async tx=>{sends.push(tx);return {hash};}};
  const faucet=createFaucet({provider,wallet,firstBlockHash:hash,now:()=>clock,maxTracked:2,dailyCapPpl:null,sourceDailyCapPpl:null});
  await faucet.fund({address:addr(1),amount:'1'},'a');
  await faucet.fund({address:addr(2),amount:'1'},'b');
  await assert.rejects(faucet.fund({address:addr(3),amount:'1'},'c'),/faucet_busy/);
  clock=24*60*60_000+1;
  await faucet.fund({address:addr(3),amount:'1'},'c');
  assert.equal(sends.length,3);
});
