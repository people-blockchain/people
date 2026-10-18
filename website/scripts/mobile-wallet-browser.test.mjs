import {test} from 'node:test';
import assert from 'node:assert/strict';
import {privateKeyToAccount} from 'viem/accounts';
import {stringToHex} from 'viem';
import {PeopleMobileProvider,mobileWalletApi,observeMobilePair} from '../src/lib/mobile-wallet/browser.ts';
const account=privateKeyToAccount(`0x${'0'.repeat(63)}1`); // PUBLIC unfunded crypto vector, never a live wallet.
const now=Date.parse('2026-10-18T10:00:00.000Z');
const session={id:'12'.repeat(16),origin:'https://www.peopleblockchain.network',chainId:97401,address:account.address,expiresAt:new Date(now+900000).toISOString(),methods:['personal_sign']};
const flush=async()=>{for(let i=0;i<15;i++)await Promise.resolve()};
function setup(t,handler){
 t.mock.timers.enable({apis:['setTimeout','Date'],now});
 const calls=[];
 const oldDocument=globalThis.document;
 globalThis.document={visibilityState:'visible'};
 t.after(()=>{globalThis.document=oldDocument});
 t.mock.method(globalThis,'fetch',async(url,options)=>{assert.equal(url,'/api/mobile-wallet');assert.equal(options.credentials,'omit');const body=JSON.parse(options.body);calls.push(body);return new Response(JSON.stringify(await handler(body)),{headers:{'content-type':'application/json'}})});
 return {provider:new PeopleMobileProvider(session,'34'.repeat(32)),calls};
}
test('unsupported transactions never reach transport; accounts remain available',async t=>{
 const {provider,calls}=setup(t,()=>{throw new Error('unexpected fetch')});
 assert.equal(await provider.request({method:'eth_chainId'}),'0x17c79');
 assert.deepEqual(await provider.request({method:'eth_accounts'}),[account.address]);
 await assert.rejects(provider.request({method:'eth_sendTransaction',params:[{}]}),e=>e.code===4200);
 assert.equal(calls.length,0);
});
test('Strict Mode monitor replay does not disconnect or duplicate timers; remote disconnect emits once',async t=>{
 let resolve;let state='connected';
 const {provider,calls}=setup(t,()=>new Promise(r=>{resolve=()=>r({state,session})}));
 let ended=0;provider.on('disconnect',()=>ended++);
 provider.startMonitoring();await flush();provider.stopMonitoring();provider.startMonitoring();await flush();
 assert.equal(calls.length,1);resolve();await flush();
 assert.equal(ended,0);assert(!calls.some(c=>c.action==='disconnect'));
 state='disconnected';t.mock.timers.tick(5000);await flush();assert.equal(calls.length,2);resolve();await flush();
 assert.equal(ended,1);t.mock.timers.tick(10000);await flush();assert.equal(calls.length,2);
 await assert.rejects(provider.request({method:'eth_accounts'}),/disconnected/);
});
test('personal_sign returns only independently verified signature and preserves rejection4001',async t=>{
 let decision='approved';const message='Visible approval only';const signature=await account.signMessage({message});
 const request={id:'56'.repeat(16),method:'personal_sign',message,expiresAt:new Date(now+120000).toISOString(),status:'pending'};
 const {provider,calls}=setup(t,b=>b.action==='request'?{request}:{state:'connected',session,request:{...request,status:decision,...(decision==='approved'?{signature}:{code:4001})}});
 const first=provider.request({method:'personal_sign',params:[stringToHex(message),account.address]});
 await flush();t.mock.timers.tick(5000);await flush();assert.equal(await first,signature);
 decision='rejected';const second=provider.request({method:'personal_sign',params:[stringToHex(message),account.address]});
 const rejected=assert.rejects(second,e=>e.code===4001);await flush();t.mock.timers.tick(5000);await flush();await rejected;
 assert.equal(calls.filter(c=>c.action==='request').length,2);
});
test('wrong signer cannot satisfy personal_sign and local expiry makes no network calls',async t=>{
 const wrong=privateKeyToAccount(`0x${'0'.repeat(63)}2`);const message='Exact reviewed message';const signature=await wrong.signMessage({message});
 const request={id:'78'.repeat(16),method:'personal_sign',message,expiresAt:new Date(now+120000).toISOString(),status:'pending'};
 const {provider,calls}=setup(t,b=>b.action==='request'?{request}:{state:'connected',session,request:{...request,status:'approved',signature}});
 const promise=provider.request({method:'personal_sign',params:[stringToHex(message),account.address]});
 const rejected=assert.rejects(promise,/bad_signature/);await flush();t.mock.timers.tick(5000);await flush();await rejected;
 const count=calls.length;t.mock.timers.tick(900000);await assert.rejects(provider.request({method:'eth_accounts'}),/disconnected/);assert.equal(calls.length,count);
});

test('browser API aborts a stalled transport after20seconds without retrying writes',async t=>{
 setup(t,()=>({}));let seenSignal,calls=0;
 t.mock.method(globalThis,'fetch',async(_url,options)=>{
  calls++;seenSignal=options.signal;
  return new Promise((_resolve,reject)=>options.signal?.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));
 });
 const pending=mobileWalletApi({action:'create'});pending.catch(()=>{});
 await flush();t.mock.timers.tick(20000);await flush();
 assert.equal(calls,1);assert.equal(seenSignal?.aborted,true,'a stalled browser transport must be bounded');
 await assert.rejects(pending,e=>e.name==='AbortError');
});
test('a delayed approved response cannot return a signature after the request expires',async t=>{
 const message='Time-bounded consent';const signature=await account.signMessage({message});
 const request={id:'9a'.repeat(16),method:'personal_sign',message,expiresAt:new Date(now+120000).toISOString(),status:'pending'};
 let release;
 const {provider}=setup(t,b=>b.action==='request'?{request}:new Promise(resolve=>{release=()=>resolve({state:'connected',session,request:{...request,status:'approved',signature}})}));
 const pending=provider.request({method:'personal_sign',params:[stringToHex(message),account.address]});
 const result=assert.rejects(pending,/expired|Abort|aborted/);
 await flush();t.mock.timers.tick(5000);await flush();
 assert.equal(typeof release,'function');t.mock.timers.tick(120000);release();await flush();await result;
});

test('pair observation resumes after a transient read error and accepts the connected account',async t=>{
 let reads=0,connected=0,retries=0;
 const {calls}=setup(t,()=>{if(++reads===1)throw Error('transient transport failure');return {state:'connected',session}});
 const stop=observeMobilePair({...session,browserToken:'34'.repeat(32)}, {connected:s=>{assert.equal(s.address,account.address);connected++},expired:()=>assert.fail('unexpected expiry'),invalid:()=>assert.fail('unexpected invalid session'),retrying:()=>retries++});
 await flush();t.mock.timers.tick(1000);await flush();assert.equal(retries,1);assert.equal(connected,0);
 t.mock.timers.tick(5000);await flush();assert.equal(connected,1);assert.equal(calls.length,2);
 t.mock.timers.tick(10000);await flush();assert.equal(calls.length,2);stop();
});
test('persistent read failure expires at the pair deadline and stops polling',async t=>{
 let expired=0,retries=0;
 const {calls}=setup(t,()=>{throw Error('offline')});
 observeMobilePair({...session,expiresAt:new Date(now+7000).toISOString(),browserToken:'34'.repeat(32)}, {connected:()=>assert.fail('unexpected connect'),expired:()=>expired++,invalid:()=>assert.fail('unexpected invalid'),retrying:()=>retries++});
 await flush();t.mock.timers.tick(1000);await flush();t.mock.timers.tick(5000);await flush();assert.equal(retries,2);
 t.mock.timers.tick(5000);await flush();assert.equal(expired,1);assert.equal(calls.length,2);
 t.mock.timers.tick(20000);await flush();assert.equal(calls.length,2);
});
test('personal_sign poll survives transient read errors then returns approved signature',async t=>{
 const message='Retry after read glitch';const signature=await account.signMessage({message});
 const request={id:'ab'.repeat(16),method:'personal_sign',message,expiresAt:new Date(now+120000).toISOString(),status:'pending'};
 let statusReads=0;
 const {provider}=setup(t,b=>{
  if(b.action==='request')return {request};
  if(++statusReads===1)throw new Error('transient status read');
  return {state:'connected',session,request:{...request,status:'approved',signature}};
 });
 const pending=provider.request({method:'personal_sign',params:[stringToHex(message),account.address]});
 await flush();t.mock.timers.tick(5000);await flush();assert.equal(statusReads,1);
 t.mock.timers.tick(5000);await flush();assert.equal(await pending,signature);
});
test('five consecutive read failures during personal_sign poll throw mobile_wallet_unavailable',async t=>{
 const message='Offline review';const request={id:'cd'.repeat(16),method:'personal_sign',message,expiresAt:new Date(now+600000).toISOString(),status:'pending'};
 const {provider}=setup(t,b=>b.action==='request'?{request}:(()=>{throw new Error('offline')})());
 const pending=provider.request({method:'personal_sign',params:[stringToHex(message),account.address]});
 const rejected=assert.rejects(pending,/mobile_wallet_unavailable/);
 for(let i=0;i<5;i++){await flush();t.mock.timers.tick(5000);await flush()}
 await rejected;
});
test('stale in-flight status after request does not poison the read cache',async t=>{
 const message='Cache epoch guard';const signature=await account.signMessage({message});
 const request={id:'ef'.repeat(16),method:'personal_sign',message,expiresAt:new Date(now+120000).toISOString(),status:'pending'};
 let releaseStale;let staleStarted=false;
 const {provider}=setup(t,b=>{
  if(b.action==='request')return {request};
  if(!staleStarted){staleStarted=true;return new Promise(r=>{releaseStale=()=>r({state:'connected',session,request:{id:'ff'.repeat(16),method:'personal_sign',message:'stale',expiresAt:request.expiresAt,status:'approved',signature}})})}
  return {state:'connected',session,request:{...request,status:'approved',signature}};
 });
 provider.startMonitoring();await flush();
 const pending=provider.request({method:'personal_sign',params:[stringToHex(message),account.address]});
 await flush();releaseStale();await flush();
 t.mock.timers.tick(5000);await flush();
 assert.equal(await pending,signature);provider.stopMonitoring();
});
test('a mismatched connected session is terminal and is never retried as a transport failure',async t=>{
 let invalid=0;
 const {calls}=setup(t,()=>({state:'connected',session:{...session,id:'ff'.repeat(16)}}));
 observeMobilePair({...session,browserToken:'34'.repeat(32)}, {connected:()=>assert.fail('unexpected connect'),expired:()=>assert.fail('unexpected expiry'),invalid:()=>invalid++,retrying:()=>assert.fail('must not retry invalid data')});
 await flush();t.mock.timers.tick(1000);await flush();assert.equal(invalid,1);
 t.mock.timers.tick(10000);await flush();assert.equal(calls.length,1);
});
