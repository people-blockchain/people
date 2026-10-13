// End-to-end public-only follower, late archive sync and restart. No external network.
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createTcpServer } from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
const sleep = ms => new Promise(resolve=>setTimeout(resolve,ms));
async function port() { const s=createTcpServer();s.listen(0,'127.0.0.1');await once(s,'listening');const p=s.address().port;await new Promise(r=>s.close(r));return p; }
async function until(fn,timeout=30000) {const end=Date.now()+timeout;while(Date.now()<end){try{if(await fn())return;}catch{}await sleep(100);}throw new Error('Timed out waiting for node');}
const dir=await mkdtemp(join(tmpdir(),'people-public-smoke-'));
process.env.DEV_FAUCET_PRIVATE_KEY=randomBytes(32).toString('hex');
process.env.CHAIN_ID='people-public-smoke-v2';
process.env.CHAIN_WINDOW_BLOCKS='8';
process.env.NODE_ENV='production';
process.env.ARCHIVE_MODE='1';
const { getPublicKey,etc }=await import('@noble/secp256k1');
const {sha256}=await import('@noble/hashes/sha2.js');
process.env.BOOTSTRAP_PRIVATE_KEY=randomBytes(32).toString('hex');
process.env.BOOTSTRAP_ADDRESS='0x'+etc.bytesToHex(sha256(getPublicKey(etc.hexToBytes(process.env.BOOTSTRAP_PRIVATE_KEY),true))).slice(0,40);
const {NodeService}=await import('../apps/node/dist/node-service.js');
const seedPort=await port(), followerPort=await port(), followerGossip=await port();
const seed=new NodeService({dataDir:join(dir,'seed'),peerId:'archive-seed',gossipPort:seedPort,bootstrapPeers:[],advertiseAddress:`ws://127.0.0.1:${seedPort}`,blockIntervalMs:50});
let child;let output='';
const http=createHttpServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(seed.getPublicNetworkInfo()));});
async function stopChild(){if(child&&child.exitCode===null){const exit=once(child,'exit');child.kill('SIGTERM');await exit;}child=undefined;}
try {
  await seed.start();
  await until(()=>seed.getHead().height>=20);
  clearInterval(seed.blockTimer); // Test fixture pauses production while gossip remains live.
  await until(()=>!seed.proposing);
  const target=seed.getHead();
  await seed.prune();
  if(seed.getBlocksInRange(1,1).length)throw new Error('Fixture did not trim old in-memory blocks');
  http.listen(0,'127.0.0.1');await once(http,'listening');
  const env={...process.env,NODE_NETWORK_URL:`http://127.0.0.1:${http.address().port}/network`,NODE_ALLOW_HTTP:'1',ARCHIVE_MODE:'0',DATA_DIR:join(dir,'follower'),PORT:String(followerPort),GOSSIP_PORT:String(followerGossip),BIND_HOST:'127.0.0.1'};
  delete env.DEV_FAUCET_PRIVATE_KEY;delete env.BOOTSTRAP_PRIVATE_KEY;delete env.VALIDATOR_PRIVATE_KEY;
  function start(){child=spawn(process.execPath,['scripts/start-public-node.mjs'],{env,stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>{output+=b;});child.stderr.on('data',b=>{output+=b;});}
  start();
  const head=async()=>{const r=await fetch(`http://127.0.0.1:${followerPort}/chain/head`);return r.json();};
  await until(async()=>{if(child.exitCode!==null)throw new Error('Follower stopped');return (await head()).height===target.height;});
  if((await head()).stateRoot!==target.stateRoot)throw new Error('State roots differ');
  const faucet=await fetch(`http://127.0.0.1:${followerPort}/faucet/fund`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({address:'0x'+'1'.repeat(40),amount:1})});
  if(faucet.status!==403 || (await faucet.json()).error!=='faucet_forbidden')throw new Error('Public follower faucet gate failed');
  await stopChild();await new Promise(r=>http.close(r));
  start();await until(async()=>(await head()).height===target.height);
  if((await head()).stateRoot!==target.stateRoot)throw new Error('Restart changed state');
  console.log(`PASS: public-only follower replayed ${target.height} blocks beyond window 8, matched state root, refused faucet and restarted with the manifest server offline.`);
} catch(error) { console.error(output.slice(-3000));throw error; }
finally {await stopChild();http.close();await seed.stop();await rm(dir,{recursive:true,force:true});}
