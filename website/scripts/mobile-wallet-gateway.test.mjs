import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generatePrivateKey, privateKeyToAccount} from 'viem/accounts';
import {recoverMessageAddress} from 'viem';
import {parseSiweMessage} from 'viem/siwe';
import {MobileWalletGateway, PEOPLE_CONNECT_ORIGIN, checkedMessage, checkedAddress} from '../src/lib/mobile-wallet/service.ts';

class Store {
  rows=new Map();
  async insert(r){assert(!this.rows.has(r.id));this.rows.set(r.id,JSON.stringify(r))}
  async read(id){return this.rows.has(id)?JSON.parse(this.rows.get(id)):null}
  async replace(a,b){if(this.rows.get(a.id)!==JSON.stringify(a))return false;this.rows.set(a.id,JSON.stringify(b));return true}
}
const origin=PEOPLE_CONNECT_ORIGIN;
const body=(action,fields={})=>({version:1,action,...fields});
async function fixture(){
  const store=new Store(); let now=Date.parse('2026-10-18T10:00:00.000Z');
  const gateway=new MobileWalletGateway(store,origin,()=>now);
  const exec=(action,fields={},from=null)=>gateway.execute(body(action,fields),from);
  const created=await exec('create',{},origin);
  const pairToken=new URLSearchParams(new URL(created.link).hash.slice(1)).get('token');
  const account=privateKeyToAccount(generatePrivateKey());
  const pair={id:created.id,pairToken,address:account.address};
  const challenge=await exec('challenge',pair);
  const phoneToken='bc'.repeat(32);
  const connect={...pair,message:challenge.message,signature:await account.signMessage({message:challenge.message}),phoneToken};
  return {store,exec,created,pairToken,account,challenge,phoneToken,connect,advance(ms){now+=ms}};
}
const rejects=(p,code)=>assert.rejects(p,e=>e.code===code);
test('real EIP191 connect/sign/recover/reject/disconnect; independent role capabilities',async()=>{
  const f=await fixture();
  const parsed=parseSiweMessage(f.challenge.message);
  assert.equal(parsed.chainId,97401);assert.equal(parsed.domain,'www.peopleblockchain.network');
  assert.equal(parsed.scheme,'https');assert.equal(parsed.nonce,f.challenge.nonce);
  assert.equal(Date.parse(f.challenge.expiresAt)-Date.parse(f.challenge.issuedAt),120000);
  assert(!f.challenge.message.endsWith('\n'));
  const {session}=await f.exec('connect',f.connect);assert.equal(session.address,f.account.address);
  const browser={id:session.id,browserToken:f.created.browserToken};
  const phone={id:session.id,phoneToken:f.phoneToken};
  await rejects(f.exec('status',{...browser,browserToken:f.phoneToken},origin),'not_authorized');
  await rejects(f.exec('poll',{...phone,phoneToken:f.created.browserToken}),'not_authorized');
  await rejects(f.exec('challenge',{id:session.id,pairToken:f.pairToken,address:f.account.address}),'not_authorized');
  const {request}=await f.exec('request',{...browser,message:'PEOPLE connection test — no transaction.'},origin);
  await rejects(f.exec('request',{...browser,message:'overlap'},origin),'request_pending');
  const signature=await f.account.signMessage({message:request.message});
  const response=await f.exec('respond',{...phone,requestId:request.id,decision:'approve',signature});
  assert.equal(response.request.status,'approved');
  assert.equal(await recoverMessageAddress({message:request.message,signature:response.request.signature}),f.account.address);
  await rejects(f.exec('respond',{...phone,requestId:request.id,decision:'approve',signature}),'request_changed');
  const second=await f.exec('request',{...browser,message:'Reject this request'},origin);
  const rejected=await f.exec('respond',{...phone,requestId:second.request.id,decision:'reject'});
  assert.equal(rejected.request.code,4001);assert(!('signature' in rejected.request));
  await f.exec('disconnect',{id:session.id,role:'browser',token:f.created.browserToken},origin);
  assert.equal((await f.exec('poll',phone)).state,'disconnected');
  await rejects(f.exec('request',{...browser,message:'after disconnect'},origin),'wrong_state');
  const raw=[...f.store.rows.values()].join('');
  for(const token of [f.phoneToken,f.created.browserToken,f.pairToken]) assert(!raw.includes(token));
});
test('pairing CAS consumes nonce once even under concurrent valid signatures',async()=>{
  const f=await fixture();
  const results=await Promise.allSettled([f.exec('connect',f.connect),f.exec('connect',f.connect)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.code==='state_changed').length,1);
});
test('tampered message/wrong signer/role reuse cannot connect; original remains usable',async()=>{
  const f=await fixture();
  await rejects(f.exec('connect',{...f.connect,message:f.connect.message+'\n'}),'message_changed');
  const other=privateKeyToAccount(generatePrivateKey());
  await rejects(f.exec('connect',{...f.connect,signature:await other.signMessage({message:f.connect.message})}),'invalid_signature');
  await rejects(f.exec('connect',{...f.connect,phoneToken:f.created.browserToken}),'role_token_reuse');
  await f.exec('connect',f.connect);
});
test('pair/request/session expiry and stale response remain closed',async()=>{
  const f=await fixture();f.advance(120000);
  await rejects(f.exec('connect',f.connect),'expired');
  const g=await fixture();await g.exec('connect',g.connect);
  const browser={id:g.created.id,browserToken:g.created.browserToken};
  const phone={id:g.created.id,phoneToken:g.phoneToken};
  const {request}=await g.exec('request',{...browser,message:'short lived'},origin);
  g.advance(120000);
  assert.equal((await g.exec('poll',phone)).request.status,'expired');
  await rejects(g.exec('respond',{...phone,requestId:request.id,decision:'reject'}),'request_expired');
  const next=await g.exec('request',{...browser,message:'new request'},origin);
  assert.notEqual(next.request.id,request.id);
  await rejects(g.exec('respond',{...phone,requestId:request.id,decision:'reject'}),'request_changed');
  g.advance(900000);
  assert.equal((await g.exec('poll',phone)).state,'expired');
});
test('origins, schema, message controls and address checksum are strict',async()=>{
  const f=await fixture();
  await rejects(f.exec('create',{},null),'invalid_origin');
  await rejects(f.exec('create',{},'https://peopleblockchain.network'),'invalid_origin');
  await rejects(f.exec('challenge',{...f.connect,extra:'x'}),'unknown_field');
  await rejects(f.exec('eth_sendTransaction',{}),'invalid_request');
  await rejects(f.exec('challenge',{id:f.created.id,pairToken:f.pairToken,address:f.account.address},'https://evil.example'),'invalid_origin');
  for(const text of ['', 'a'.repeat(8193),'hide\u202esite','\u0000','\ud800','\u200b','\u061c']) assert.throws(()=>checkedMessage(text));
  assert.equal(checkedMessage('Hi\n🙂'), 'Hi\n🙂');
  assert.throws(()=>checkedAddress('0x9858EffD232B4033E47d90003D41EC34EcaEda94'));
  assert.throws(()=>checkedAddress('0x'+'0'.repeat(40)));
});
