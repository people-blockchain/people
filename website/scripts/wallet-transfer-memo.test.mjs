import test from 'node:test';
import assert from 'node:assert/strict';
import { stringToHex, parseTransaction } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { nativeTransferRequest, sendNativeTransfer } from '../src/lib/evm/wallet-send.ts';
import { transactionMemo } from '../src/lib/evm/transaction-memo.ts';
import { handleEvmCompatGet } from '../src/lib/evm/people-compat.ts';
const to = '0x1111111111111111111111111111111111111111';
// Public test vector; never funded or used against a network.
const privateKey = `0x${'01'.repeat(32)}`;
const hash = `0x${'ab'.repeat(32)}`;
const memo = 'Оплата №42 👋\nThank you <script>alert(1)</script>';

test('actual native send signs and submits exact UTF-8 memo; gas is estimated with that data', async t => {
  const NativeRequest = globalThis.Request;
  t.mock.method(globalThis, "Request", class extends NativeRequest {
    constructor(url, options) { super(typeof url === "string" && url.startsWith("/") ? `http://127.0.0.1${url}` : url, options); }
  });
  const seen = [];
  let signed;
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    const request = JSON.parse(init?.body ?? await _url.text()); seen.push(request);
    let result;
    switch(request.method) {
      case 'eth_fillTransaction': return Response.json({jsonrpc:'2.0',id:request.id,error:{code:-32601,message:'unsupported'}});
      case 'eth_getCode': result='0x'; break;
      case 'eth_getTransactionCount': result='0x0'; break;
      case 'eth_chainId': result='0x17c79'; break;
      case 'eth_estimateGas': result='0x7000'; break;
      case 'eth_gasPrice': result='0x3b9aca00'; break;
      case 'eth_maxPriorityFeePerGas': result='0x3b9aca00'; break;
      case 'eth_getBlockByNumber': result={number:'0x1',baseFeePerGas:'0x3b9aca00'}; break;
      case 'eth_sendRawTransaction': signed=request.params[0]; result=hash; break;
      default: throw Error(`Unexpected ${request.method}`);
    }
    return Response.json({jsonrpc:'2.0',id:request.id,result});
  });
  assert.equal(await sendNativeTransfer({privateKey,to,amountPpl:1,memo}), hash);
  const tx=parseTransaction(signed);
  assert.equal(tx.data,stringToHex(memo));
  assert.equal(tx.value,10n**18n);
  assert.equal(tx.to.toLowerCase(),to);
  assert.equal(seen.find(r=>r.method==='eth_estimateGas').params[0].data,stringToHex(memo));
  assert.ok(tx.gas>=28672n);
});

test('memo to a contract address rejects with memo_contract and never submits a transaction', async t => {
  const NativeRequest = globalThis.Request;
  t.mock.method(globalThis, "Request", class extends NativeRequest {
    constructor(url, options) { super(typeof url === "string" && url.startsWith("/") ? `http://127.0.0.1${url}` : url, options); }
  });
  const seen = [];
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    const request = JSON.parse(init?.body ?? await _url.text()); seen.push(request);
    let result;
    switch(request.method) {
      case 'eth_getCode': result='0x6080'; break;
      case 'eth_chainId': result='0x17c79'; break;
      default: throw Error(`Unexpected ${request.method}`);
    }
    return Response.json({jsonrpc:'2.0',id:request.id,result});
  });
  await assert.rejects(()=>sendNativeTransfer({privateKey,to,amountPpl:1,memo}),/memo_contract/);
  assert.ok(seen.some(r=>r.method==='eth_getCode'));
  assert.ok(!seen.some(r=>r.method==='eth_sendRawTransaction'));
});

test('empty memo keeps a plain transfer; valid Unicode survives signing; invalid text is rejected', async () => {
  assert.deepEqual(nativeTransferRequest({to,amountPpl:1}),{to,value:10n**18n});
  assert.deepEqual(nativeTransferRequest({to,amountPpl:1,memo:''}),{to,value:10n**18n});
  const account=privateKeyToAccount(privateKey);
  const text='я'.repeat(256);
  const raw=await account.signTransaction({...nativeTransferRequest({to,amountPpl:1,memo:text}),chainId:97401,nonce:0,gas:40000n,gasPrice:1n});
  assert.equal(transactionMemo({to,input:parseTransaction(raw).data}),text);
  for (const invalid of ['x'.repeat(257),'\u0000','\ud800','  ','a\u202eb']) {
    assert.throws(()=>nativeTransferRequest({to,amountPpl:1,memo:invalid}),/invalid_memo/);
  }
  for (const input of ['0xa9059cbb'+'00'.repeat(64),'0xc080','0x00','0x']) assert.equal(transactionMemo({to,input}),null);
});

test('confirmed transaction detail reads memo from chain input, not browser storage', async t => {
  t.mock.method(globalThis,'fetch',async (_url,init)=>{
    const r=JSON.parse(init.body);
    const result=r.method==='eth_getTransactionByHash'?{hash,from:to,to,value:'0xde0b6b3a7640000',input:stringToHex(memo),blockNumber:'0x1'}:{gasUsed:'0x7000',effectiveGasPrice:'0x1'};
    return Response.json({jsonrpc:'2.0',id:r.id,result});
  });
  const result=await handleEvmCompatGet(`transactions/${hash}`,new URLSearchParams());
  assert.equal(result.body.payload.memo,memo);
});
