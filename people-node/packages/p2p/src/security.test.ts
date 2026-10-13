import { test, expect } from "vitest";
import { once } from "node:events";
import { gzipSync } from "node:zlib";
import WebSocket, { WebSocketServer } from "ws";
import { GossipNetwork } from "./index.js";

async function fixture(
  run: (network:GossipNetwork, socket:WebSocket)=>Promise<void>,
  maxMessageBytes=4096,
  extra: Partial<ConstructorParameters<typeof GossipNetwork>[0]> = {}
) {
  const network = new GossipNetwork({peerId:"receiver",chainId:"test-a",port:0,maxMessageBytes,...extra});
  await network.start();
  const server = (network as unknown as {wss:WebSocketServer}).wss;
  if (!server.address()) await once(server,"listening");
  const address = server.address();
  if(typeof address === "string" || !address) throw new Error("Missing listener");
  const socket = new WebSocket(`ws://127.0.0.1:${address.port}`);
  await once(socket,"open");
  try {await run(network,socket);} finally {socket.terminate();await network.close();}
}
const wire = (type:string,payload:unknown) => JSON.stringify({peerId:"sender",type,payload});
const pause = () => new Promise(resolve=>setTimeout(resolve,30));

test("traffic before handshake is rejected", async () => fixture(async (network,socket)=>{
  let delivered=0;network.on("tx",()=>delivered++);
  const closed=once(socket,"close");socket.send(wire("tx",{id:"injected"}));await closed;
  expect(delivered).toBe(0);
}));
test("different chain handshake is rejected", async () => fixture(async (_network,socket)=>{
  const closed=once(socket,"close");socket.send(wire("hello",{chainId:"test-b"}));await closed;
}));
test("matching handshake permits tx; malformed block closes connection", async () => fixture(async(network,socket)=>{
  let delivered=0;network.on("tx",()=>delivered++);
  socket.send(wire("hello",{chainId:"test-a"}));socket.send(wire("tx",{id:"valid-envelope"}));await pause();
  expect(delivered).toBe(1);
  const closed=once(socket,"close");socket.send(wire("block",{hash:"bad"}));await closed;
}));
test("compressed block response cannot exceed decoded byte budget", async () => fixture(async(network,socket)=>{
  let delivered=0;network.on("blocks_response",()=>delivered++);
  socket.send(wire("hello",{chainId:"test-a"}));
  const gz=gzipSync(Buffer.from(" ".repeat(100_000)+"[]")).toString("base64");
  socket.send(wire("blocks_response",{gz}));await pause();expect(delivered).toBe(0);
  socket.send(wire("tx",{id:"still-alive"}));await pause();expect(socket.readyState).toBe(WebSocket.OPEN);
}));
test("oversized websocket frame is rejected before JSON parsing", async () => fixture(async(_network,socket)=>{
  const closed=once(socket,"close");socket.send("x".repeat(8192));const [code]=await closed;expect(code).toBe(1009);
}));

test("private, loopback and CGNAT peer hints are never recorded", () => {
  const network = new GossipNetwork({peerId:"book",chainId:"test-a",port:4009,advertiseAddress:"ws://203.0.113.8:4009"});
  for (const hint of [
    "ws://10.0.0.5:4009","ws://192.168.1.9:4009","ws://172.20.0.4:4009","ws://169.254.1.1:4009",
    "ws://100.64.0.7:4009","ws://[fc00::1]:4009","ws://[fe80::1]:4009","ws://127.0.0.1:4009","ws://localhost:4009",
  ]) network.recordListenHint(hint);
  network.recordListenHint("ws://198.51.100.7:4009");
  expect(network.recordedPeerAddresses()).toEqual(["ws://198.51.100.7:4009"]);
});

test("a socket that never completes the handshake is closed", async () => fixture(async (_network,socket)=>{
  const closed=once(socket,"close");await closed;expect(socket.readyState).not.toBe(WebSocket.OPEN);
},4096,{handshakeTimeoutMs:50}));

test("per-socket message rate limit closes a flooding peer", async () => fixture(async (_network,socket)=>{
  socket.send(wire("hello",{chainId:"test-a"}));await pause();
  const closed=once(socket,"close");
  for(let i=0;i<40;i+=1) socket.send(wire("tx",{id:`flood-${i}`}));
  await closed;expect(socket.readyState).not.toBe(WebSocket.OPEN);
},4096,{maxMessagesPerSecond:5}));

test("a forged envelope cannot poison the seen-set for a different tx", async () => fixture(async (network,socket)=>{
  const delivered:string[]=[];
  network.on("tx",(tx)=>delivered.push(String((tx as {tag?:string}).tag)));
  socket.send(wire("hello",{chainId:"test-a"}));await pause();
  socket.send(wire("tx",{id:"shared-id",tag:"forged"}));await pause();
  socket.send(wire("tx",{id:"shared-id",tag:"real"}));await pause();
  socket.send(wire("tx",{id:"shared-id",tag:"forged"}));await pause();
  expect(delivered).toEqual(["forged","real"]);
}));
