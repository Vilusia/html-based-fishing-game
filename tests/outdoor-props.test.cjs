const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),THREE=require('../vendor/three.min.js');
const catalog=fs.readFileSync(require.resolve('../outdoor-props.js'),'utf8'),propsSource=fs.readFileSync(require.resolve('../props.js'),'utf8');
function setup(){
 const saved=[],toasts=[],sent=[],c=vm.createContext({THREE,console,document:{addEventListener(){}},window:{getTerrainHeight:()=>2},saveState:{money:5000,unlockedProps:[]},saveGame(){saved.push(JSON.stringify(c.saveState));},showToast:m=>toasts.push(m),scene:new THREE.Scene(),player:{position:new THREE.Vector3(10,0,20),rotation:{y:.7}},lastPropTime:0,PROP_COOLDOWN:0,isHost:false,hostConn:null,myDeviceID:'owner',broadcastToClients:m=>sent.push(m),Date,Math});
 vm.runInContext(catalog,c);vm.runInContext(propsSource,c);c.items=vm.runInContext('OUTDOOR_PROPS',c);
 return {c,saved,toasts,sent};
}
test('every catalog prop has a finite, grounded, material-batched model including the bush',()=>{
 const {c}=setup();assert.equal(c.items.length,27);assert.equal(new Set(c.items.map(v=>v.id)).size,27);
 for(const item of c.items){
  assert(item.price>0);const model=c.buildOutdoorProp(item.id),box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3());
  assert(size.x>.1&&size.y>.04&&size.z>.05,item.id+' has volume');assert(box.min.y>=-.15,item.id+' is grounded');
  assert(model.children.length<=10,item.id+' draw budget');let triangles=0;
  model.traverse(m=>{if(m.isMesh){for(const attr of ['position','normal'])assert([...m.geometry.attributes[attr].array].every(Number.isFinite),item.id+' '+attr);triangles+=m.geometry.attributes.position.count/3;}});
  assert(triangles<2500,item.id+' triangle budget');assert.equal(model.userData.modelRevision,2);
  const other=c.buildOutdoorProp(item.id);assert.deepEqual([...other.children[0].geometry.attributes.position.array],[...model.children[0].geometry.attributes.position.array],item.id+' deterministic across peers');
 }
 assert.equal(c.buildOutdoorProp('unknown'),null);assert.equal(c.buildOutdoorProp('house'),null);
});
test('one-time unlock charges exactly once, saves ownership, rejects insufficient funds and invalid ids',()=>{
 const {c,saved}=setup();assert(!c.ownsOutdoorProp('bush'));assert(c.buyOutdoorProp('bush'));assert.equal(c.saveState.money,4850);assert.equal(saved.length,1);
 assert(c.buyOutdoorProp('bush'));assert.equal(c.saveState.money,4850);assert.equal(saved.length,1);
 c.saveState=JSON.parse(saved[0]);assert(c.ownsOutdoorProp('bush'));c.saveState.money=149;assert(!c.buyOutdoorProp('crate'));assert.equal(c.saveState.money,149);assert(!c.ownsOutdoorProp('crate'));
 assert(!c.buyOutdoorProp('house'));assert(!c.buyOutdoorProp('__proto__'));assert(c.ownsOutdoorProp('house'));
 for(const money of [NaN,Infinity,-1]){c.saveState.money=money;assert(!c.buyOutdoorProp('crate'));}
 assert.deepEqual([...c.normalizePropUnlocks(['bush','bush','not-a-prop',null,'chair'])],['bush','chair']);assert.deepEqual([...c.normalizePropUnlocks(undefined)],[]);
});
test('locked direct placements do not spawn or increment progress; unlocked props are reusable and undo disposes them',()=>{
 const {c}=setup();assert.equal(c.placeProp('bush'),false);assert.equal(c.scene.children.length,0);assert.equal(c.saveState.propsPlaced,undefined);
 c.buyOutdoorProp('bush');const balance=c.saveState.money;
 assert(c.placeProp('bush'));assert(c.placeProp('bush'));assert.equal(c.scene.children.length,2);assert.equal(c.saveState.money,balance);assert.equal(c.saveState.propsPlaced,2);
 const first=c.scene.children[0];assert.equal(first.position.y,2);assert.equal(first.position.x,10);assert.equal(first.rotation.y,.7);
 let disposed=0;first.traverse(m=>{if(m.geometry)m.geometry.addEventListener('dispose',()=>disposed++);});c.removePropFromWorld(first.userData.propData.id);assert(disposed>0);assert.equal(c.scene.children.length,1);assert(c.ownsOutdoorProp('bush'));
 c.window.Housing={inside:true};c.Housing=c.window.Housing;assert(!c.placeProp('bush'));assert.equal(c.scene.children.length,1);
});
test('multiplayer request carries purchased ids and host validates before evicting existing props',()=>{
 const {c,sent}=setup();c.hostConn={open:true,send:m=>sent.push(m)};c.buyOutdoorProp('chair');assert(c.placeProp('chair'));assert.equal(c.scene.children.length,0);assert.equal(sent[0].propType,'chair');assert.deepEqual([...sent[0].unlockedProps],['chair']);
 const ui=fs.readFileSync(require.resolve('../ui.js'),'utf8'),start=ui.indexOf("} else if (data.type === 'placeProp')"),end=ui.indexOf("} else if(data.type==='ytPlayback')",start);
 vm.runInContext('function handlePlacement(data,clientId){'+ui.slice(start,end).replace(/^\} else if \(data.type === 'placeProp'\) \{/, '')+'}',c);
 c.clientConns={peer:{open:true,deviceID:'peer-device',send:m=>sent.push(m)}};c.otherPlayers={peer:{lastData:{pos:{x:0,y:0,z:0}}}};c.window.Ocean={inBounds:()=>true};c.activeProps=[];c.handlePlacement({propType:'bush',x:0,z:0},'peer');assert.equal(c.scene.children.length,0);
 c.handlePlacement({propType:'bush',x:NaN,z:0,unlockedProps:['bush']},'peer');assert.equal(c.scene.children.length,0);
 c.handlePlacement({propId:'valid-bush',propType:'bush',x:0,z:0,rot:1,unlockedProps:['bush']},'peer');assert.equal(c.scene.children.length,1);assert.equal(sent.at(-1).type,'propPlaced');
});
test('props menu separates purchase and placement actions and shows live balance',()=>{
 const {c}=setup(),list={children:[],set innerHTML(v){this.children=[];},appendChild(v){this.children.push(v);}},balance={},element=()=>({setAttribute(){}});
 c.document={getElementById:id=>id==='props-list'?list:balance,createElement:element};let toggles=0;c.togglePropsUI=()=>toggles++;
 c.renderPropsUI();assert.equal(list.children.length,28);const bush=()=>list.children.find(v=>v.innerHTML.includes('Leafy Bush'));
 assert(bush().innerHTML.includes('$150'));bush().onclick();assert(c.ownsOutdoorProp('bush'));assert.equal(c.scene.children.length,0);assert(balance.textContent.includes('4,850'));assert(bush().innerHTML.includes('Unlocked'));
 bush().onclick();assert.equal(c.scene.children.length,1);assert.equal(toggles,1);
});
test('screen retains the video aperture and queue registration, and rebuilt seats carry fitted bounds',()=>{
 const {c}=setup();let attached=0;c.attachYtVideo=()=>attached++;
 c.spawnPropMesh({id:'screen-test',type:'screen',x:4,z:5,rot:.8});assert.equal(attached,1);
 const screen=c.scene.children[0];assert.equal(screen.rotation.y,.8);assert.equal(vm.runInContext("ytPlayers['screen-test'].data.queue.length",c),0);
 const chair=c.buildOutdoorProp('chair'),couch=c.buildOutdoorProp('couch');assert.equal(chair.userData.standTop,.89);assert.equal(couch.userData.standTop,.88);assert(couch.userData.standHalfZ<couch.userData.standHalfX);
 const html=fs.readFileSync(require.resolve('../index.html'),'utf8');assert(html.indexOf('src="outdoor-props.js')<html.indexOf('src="ui.js'));assert(html.includes('id="props-balance"'));
 for(const name of ['.cpanel.yml','deploy.ps1'])assert(fs.readFileSync(require.resolve('../'+name),'utf8').includes('outdoor-props.js'));
});
test('all fire props animate existing flame vertices and lights while their bases and solid parts stay fixed',()=>{
 const {c}=setup();
 for(const type of ['campfire','torch','lantern','grill']){
  const model=c.buildOutdoorProp(type),animation=model.userData.fireAnimation;assert(animation,type);
  const geometry=animation.batches[0].geometry,position=geometry.attributes.position,count=model.children.length;
  const solids=model.children.filter(m=>m.isMesh&&!animation.batches.some(b=>b.geometry===m.geometry)),rest=solids.map(m=>m.geometry.attributes.position.array.slice());
  c.animateOutdoorPropFire(model,0,1);const first=position.array.slice(),light=animation.light.intensity;c.animateOutdoorPropFire(model,.25,1);
  assert.notDeepEqual(position.array,first,type+' flames move');assert.notEqual(animation.light.intensity,light,type+' light flickers');
  assert.equal(model.children.length,count);assert.equal(animation.batches[0].geometry,geometry);assert.equal(geometry.attributes.position,position);
  for(let i=0;i<solids.length;i++)assert.deepEqual(solids[i].geometry.attributes.position.array,rest[i],type+' solid housing stays fixed');
  for(const time of [0,3,40,10000]){
   c.animateOutdoorPropFire(model,time,1);
   for(const batch of animation.batches){
    assert([...batch.geometry.attributes.position.array].every(Number.isFinite));
    for(const v of batch.vertices)if(Math.abs(v.restY-v.y)<1e-6){assert(Math.abs(batch.geometry.attributes.position.getY(v.index)-v.restY)<1e-6,type+' flame base pinned');}
   }
   assert(animation.light.intensity>0);assert(animation.light.intensity<animation.light.userData.restIntensity*1.1);
  }
  c.animateOutdoorPropFire(model,0,1);assert.deepEqual(position.array,first,type+' animation does not accumulate drift');
 }
 assert(!c.buildOutdoorProp('bush').userData.fireAnimation);assert(!c.buildOutdoorProp('hotspring').userData.fireAnimation);
});
test('placed fire animates for every peer with stable per-prop phases, and undo removes it from animation',()=>{
 const {c}=setup();c.spawnPropMesh({id:'fire-one',type:'campfire',x:0,z:0});c.spawnPropMesh({id:'fire-two',type:'campfire',x:3,z:0});
 const [one,two]=c.scene.children;assert.notEqual(one.userData.fireSeed,two.userData.fireSeed);
 c.window.tickPropAnimations(10);const before=one.userData.fireAnimation.batches[0].geometry.attributes.position.array.slice();c.window.tickPropAnimations(11);assert.notDeepEqual(one.userData.fireAnimation.batches[0].geometry.attributes.position.array,before);
 const peer=setup().c;peer.spawnPropMesh({id:'fire-one',type:'campfire',x:0,z:0});peer.window.tickPropAnimations(11);assert.deepEqual(peer.scene.children[0].userData.fireAnimation.batches[0].geometry.attributes.position.array,one.userData.fireAnimation.batches[0].geometry.attributes.position.array);
 c.removePropFromWorld('fire-one');assert.doesNotThrow(()=>c.window.tickPropAnimations(12));assert.equal(c.scene.children.length,1);
});
