import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { decodeFunctionData, encodeFunctionResult, encodeAbiParameters, encodeEventTopics, keccak256 } from "viem";
import { configuredDeployment, parseLots, parsePrice, costOf, displayAtoms, safeSource, canonicalTrades } from "../src/lib/predict/model.ts";
import { verifiedAccount } from "../src/lib/predict/wallet.ts";
import { predictAbi } from "../src/lib/predict/abi.ts";
import { sendPredictTransaction } from "../src/lib/predict/transact.ts";
import { readPredictSnapshot } from "../src/lib/predict/read.ts";
const address = "0x1111111111111111111111111111111111111111";
const maker = "0x2222222222222222222222222222222222222222";
const arbiter = "0x3333333333333333333333333333333333333333";
const hash = "0x" + "a".repeat(64), genesis = "0x" + "b".repeat(64), code = "0x6000";
const undeployed = {chainId:97401,address:null,runtimeCodeHash:null,genesisHash:null,startBlock:null,release:null};
const deployed = {...undeployed,address,runtimeCodeHash:keccak256(code),genesisHash:genesis,startBlock:1,release:"reviewed-test-fixture"};
test("amount parsing preserves all atoms and rejects rounding/exponents/unsafe strings", () => {
  assert.equal(parseLots("1000000000000000000.0001"),1000000000000000000000100000000000000n);
  for (const v of ["0","-1","NaN","1e18","0.00001","01"," 1","1."]) assert.throws(()=>parseLots(v));
  assert.equal(costOf(parseLots("0.0001"),parsePrice("0.0001")),10000000000n);
  assert.equal(displayAtoms(500000000000000000n.toString()),"0.5");
  assert.throws(()=>parsePrice("1")); assert.throws(()=>costOf(1n,parsePrice("0.5")));
});
test("deployment fails closed on partial identity / missing code pin / wrong chain", () => {
  assert.equal(configuredDeployment(undeployed),false); assert.equal(configuredDeployment(deployed),true);
  for (const d of [{...deployed,chainId:1},{...deployed,address:"0x"+"0".repeat(40)},{...deployed,runtimeCodeHash:null},{...deployed,genesisHash:null},{...deployed,startBlock:0.5},{...deployed,release:null}]) assert.throws(()=>configuredDeployment(d));
});
test("source URLs reject active content and credentials",()=>{ assert.equal(safeSource("javascript:alert(1)"),null);assert.equal(safeSource("https://user:pass@example.com"),null);assert.equal(safeSource("http://example.com"),null);assert.equal(safeSource("https://example.com/source"),"https://example.com/source"); });
test("wallet checks chain before access, rejects account absence and preserves rejection",async()=>{
  let requests=[];
  const p={request:async({method})=>{requests.push(method);return method==="eth_chainId"?"0x1":[address];}};
  await assert.rejects(()=>verifiedAccount(p,true),/wrong_chain/);assert.deepEqual(requests,["eth_chainId"]);
  p.request=async({method})=>method==="eth_chainId"?"0x17c79":[];await assert.rejects(()=>verifiedAccount(p),/no_account/);
  p.request=async({method})=>method==="eth_chainId"?"0x17c79":[address];assert.equal(await verifiedAccount(p),address);
  p.request=async({method})=>{if(method==="eth_chainId")return "0x17c79";throw Object.assign(new Error("denied"),{code:4001});};
  await assert.rejects(()=>verifiedAccount(p,true),e=>e.code===4001);
});
test("index deduplicates by canonical block identity and log index, not fabricated tx IDs",()=>{
  const r={blockNumber:"2",blockHash:hash,txHash:hash,logIndex:1};
  const rows=canonicalTrades([r,{...r,blockNumber:"1",blockHash:genesis},r]); assert.equal(rows.length,2);assert.equal(rows[0].blockNumber,"1");
});
async function rpcFixture(run, mode="ready") {
  let snapshots=0;
  const server=createServer(async(req,res)=>{
    if(mode==="failure"){res.statusCode=503;res.end("unavailable");return;}
    let body="";for await(const chunk of req)body+=chunk;
    function answer(q){
      let result;
      if(q.method==="eth_chainId")result=mode==="wrong"?"0x1":"0x17c79";
      else if(q.method==="eth_getBalance")result="0xde0b6b3a7640000";
      else if(q.method==="eth_getCode")result=mode==="badcode"?"0x6001":code;
      else if(q.method==="eth_getBlockByNumber") {
        const zero=q.params[0]==="0x0";
        result={number:zero?"0x0":"0x64",hash:zero?(mode==="genesis"?hash:genesis):(mode==="reorg"&&++snapshots>1?genesis:hash),parentHash:genesis,nonce:"0x0000000000000000",sha3Uncles:hash,logsBloom:"0x"+"0".repeat(512),transactionsRoot:hash,stateRoot:hash,receiptsRoot:hash,miner:address,difficulty:"0x0",totalDifficulty:"0x0",extraData:"0x",size:"0x0",gasLimit:"0x1c9c380",gasUsed:"0x0",timestamp:"0x"+(Math.floor(Date.now()/1000)-(mode==="stale"?600:0)).toString(16),transactions:[],uncles:[]};
      } else if(q.method==="eth_call") {
        const {functionName,args}=decodeFunctionData({abi:predictAbi,data:q.params[0].data});
        const values={VERSION:mode==="version"?2n:1n,admin:address,marketCount:1n,orderCount:1n,credits:500000000000000000n,
          getMarket:{title:"Test-only fixture question",terms:"Exact official criteria",source:"https://example.org/source",category:"science",closeAt:BigInt(Math.floor(Date.now()/1000)+3600),resolver:maker,arbiter,proposedAt:0n,proposedOutcome:0,disputed:false,outcome:0,collateral:1000000000000000000n},
          positions:[1000000000000000000n,0n],orders:[maker,1n,true,false,500000000000000000n,1000000000000000000n,BigInt(Math.floor(Date.now()/1000)+3600)]};
        if(functionName==="getMarket")assert.equal(args[0],1n);
        assert.equal(q.params[1],"0x64","all contract reads pinned to one block");
        result=encodeFunctionResult({abi:predictAbi,functionName,result:values[functionName]});
      } else if(q.method==="eth_getLogs") {
        const log={address,blockNumber:"0x64",blockHash:hash,transactionHash:genesis,transactionIndex:"0x0",logIndex:"0x0",removed:false,
          topics:encodeEventTopics({abi:predictAbi,eventName:"Trade",args:{orderId:1n,marketId:1n,taker:address}}),
          data:encodeAbiParameters([{type:"address"},{type:"bool"},{type:"bool"},{type:"uint256"},{type:"uint256"},{type:"uint256"}],[maker,true,false,1000000000000000000n,500000000000000000n,500000000000000000n])};
        result=[log,log];
      } else throw new Error(q.method);
      return {jsonrpc:"2.0",id:q.id,result};
    }
    try {const q=JSON.parse(body);res.setHeader("Content-Type","application/json");res.end(JSON.stringify(Array.isArray(q)?q.map(answer):answer(q)));}catch(e){res.statusCode=500;res.end(String(e));}
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  try{await run(`http://127.0.0.1:${server.address().port}`);}finally{await new Promise(resolve=>server.close(resolve));}
}
test("read adapter reports undeployed instead of simulated markets while reading real-shaped balance",async()=>rpcFixture(async rpcUrl=>{
  const s=await readPredictSnapshot({account:address},{rpcUrl,deployment:undeployed});assert.equal(s.status,"undeployed");assert.deepEqual(s.markets,[]);assert.equal(s.accountBalance,"1000000000000000000");assert.equal(s.credits,null);
}));
test("read adapter verifies code and genesis, pins state, indexes actual logs without duplicates",async()=>rpcFixture(async rpcUrl=>{
  const s=await readPredictSnapshot({account:address,marketId:1n},{rpcUrl,deployment:deployed});assert.equal(s.status,"ready");assert.equal(s.markets[0].yes,"1000000000000000000");assert.equal(s.trades.length,1);assert.equal(s.trades[0].cost,"500000000000000000");assert.equal(s.orders[0].remaining,"1000000000000000000");assert.equal(s.credits,"500000000000000000");
}));
for(const [mode,error]of [["wrong","wrong_chain"],["stale","stale_network"],["genesis","genesis_mismatch"],["badcode","contract_mismatch"],["version","version_mismatch"],["reorg","reorg_retry"]])test(`read adapter fails closed: ${mode}`,async()=>rpcFixture(async rpcUrl=>{
  await assert.rejects(()=>readPredictSnapshot({},{rpcUrl,deployment:deployed}),new RegExp(error));
},mode));
test("read pagination and missing market are bounded",async()=>rpcFixture(async rpcUrl=>{
  const s=await readPredictSnapshot({page:1,orderPage:1},{rpcUrl,deployment:deployed});assert.deepEqual(s.markets,[]);assert.deepEqual(s.orders,[]);
  await assert.rejects(()=>readPredictSnapshot({marketId:2n},{rpcUrl,deployment:deployed}),/market_not_found/);
  await assert.rejects(()=>readPredictSnapshot({page:-1},{rpcUrl,deployment:deployed}),/page/);
}));

test("undeployed write gate never asks wallet for keys, signature or transaction",async()=>{
 const requests=[];const p={request:async q=>{requests.push(q.method);throw new Error("must not reach wallet");}};
 await assert.rejects(()=>sendPredictTransaction(p,address,"split",[1n],1000000000000000000n),/undeployed/);
 assert.deepEqual(requests,[]);
});

test("RPC failure is an error, never empty invented data",async()=>rpcFixture(async rpcUrl=>{
 await assert.rejects(()=>readPredictSnapshot({},{rpcUrl,deployment:undeployed}));
},"failure"));
