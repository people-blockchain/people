import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { archivedBlockTime } from '../src/lib/archive-block-time.ts';
function start(t) {
 t.mock.timers.enable({apis:['setTimeout']});
 const socket = { sent: [], closed: false, send(s){this.sent.push(JSON.parse(s));}, close(){this.closed=true;}, receive(message){this.onmessage?.({data:JSON.stringify(message)});} };
 const promise=archivedBlockTime('wss://example.test/gossip','test',100,()=>socket);
 socket.onopen();
 return {socket,promise};
}
test('archive timestamp requires matching handshake, height and chain', async t=>{
 const {socket,promise}=start(t);
 socket.receive({type:'blocks_response',payload:{blocks:[{header:{height:100,chainId:'test',timestamp:42}}]}});
 assert.equal(socket.closed,false);
 socket.receive({type:'hello',payload:{chainId:'test'}});
 assert.equal(socket.sent.at(-1).type,'request_blocks');
 socket.receive({type:'blocks_response',payload:{blocks:[{header:{height:100,chainId:'test',timestamp:42}}]}});
 assert.equal(await promise,42); assert.equal(socket.closed,true);
});
test('compressed archive blocks supported', async t=>{
 const {socket,promise}=start(t);socket.receive({type:'hello',payload:{chainId:'test'}});
 const gz=gzipSync(JSON.stringify([{header:{height:100,chainId:'test',timestamp:42}}])).toString('base64');
 socket.receive({type:'blocks_response',payload:{gz}});assert.equal(await promise,42);
});
test('wrong network rejected', async t=>{
 const {socket,promise}=start(t);socket.receive({type:'hello',payload:{chainId:'other'}});assert.equal(await promise,null);
});
test('wrong block cannot produce a date',async t=>{
 const {socket,promise}=start(t);socket.receive({type:'hello',payload:{chainId:'test'}});
 socket.receive({type:'blocks_response',payload:{blocks:[{header:{height:99,chainId:'test',timestamp:42}}]}});assert.equal(await promise,null);
});
test('timeout closes socket instead of hanging the loading screen',async t=>{
 const {socket,promise}=start(t);t.mock.timers.tick(5000);assert.equal(await promise,null);assert.equal(socket.closed,true);
});

test('malformed gzip is rejected and closes the connection',async t=>{
 const {socket,promise}=start(t);socket.receive({type:'hello',payload:{chainId:'test'}});socket.receive({type:'blocks_response',payload:{gz:'invalid'}});assert.equal(await promise,null);assert.equal(socket.closed,true);
});
test('decompressed payload is bounded',async t=>{
 const {socket,promise}=start(t);socket.receive({type:'hello',payload:{chainId:'test'}});socket.receive({type:'blocks_response',payload:{gz:gzipSync(' '.repeat(1_048_577)).toString('base64')}});assert.equal(await promise,null);
});
