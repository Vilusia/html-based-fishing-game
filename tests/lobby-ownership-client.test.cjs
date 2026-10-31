const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto').webcrypto;
const source=fs.readFileSync('ui.js','utf8'),code=source.slice(source.indexOf('function lobbyPlayerCount()'),source.indexOf('// --- server browser'));
function setup(){
 const requests=[],rows=new Map(),beacons=[],toasts=[];let protocol=1,block=null;
 const c=vm.createContext({crypto,Uint8Array,Blob,Promise,console:{warn(){}},isHost:true,myPeerId:'fish-owner',currentRoomId:'fish-owner',clientConns:{},myLobbyName:'Test lobby',saveState:{displayName:'Owner',lobbyTags:['Chill']},GAME_VERSION:'test',MAX_LOBBY_TAGS:10,LOBBY_HEARTBEAT_MS:10000,MASTER_SERVER_URL:'https://directory.invalid',masterEnabled:()=>true,lobbyIsPublic:()=>true,defaultLobbyName:()=> 'Test lobby',setInterval:()=>1,clearInterval(){},showToast:s=>toasts.push(s),navigator:{sendBeacon:(url,blob)=>{beacons.push({url,blob});return true;}},fetch(){throw Error('unexpected fetch');},masterRequest:async(path,body)=>{
  requests.push({path,body});if(path==='/health')return {ownershipVersion:protocol};
  if(block&&path==='/register'){const wait=block;block=null;await wait;}
  if(path==='/register'){
   const before=rows.get(body.id);
   if(before&&body.lobby_secret!==before.secret||!before&&body.lobby_secret){const e=Error('rejected');e.status=403;throw e;}
   const secret=before?.secret||'a'.repeat(43);rows.set(body.id,{secret,peer:body.peerId});
   return {ownershipVersion:1,id:body.id,...(!before?{lobby_secret:secret}:{})};
  }
  if(path==='/unregister'){assert.equal(body.lobby_secret,rows.get(body.id)?.secret);rows.delete(body.id);return {removed:1};}
 }});
 vm.runInContext('let lobbyDirectorySession=null,lobbyDirectoryVerified=false,lobbyPublished=false,lobbyHeartbeatTimer=null;',c);vm.runInContext(code,c);
 return {c,requests,rows,beacons,toasts,state:()=>vm.runInContext('lobbyDirectorySession',c),published:()=>vm.runInContext('lobbyPublished',c),setProtocol:v=>protocol=v,blockNext:()=>{let resolve;block=new Promise(r=>resolve=r);return resolve;}};
}
test('hosting authenticates heartbeat and unregister without sending its secret to a public endpoint',async()=>{
 const s=setup();await s.c.publishLobby();const original=s.state();assert(s.published());assert.match(original.id,/^lobby:[a-f0-9]{48}$/);
 await s.c.publishLobby();const writes=s.requests.filter(r=>r.path==='/register');assert.equal(writes.length,2);assert.equal(writes[0].body.lobby_secret,undefined);assert.equal(writes[1].body.lobby_secret,original.secret);
 await s.c.unpublishLobby();assert.equal(s.rows.size,0);assert.equal(s.state(),null);
 for(const r of s.requests)assert(!r.path.includes(original.secret));
});
test('concurrent publishes serialize the initial claim instead of racing for ownership',async()=>{
 const s=setup();const release=s.blockNext(),a=s.c.publishLobby(),b=s.c.publishLobby(),d=s.c.publishLobby();await Promise.resolve();release();await Promise.all([a,b,d]);
 assert.equal(s.requests.filter(r=>r.path==='/register').length,1);assert(s.published());
});
test('private/unpublished while first registration is in flight cleans up using the returned capability',async()=>{
 const s=setup(),release=s.blockNext(),publishing=s.c.publishLobby();await new Promise(setImmediate);
 const closed=s.c.unpublishLobby();release();await Promise.all([publishing,closed]);
 assert.equal(s.rows.size,0);assert(!s.published());assert.equal(s.requests.filter(r=>r.path==='/unregister').length,1);
});
test('switching to private during registration cancels the pending public listing',async()=>{
 const s=setup(),release=s.blockNext(),publishing=s.c.publishLobby();await new Promise(setImmediate);
 s.c.lobbyIsPublic=()=>false;await s.c.publishLobby();release();await publishing;
 assert.equal(s.rows.size,0);assert(!s.published());
});
test('capability loss or expired server state creates a fresh id rather than claiming the previous listing',async()=>{
 const s=setup();await s.c.publishLobby();const id=s.state().id;s.rows.clear();await s.c.publishLobby();assert.equal(s.state(),null);assert(!s.published());
 await s.c.publishLobby();assert.notEqual(s.state().id,id);assert(s.published());
 const second=setup();await second.c.publishLobby();assert.notEqual(second.state().id,s.state().id,'another tab has its own listing identity');
});
test('unload beacon carries capability only in the body',async()=>{
 const s=setup();await s.c.publishLobby();const secret=s.state().secret;s.c.leaveLobbyDirectory();assert.equal(s.beacons.length,1);assert(!s.beacons[0].url.includes(secret));assert.equal(JSON.parse(await s.beacons[0].blob.text()).lobby_secret,secret);assert(!s.published());
});
test('legacy masters are rejected before any insecure registration is sent',async()=>{
 const s=setup();s.setProtocol(undefined);await s.c.publishLobby();assert.equal(s.requests.length,1);assert.equal(s.requests[0].path,'/health');assert.equal(s.rows.size,0);assert(!s.published());assert(s.toasts.length);
});
test('capabilities never enter save data or device-stable public ids',()=>{
 assert(!code.includes('localStorage'));assert(!code.includes('sessionStorage'));assert(!code.includes('saveGame'));assert(!code.includes('myDeviceID'));
});
