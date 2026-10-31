const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),THREE=require('../vendor/three.min.js');
const source=fs.readFileSync(path.join(__dirname,'../ui.js'),'utf8');
function setup(){
 const nodes={};for(const part of ['hand','foot']){nodes[part+'-color-row']={hidden:false};nodes[part+'-color-picker']={value:''};}nodes['tail-accent-color-row']={hidden:true};nodes['tail-accent-color-picker']={value:''};
 let saves=0,updates=0;const scene=new THREE.Group(),house=new THREE.Group();
 function add(root,kind){const group=new THREE.Group();root.add(group);const body=new THREE.Group();body.name='playerSprite';body.userData={cfg:{},kind};body.position.set(1,2,3);group.add(body);return group;}
 const local=add(house,'player'),npc=add(scene,'npc'),remote=add(scene,'player'),rebuilt=[];
 const context=vm.createContext({window:{Housing:true,Character3D:{tailAccentTypes:['dragon','fox']}},Housing:{renderScene:house},scene,saveState:{model3D:false,catColor:'#aabbcc'},document:{getElementById:id=>nodes[id]},player:local,saveGame:()=>saves++,updateLocalVisuals:()=>updates++,updateCharacterPreview:()=>{},replaceCharacterBody:(group,cfg)=>{rebuilt.push(group);return group.getObjectByName('playerSprite');}});
 vm.runInContext(source.slice(source.indexOf('function update3DColorControls()'),source.indexOf('function updatePerformanceUI()')),context);
 return {context,nodes,rebuilt,local,npc,remote,saves:()=>saves,updates:()=>updates};
}
test('3D toggle rebuilds local, remote and NPC bodies including the house scene',()=>{
 const s=setup();s.context.window.toggleCharacterModels();assert.equal(s.context.saveState.model3D,true);assert.deepEqual(new Set(s.rebuilt),new Set([s.local,s.npc,s.remote]));assert.equal(s.nodes['hand-color-row'].hidden,false);
 s.context.window.toggleCharacterModels();assert.equal(s.nodes['foot-color-row'].hidden,true);assert.equal(s.context.saveState.model3D,false);assert.equal(s.saves(),2);assert.equal(s.local.getObjectByName('playerSprite').position.y,2);
});
test('limb controls reject changes in 2D and save independent colors in 3D',()=>{
 const s=setup(),change=s.context.window.change3DLimbColor;change('hand','#123456');assert.equal(s.saves(),0);
 s.context.window.toggleCharacterModels();change('hand','#123456');change('foot','#fedcba');assert.equal(s.context.saveState.handColor,'#123456');assert.equal(s.context.saveState.footColor,'#fedcba');assert.equal(s.nodes['hand-color-picker'].value,'#123456');assert.equal(s.updates(),2);
 change('invalid','#123456');change('hand','invalid');assert.equal(s.saves(),3);
 s.context.window.toggleCharacterModels();assert.equal(s.context.saveState.handColor,'#123456');assert.equal(s.nodes['hand-color-row'].hidden,true);
});
test('saved and remote colors reach the 3D look configuration',()=>{
 const c=vm.createContext({saveState:{handColor:'#123456',footColor:'#fedcba'}});
 for(const name of ['characterLookFromCfg','characterCfgFromSave','characterCfgFromData']){const start=source.indexOf('function '+name+'('),end=source.indexOf('\n}',start)+2;vm.runInContext(source.slice(start,end),c);}
 for(const cfg of [c.characterCfgFromSave(),c.characterCfgFromData({handColor:'#123456',footColor:'#fedcba'})]){const look=c.characterLookFromCfg(cfg);assert.equal(look.pc.handColor,'#123456');assert.equal(look.pc.footColor,'#fedcba');}
});

test('tail accent control requires 3D and a supported tail, and Reset restores natural colors',()=>{
 const s=setup();s.context.saveState.currentTail='dragon';
 s.context.update3DColorControls();assert.equal(s.nodes['tail-accent-color-row'].hidden,true);
 s.context.window.toggleCharacterModels();assert.equal(s.nodes['tail-accent-color-row'].hidden,false);
 s.context.window.change3DTailAccent('#abcdef');assert.equal(s.context.saveState.tailAccentColor,'#abcdef');assert.equal(s.nodes['tail-accent-color-picker'].value,'#abcdef');
 s.context.window.change3DTailAccent('');assert.equal(s.context.saveState.tailAccentColor,'');
 s.context.saveState.currentTail='bunny';s.context.update3DColorControls();assert.equal(s.nodes['tail-accent-color-row'].hidden,true);
 s.context.window.change3DTailAccent('#123456');assert.equal(s.context.saveState.tailAccentColor,'');
});
