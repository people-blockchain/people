import {test} from 'node:test';
import assert from 'node:assert/strict';
import { parseUnits } from 'viem';
import {readPending,trackPending,forgetPending,operationStatus,parseWalletAddress,maxTransferAmount} from '../src/lib/wallet-activity.ts';
test('pending history is scoped, deduplicated and never stores credentials',()=>{
  const values=new Map();globalThis.localStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
  const row={id:'tx1',from:'alice',to:'bob',amount:2,fee:0.1,timestamp:100,type:'transfer',privateKey:'secret',signature:'signature'};
  trackPending('a','alice',row);trackPending('a','alice',row);
  assert.equal(readPending('a','alice').length,1);assert.equal(readPending('b','alice').length,0);
  assert.ok(![...values.values()].join('').includes('secret'));assert.ok(![...values.values()].join('').includes('signature'));
  forgetPending('a','alice',['tx1']);assert.equal(readPending('a','alice').length,0);
});
test('finality comes from block height and a timeout is not a failed payment',()=>{
  assert.equal(operationStatus({timestamp:100},0,200),'pending');
  assert.equal(operationStatus({timestamp:100},0,130000),'unresolved');
  assert.equal(operationStatus({blockHeight:12},11,0),'included');
  assert.equal(operationStatus({blockHeight:12},12,0),'finalized');
});
test('QR address validation rejects unsafe schemes and malformed recipients',()=>{
 const address='0x'+'a'.repeat(40);
 assert.equal(parseWalletAddress(address),address);assert.equal(parseWalletAddress('https://example.com/explorer/address/'+address),address);
 for(const value of ['javascript:alert(1)','0x123','https://example.com/?address='+address])assert.equal(parseWalletAddress(value),null);
});
test('maximum native payment leaves the approved fee available',()=>{
 const fee=parseUnits('0.004875',18);
 for(const balance of ['10','0.004875','0','100.123456789']){
  const balanceWei=parseUnits(balance,18);
  const maxWei=parseUnits(maxTransferAmount(balanceWei,fee),18);
  assert.ok(maxWei>=0n);
  if(balanceWei>=fee)assert.equal(maxWei+fee,balanceWei);
  else assert.equal(maxWei,0n);
 }
});
