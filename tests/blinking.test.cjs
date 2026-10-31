const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),THREE=require('../vendor/three.min.js');const root=path.join(__dirname,'..'),ui=fs.readFileSync(path.join(root,'ui.js'),'utf8');
test('blinks close briefly every few seconds and survive character rebuilds',()=>{
 const c=vm.createContext({Math:{...Math,random:()=>.5}}),start=ui.indexOf('function characterBlinkClosed('),end=ui.indexOf('function ensureBlinkMaterial(',start);vm.runInContext(ui.slice(start,end),c);const owner={userData:{}};
 assert.equal(c.characterBlinkClosed(owner,0),false);assert.equal(c.characterBlinkClosed(owner,3299),false);assert.equal(c.characterBlinkClosed(owner,3300),true);assert.equal(c.characterBlinkClosed(owner,3439),true);assert.equal(c.characterBlinkClosed(owner,3440),false);assert.equal(owner.userData.nextBlink,6900);
});
test('3D blink switches only existing face UVs and restores them without new draws',()=>{
 const c=vm.createContext({THREE,window:{}});vm.runInContext(fs.readFileSync(path.join(root,'character3d.js'),'utf8'),c);
 const texture=color=>new THREE.DataTexture(new Uint8Array(color),1,1,THREE.RGBAFormat),assets={headFront:texture([255,0,0,255]),headBlink:texture([0,255,0,255]),headBack:texture([0,0,255,255]),torsoFront:texture([255,255,0,255]),torsoBack:texture([255,0,255,255])};
 const body=c.window.Character3D.buildCharacter({}, {base:'#cdaabb',belly:'#ffffff',parts:{ears:'cat',eyes:'standard',nose:'cat',tail:'cat',misc:'none'},pc:{}},assets),draws=body.userData.drawCalls,records=body.userData.blinkBatches;
 assert(records.length>0);const before=records.map(b=>b.geometry.attributes.uv.array.slice());c.window.Character3D.setBlink(body,true);assert.notDeepEqual([...records[0].geometry.attributes.uv.array],[...before[0]]);c.window.Character3D.setBlink(body,false);for(let i=0;i<records.length;i++)assert.deepEqual(records[i].geometry.attributes.uv.array,before[i]);assert.equal(body.userData.drawCalls,draws);
});
test('only one panel tabbar remains and its menu controls are inside the overlay',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');for(const id of ['panel-tabbar','tab-menu-overlay'])assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1);const start=html.indexOf('<div id="panel-tabbar"'),end=html.indexOf('<div id="tab-menu-overlay"',start);assert(!html.slice(start,end).includes('close-x-btn'),'no orphaned red close button between panel navigation and overlay');
});

test('final texture overlay never repaints open eyes onto a closed-eye frame',()=>{
 const eyes=[],speciesCalls=[],ctx={scale(){},translate(){}},canvas={getContext:()=>ctx},noop=()=>{};
 const c=vm.createContext({THREE,document:{createElement:()=>canvas},drawSpecies:(...args)=>speciesCalls.push(args),drawEyes:(ctx,type)=>eyes.push(type),drawBodyPaint:noop,drawShirt:noop,drawPants:noop,drawCollar:noop,drawHair:noop,drawTalkingMouth:noop,drawHat:noop,addSpriteOutline:noop});
 const start=ui.indexOf('function createSpeciesTexture('),end=ui.indexOf('function createFishTexture(',start);vm.runInContext(ui.slice(start,end),c);
 for(const species of [{eyes:'dragon'},'dragon','cat']){
  eyes.length=0;const closed=c.createSpeciesTexture(species,'#cc99bb','#ffffff',false,'none','none','none','#22dd11',{},'none','',false,true);
  assert.equal(speciesCalls.at(-1)[7],true,'base character layer uses closed eyes');assert.deepEqual(eyes,['blink'],'last overlay must draw only closed eyelids');closed.dispose();
  eyes.length=0;const open=c.createSpeciesTexture(species,'#cc99bb','#ffffff',false);assert(eyes.length===1&&eyes[0]!=='blink','open frames retain their eye type');open.dispose();
 }
 eyes.length=0;c.createSpeciesTexture({eyes:'dragon'},'#cc99bb','#ffffff',false,'none','none','none','#22dd11',{},'none','','ah',true);assert.deepEqual(eyes,['blink'],'talking frames also preserve closed eyelids');
});
