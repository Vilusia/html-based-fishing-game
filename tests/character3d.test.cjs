const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const THREE = require('../vendor/three.min.js');
const path = require('node:path');
const root = path.join(__dirname, '..');
const context = vm.createContext({ THREE, window: {} });
vm.runInContext(fs.readFileSync(path.join(root, 'character3d.js'), 'utf8'), context);
function catalog(file, name) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    const start = source.indexOf('const ' + name + ' = [');
    assert(start >= 0, name);
    const end = source.indexOf('];', start);
    return vm.runInNewContext(source.slice(start, end + 2) + ';' + name);
}
const texture = () => new THREE.Texture();
const assets = () => ({ headFront: texture(), headBack: texture(), torsoFront: texture(), torsoBack: texture() });
const look = { base: '#b4774a', belly: '#f5e1c0', parts: { ears: 'cat', eyes: 'standard', nose: 'cat', tail: 'cat', misc: 'none' }, pc: {} };
const build = context.window.Character3D.buildCharacter;
let count = 0;
let maximumTriangles = 0;
function check(cfg, appearance, cosmetics) {
    const model = build(cfg, appearance, cosmetics);
    assert(model.isGroup && model.userData.is3D);
    let draws=0;model.traverseVisible(obj=>{if(obj.isMesh)draws+=Array.isArray(obj.material)?obj.geometry.groups.length:1;});
    assert(draws<=3,'character exceeds draw call budget: '+draws);
    assert.equal(draws,model.userData.drawCalls);
    const head = model.getObjectByName('head');
    assert(head.geometry.attributes.position.count > 0);
    assert.equal(head.geometry.groups.length, 6, 'head retains all textured surfaces');
    head.geometry.computeBoundingBox();
    const headSize = head.geometry.boundingBox.getSize(new THREE.Vector3());
    assert(headSize.x > 1.1 && headSize.y > .9, 'oversized beveled head');
    assert(model.getObjectByName('torso'));
    assert(model.getObjectByName('arm'));
    const bounds = new THREE.Box3().setFromObject(model);
    assert(bounds.max.z - bounds.min.z > .8);
    let triangles = 0;
    model.traverse(obj => {
        if (!obj.geometry) return;
        if(!obj.userData.batchedSource)triangles += (obj.geometry.index ? obj.geometry.index.count : obj.geometry.attributes.position.count) / 3;
        assert([...obj.geometry.attributes.position.array].every(Number.isFinite));
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
        assert(materials.every(m => m.isMeshBasicMaterial), 'rendered characters use baked colors without dynamic-light shaders');
        obj.geometry.dispose();
    });
    let sourceTriangles=0,batchTriangles=0;
    model.traverse(obj=>{if(!obj.geometry)return;const count=(obj.geometry.index?obj.geometry.index.count:obj.geometry.attributes.position.count)/3;if(obj.userData.batchedSource)sourceTriangles+=count;if(obj.name==='characterBatch')batchTriangles+=count;});
    if(model.userData.modelSources)model.userData.modelSources.traverse(obj=>{if(obj.geometry)sourceTriangles+=(obj.geometry.index?obj.geometry.index.count:obj.geometry.attributes.position.count)/3;});
    assert.equal(batchTriangles,sourceTriangles,'batching must preserve every cosmetic triangle');
    let liveNodes=0;model.traverse(()=>liveNodes++);
    assert(liveNodes<=12,'static cosmetic source meshes must stay out of the live scene');
    assert(model.userData.mouth.visible && !model.userData.mouth.userData.batchedSource,'talking mouth remains independently animated');
    maximumTriangles = Math.max(maximumTriangles, triangles);
    // These limits leave room for accessories while preventing dense primitives returning.
    assert(triangles < 1800, 'character exceeds triangle budget: ' + triangles);
    const baseline = {cat:1120, dragon:1442, axolotl:1688, lion:2160}[appearance.parts];
    if (baseline) assert(triangles < baseline * .4, 'base species must cut at least 60% of triangles: '+appearance.parts+' '+triangles);
    const materials = new Set(), maps = new Set();
    model.traverse(obj => { if (obj.material) (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach(m => {materials.add(m); if(m.map)maps.add(m.map);}); });
    maps.forEach(t => t.dispose()); materials.forEach(m => m.dispose());
    count++;
}
for (const species of ['cat','bunny','dog','bear','fox','pig','dragon','mouse','duck','axolotl','raccoon','koala','lion','cow','frog','monkey','penguin']) check({}, {...look,parts:species}, assets());
for (const [name,part] of [['EAR_TYPES','ears'],['NOSE_TYPES','nose'],['TAIL_TYPES','tail'],['MISC_TYPES','misc'],['EYE_TYPES','eyes']]) {
    for (const item of catalog('core.js',name)) check({}, {...look,parts:{...look.parts,[part]:item.id},pc:{earsColor:'#55aabb',noseColor:'#cc88aa',tailColor:'#6644aa',miscColor:'#ee8844'}}, assets());
}
for (const hair of catalog('core.js','HAIR_TYPES')) check({hair:hair.id,hairColor:'#334488'}, look, assets());
for (const [name,key] of [['HAT_TYPES','hat'],['SHIRT_TYPES','shirt'],['COLLAR_TYPES','collar']]) {
    for (const item of catalog('fish.js',name)) check({[key]:item.id},look,{...assets(),[key]:item.id==='none'?undefined:item});
}
// Combine large accessories to exercise simultaneous cosmetic construction.
check({hair:'twintails',hairColor:'#af4455'}, {...look,parts:{ears:'deer',nose:'elephant',eyes:'frog',tail:'peacock',misc:'dragon_wings'}}, {...assets(),hat:{id:'crown',type:'crown',color:'#ffcc55'},shirt:{id:'hoodie',type:'hoodie',color:'#335588'},collar:{id:'bell',type:'bell',color:'#bb4444'}});
console.log('PASS: ' + count + ' model builds; solid geometry, cosmetic surfaces and low-poly budgets. Maximum: ' + maximumTriangles + ' triangles.');

// Hair must cover the skull at crown/temples and remain a mesh-based low-poly cut.
let hairChecks = 0;
for (const style of catalog('core.js', 'HAIR_TYPES').filter(v => v.id !== 'none')) {
    for (const hat of [undefined, {id:'redcap',type:'cap',color:'#bb3344'}]) {
        const model = build({hair:style.id,hairColor:'#564078'},look,{...assets(),hat});
        model.updateMatrixWorld(true);
        const hair = model.getObjectByName('hair');
        const scalp = model.getObjectByName('hairScalp');
        if(style.id==='mohawk'){assert(hair && !scalp,'mohawk must expose the actual head');hairChecks++;continue;}
        assert(hair && scalp, style.id + ' needs a continuous scalp');
        let triangles = 0;
        hair.traverse(obj => {
            if(!obj.geometry)return;
            triangles += (obj.geometry.index ? obj.geometry.index.count : obj.geometry.attributes.position.count)/3;
            assert(obj.material.map && obj.material.map.image.width === 32);
            assert.equal(obj.material.map.magFilter, THREE.NearestFilter);
        });
        assert(triangles <= 400, style.id + ' exceeds hair budget: ' + triangles);
        for (const direction of [new THREE.Vector3(0,1,0),new THREE.Vector3(1,1,.25).normalize(),new THREE.Vector3(-1,1,.25).normalize(),new THREE.Vector3(0,1,-1).normalize()]) {
            const ray = new THREE.Raycaster(new THREE.Vector3(0,.2,0).addScaledVector(direction,3), direction.clone().negate());
            const headHit = ray.intersectObject(model.getObjectByName('head'))[0];
            const hairHit = ray.intersectObject(scalp)[0];
            assert(headHit && hairHit, style.id + ' has an uncovered scalp');
            assert(hairHit.distance < headHit.distance, style.id + ' scalp clips inside head');
            assert(headHit.distance - hairHit.distance < .28, style.id + ' scalp floats above head');
        }
        hairChecks++;
    }
}
console.log('PASS: ' + hairChecks + ' hairstyle/hat combinations; scalp fit, pixel textures and 400-triangle hair budget.');

// Species silhouettes and visible neckwear are geometry requirements, not just IDs.
function boundsOf(model,name){const mesh=model.getObjectByName(name);assert(mesh,name);return new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3());}
const makeTail = id => build({}, {...look,parts:{...look.parts,tail:id}},assets());
const shark=boundsOf(makeTail('shark'),'verticalTailFin');
const dolphin=boundsOf(makeTail('dolphin'),'horizontalFlukes');
assert(shark.y > shark.x * 3, 'shark fin must stand vertically');
assert(dolphin.x > dolphin.y * 3, 'dolphin flukes must lie horizontally');
const paddle=boundsOf(makeTail('beaver'),'speciesTail');
assert(paddle.x > paddle.y * 2, 'beaver paddle must be broad and flat');
const squirrel=boundsOf(makeTail('squirrel'),'speciesTail');
assert(squirrel.y > .9, 'squirrel tail must curl up above its root');
for(const id of ['raccoon','red_panda','tiger','skunk','leopard']) {
    const mesh=makeTail(id).getObjectByName('tail');
    assert(mesh.material.vertexColors && mesh.geometry.attributes.color, id+' markings must render on tail surface');
}
let hatFits=0;
for(const style of catalog('core.js','HAIR_TYPES').filter(v=>v.id!=='none'))for(const hat of catalog('fish.js','HAT_TYPES').filter(v=>v.id!=='none')) {
    const model=build({hair:style.id,hairColor:'#554477'},look,{...assets(),hat});model.updateMatrixWorld(true);
    const headwear=model.getObjectByName('headwear');assert(headwear);
    if(headwear.userData.coversCrown && style.id!=='mohawk')for(const [x,z] of [[0,0],[.2,0],[-.2,0],[0,-.18],[0,.18]]) {
        const ray=new THREE.Raycaster(new THREE.Vector3(x,2,z),new THREE.Vector3(0,-1,0));
        const capHit=ray.intersectObject(model.getObjectByName('hairScalp'))[0];
        const hatHit=ray.intersectObject(headwear,true)[0];
        assert(capHit && hatHit && hatHit.distance < capHit.distance, style.id+'/'+hat.id+' crown clips through hat');
    }
    hatFits++;
}
for(const collar of catalog('fish.js','COLLAR_TYPES').filter(v=>v.id!=='none')) {
    const model=build({},look,{...assets(),collar,shirt:{id:'hoodie',type:'hoodie',color:'#335577'}});model.updateMatrixWorld(true);
    const band=model.getObjectByName('collarBand');assert(band);
    const headBounds=new THREE.Box3().setFromObject(model.getObjectByName('head'));
    const ray=new THREE.Raycaster(new THREE.Vector3(0,headBounds.min.y-.05,2),new THREE.Vector3(0,0,-1));
    const first=ray.intersectObject(model.userData.modelSources,true)[0];
    assert(first && ['neckwear'].includes(first.object.parent.name), collar.id+' must be visible in front of torso');
    const bandBounds=new THREE.Box3().setFromObject(band);
    assert(bandBounds.min.y < headBounds.min.y && bandBounds.max.y <= headBounds.min.y+.071, collar.id+' must sit snugly beneath the head with its lower band visible');
}
console.log('PASS: species tail silhouettes/markings, '+hatFits+' hairstyle/hat fits and every collar in front of a hoodie.');

const mohawk=build({hair:'mohawk',hairColor:'#e93377'},look,assets());
const crest=mohawk.getObjectByName('mohawkCrest');assert(crest,'mohawk needs a connected crest');
const crestBounds=new THREE.Box3().setFromObject(crest),crestSize=crestBounds.getSize(new THREE.Vector3());
assert(crestSize.x <= .19 && crestSize.z >= .84, 'mohawk must be a narrow forehead-to-nape strip');
assert(crestBounds.max.y >= 1.15, 'mohawk needs a raised comb');
assert(!mohawk.getObjectByName('hairScalp'),'mohawk must not add a scalp layer over the head');
assert(crestBounds.min.y < .5+(mohawk.userData.upperLift||0),'crest must attach to the head');
const cappedMohawk=build({hair:'mohawk',hairColor:'#e93377'},look,{...assets(),hat:{id:'redcap',type:'cap',color:'#333366'}});
assert(!cappedMohawk.getObjectByName('mohawkCrest'),'closed hats should tuck the crest away');
console.log('PASS: continuous narrow mohawk, arched ridge, shaved sides and hat compatibility.');

// Repeated equipment updates must reuse bodies; actual cosmetic/mode changes rebuild.
const uiSource=fs.readFileSync(path.join(root,'ui.js'),'utf8');
const replacementSource=uiSource.slice(uiSource.indexOf('function replaceCharacterBody'),uiSource.indexOf('// Rod pose',uiSource.indexOf('function replaceCharacterBody')));
let builds=0,disposals=0;
const mode={model3D:true,npcModel3D:false};
const lifecycle=vm.createContext({saveState:mode,disposeCharacterBody:()=>{disposals++;},makeCharacterBody:(cfg,kind)=>{builds++;const body=new THREE.Group();body.name='playerSprite';body.userData={cfg,is3D:kind==='player'?mode.model3D:mode.npcModel3D};return body;}});
vm.runInContext(replacementSource,lifecycle);
const owner=new THREE.Group();owner.userData.characterKind='player';
const cfg={color:'#997755',hair:'mohawk'};
const first=lifecycle.replaceCharacterBody(owner,cfg);
for(let i=0;i<100;i++)assert.equal(lifecycle.replaceCharacterBody(owner,{...cfg}),first);
assert.equal(builds,1);assert.equal(disposals,0);
lifecycle.replaceCharacterBody(owner,{...cfg,shirt:'hoodie'});assert.equal(builds,2);assert.equal(disposals,1);
mode.model3D=false;lifecycle.replaceCharacterBody(owner,{...cfg,shirt:'hoodie'});assert.equal(builds,3);assert.equal(disposals,2);
console.log('PASS: repeated equipment updates reuse bodies; cosmetics and model toggles still rebuild.');

// Atlas pixels must preserve both CanvasTexture and DataTexture row orientation.
const texels=new Uint8Array([251,11,7,255,251,11,7,255,3,17,249,255,3,17,249,255]);
const painted=new THREE.Texture({width:2,height:2,getContext:()=>({getImageData:()=>({data:texels})})});
const atlasModel=build({},look,{...assets(),headFront:painted});
const atlas=atlasModel.userData.atlas,atlasPixels=atlas.image.data;
let oriented=false;
for(let y=0;y<atlas.image.height-1;y++)for(let x=0;x<atlas.image.width;x++){
    const a=(y*atlas.image.width+x)*4,b=a+atlas.image.width*4;
    if(atlasPixels[a]===3&&atlasPixels[a+2]===249&&atlasPixels[b]===251&&atlasPixels[b+2]===7)oriented=true;
}
assert(oriented,'canvas artwork must keep its vertical orientation in the atlas');
assert.equal(atlas.minFilter,THREE.NearestFilter);assert.equal(atlas.generateMipmaps,false);
atlasModel.traverseVisible(obj=>{if(obj.isMesh&&obj!==atlasModel.userData.mouth)assert.equal(obj.material.map,atlas,'all static cosmetics must share a single texture');});
console.log('PASS: one shared cosmetic atlas, canvas orientation, nearest sampling and no dynamic-light rendering.');

// Toggle/disconnect cleanup must free the atlas and detached source textures once.
const cleanupSource=uiSource.slice(uiSource.indexOf('function disposeCharacterBody'),uiSource.indexOf('// Replace a character',uiSource.indexOf('function disposeCharacterBody')));
const cleanupContext=vm.createContext({});vm.runInContext(cleanupSource,cleanupContext);
const resources=new Set();
const track=obj=>{if(!obj.material)return;(Array.isArray(obj.material)?obj.material:[obj.material]).forEach(m=>{resources.add(m);if(m.map)resources.add(m.map);});if(obj.geometry)resources.add(obj.geometry);};
atlasModel.traverse(track);atlasModel.userData.modelSources.traverse(track);
const disposed=new Map();resources.forEach(resource=>resource.addEventListener('dispose',()=>disposed.set(resource,(disposed.get(resource)||0)+1)));
cleanupContext.disposeCharacterBody(atlasModel);
resources.forEach(resource=>assert.equal(disposed.get(resource),1,'every model GPU resource must be released exactly once'));
console.log('PASS: atlas, detached cosmetics, materials and geometry are released on model disposal.');

// Nose-color overrides must reach the solid geometry, not only the face texture.
for(const [type,part] of [['dragon','muzzle'],['snake','muzzle'],['shark','muzzle'],['dolphin','muzzle'],['zebra','muzzle'],['giraffe','muzzle'],['hippo','muzzle'],['rhino','muzzle'],['rhino','noseHorn'],['frog','nostril'],['axolotl','nostril'],['cat','nose'],['duck','upperBill'],['elephant','trunk']]) {
    const custom='#19b7ed';
    const model=build({}, {...look,parts:{...look.parts,nose:type},pc:{noseColor:custom}},assets());
    assert.equal(model.getObjectByName(part).material.color.getHexString(),custom.slice(1),type+' '+part+' must use the selected nose color');
    cleanupContext.disposeCharacterBody(model);
}
const beforeNoseRebuild=builds;
lifecycle.replaceCharacterBody(owner,{...cfg,shirt:'hoodie',noseColor:'#19b7ed'});
assert.equal(builds,beforeNoseRebuild+1,'changing nose color rebuilds the character');
console.log('PASS: 3D snouts, horns, nostrils, noses, bills and trunks honor custom colors; color changes rebuild the model.');

for(const colors of [{},{handColor:'#f012ab',footColor:'#12cd34'}]) {
    const model=build({}, {...look,pc:colors},assets());
    for(const [part,key] of [['paw','handColor'],['foot','footColor']])assert.equal(model.getObjectByName(part).material.color.getHexString(),new THREE.Color(colors[key]||look.base).getHexString(),part+' uses its own color or defaults to body');
    assert.equal(model.getObjectByName('leg').material.color.getHexString(),new THREE.Color(look.base).getHexString(),'foot color does not recolor legs');
    cleanupContext.disposeCharacterBody(model);
}
console.log('PASS: independent hand/foot colors and body-color fallback.');

// Every advertised accent tail must retain a main color and show the accent in geometry.
for(const type of context.window.Character3D.tailAccentTypes){
    const primary='#245689',secondary='#ef317b';
    const model=build({}, {...look,parts:{...look.parts,tail:type},pc:{tailColor:primary,tailAccentColor:secondary}},assets());
    const group=model.getObjectByName('speciesTail');
    let hasPrimary=false,hasSecondary=false;
    const a=new THREE.Color(primary),b=new THREE.Color(secondary);
    group.traverse(obj=>{
        if(!obj.isMesh)return;
        const colors=obj.geometry.getAttribute('color');
        if(colors)for(let i=0;i<colors.count;i++){
            const color=new THREE.Color().fromBufferAttribute(colors,i);
            if(color.distanceToSquared ? color.distanceToSquared(a)<1e-8 : Math.abs(color.r-a.r)+Math.abs(color.g-a.g)+Math.abs(color.b-a.b)<1e-5)hasPrimary=true;
            if(Math.abs(color.r-b.r)+Math.abs(color.g-b.g)+Math.abs(color.b-b.b)<1e-5)hasSecondary=true;
        }
        else {if(obj.material.color.equals(a))hasPrimary=true;if(obj.material.color.equals(b))hasSecondary=true;}
    });
    assert(hasPrimary,type+' must retain the main tail color');assert(hasSecondary,type+' must show the secondary tail color');
    cleanupContext.disposeCharacterBody(model);
}
console.log('PASS: all supported two-tone tails retain their main color and display the chosen accent.');

// Exercise the shop handler through saved config, body replacement and visible batching.
const tailPlayer=new THREE.Group();tailPlayer.userData.characterKind='player';
const pickerNodes={'tail-accent-color-row':{},'tail-accent-color-picker':{value:''}};
const accentFlow=vm.createContext({window:{Character3D:context.window.Character3D},saveState:{model3D:true,currentTail:'dragon',currentNose:'dragon',catColor:'#cc88cc',tailColor:'#cc88cc'},player:tailPlayer,document:{getElementById:id=>pickerNodes[id]},saveGame:()=>{},updateCharacterPreview:()=>{},disposeCharacterBody:cleanupContext.disposeCharacterBody});
for(const name of ['characterLookFromCfg','characterCfgFromSave','replaceCharacterBody']){
 const start=uiSource.indexOf('function '+name+'('),end=uiSource.indexOf('\n}',start)+2;vm.runInContext(uiSource.slice(start,end),accentFlow);
}
accentFlow.makeCharacterBody=cfg=>build(cfg,accentFlow.characterLookFromCfg(cfg),assets());
accentFlow.updateLocalVisuals=()=>accentFlow.replaceCharacterBody(tailPlayer,accentFlow.characterCfgFromSave());
vm.runInContext(uiSource.slice(uiSource.indexOf('function update3DColorControls()'),uiSource.indexOf('function updatePerformanceUI()')),accentFlow);
const greenVertices=body=>{let count=0;body.traverseVisible(obj=>{if(obj.name!=='characterBatch')return;const c=obj.geometry.getAttribute('color');for(let i=0;i<c.count;i++)if(c.getX(i)<.001&&c.getY(i)>.7&&c.getZ(i)<.001)count++;});return count;};
accentFlow.updateLocalVisuals();const originalTailBody=tailPlayer.getObjectByName('playerSprite');assert.equal(greenVertices(originalTailBody),0);
accentFlow.window.change3DTailAccent('#00ff00');const coloredTailBody=tailPlayer.getObjectByName('playerSprite');
assert.notEqual(coloredTailBody,originalTailBody,'shop selection must replace the live model');assert(greenVertices(coloredTailBody)>0,'accent must reach visible render-batch vertices');
assert.equal(coloredTailBody.getObjectByName('tailSpade').material.color.getHexString(),'00ff00','dragon ridges must use the selected accent');
accentFlow.window.change3DTailAccent('');assert.equal(greenVertices(tailPlayer.getObjectByName('playerSprite')),0,'Reset removes the custom accent from the visible mesh');
cleanupContext.disposeCharacterBody(tailPlayer.getObjectByName('playerSprite'));
console.log('PASS: shop accent changes and Reset rebuild the live dragon and update visible batch colors.');

for(const data of catalog('fish.js','ROD_TYPES')){
 const rod=context.window.Character3D.buildRod(data);assert(rod.isGroup&&rod.userData.is3D);assert(rod.getObjectByName('rodTip'));assert(rod.getObjectByName('reel'));assert(rod.getObjectByName('rodGrip'));
 rod.traverse(obj=>{if(obj.geometry)assert([...obj.geometry.attributes.position.array].every(Number.isFinite),data.id+' finite rod geometry');});
 assert(rod.getObjectByName('rodTip').position.y>2,'line begins at the shaft tip');cleanupContext.disposeCharacterBody(rod);
}
const holdingModel=build({holdingRod:true},look,assets()),restModel=build({},look,assets());
const hands=model=>{const result=[];model.userData.modelSources.traverse(obj=>{if(obj.name==='paw')result.push(obj);});return result;};
const raisedHands=hands(holdingModel),restHands=hands(restModel);
assert.equal(raisedHands[0].position.z,restHands[0].position.z,'left hand remains at rest');assert.equal(raisedHands[1].position.z,.43,'right hand reaches the grip');assert.equal(raisedHands[1].position.y,-.62+holdingModel.userData.upperLift);
cleanupContext.disposeCharacterBody(holdingModel);cleanupContext.disposeCharacterBody(restModel);
console.log('PASS: all rod skins have finite solid geometry, reels and line tips; only the right hand grips the equipped rod.');

const fishPose=build({holdingFish:true},look,assets()),fishHands=hands(fishPose);
assert.equal(fishHands[0].position.z,.03,'left hand stays free while holding a fish');assert.equal(fishHands[1].position.y,-.45+fishPose.userData.upperLift);assert.equal(fishHands[1].position.z,.5);
const fishView=vm.createContext({THREE,window:{Character3D:context.window.Character3D},Character3D:context.window.Character3D,saveState:{model3D:true},createFishTexture:()=>new THREE.Texture()});
const fishStart=uiSource.indexOf('function makeHeldFish('),fishEnd=uiSource.indexOf('\n}',fishStart)+2;vm.runInContext(uiSource.slice(fishStart,fishEnd),fishView);
for(const size of [.5,1,2]){
 const held=fishView.makeHeldFish('Rainbow Trout','#cc8844',size);assert(held.isGroup&&held.userData.is3D);assert.equal(held.userData.size,size);
 const bounds=new THREE.Box3().setFromObject(held.children[0]);assert(Math.abs(bounds.min.y-.025)<1e-6,'fish belly rests just above the hand');assert(bounds.max.x-bounds.min.x<=2.25,'held fish size is bounded');cleanupContext.disposeCharacterBody(held);
}
fishView.saveState.model3D=false;const flatFish=fishView.makeHeldFish('Rainbow Trout','#cc8844',1);assert(flatFish.isSprite&&!flatFish.userData.is3D);cleanupContext.disposeCharacterBody(flatFish);cleanupContext.disposeCharacterBody(fishPose);
console.log('PASS: one-handed fish pose, solid fish sizes resting on the grip, and the 2D sprite fallback.');

const walker=build({},look,assets()),drawsBefore=walker.userData.drawCalls;
context.window.Character3D.animateWalk(walker,true,.1);
let positive=0,negative=0,stationary=0;
for(const batch of walker.userData.walkBatches){
 const moved=new Set(batch.vertices.map(v=>v.index)),p=batch.geometry.attributes.position;
 for(const v of batch.vertices){const delta=p.getZ(v.index)-batch.rest[v.index*3+2];if(v.side>0&&delta<-.01)positive++;if(v.side<0&&delta>.01)negative++;}
 for(let i=0;i<p.count;i++)if(!moved.has(i)){assert.equal(p.getX(i),batch.rest[i*3]);assert.equal(p.getY(i),batch.rest[i*3+1]);assert.equal(p.getZ(i),batch.rest[i*3+2]);stationary++;}
}
assert(positive>0&&negative>0,'opposite legs and feet stride in opposite directions');assert(stationary>0,'upper-body vertices remain stationary');
for(let frame=0;frame<10;frame++)context.window.Character3D.animateWalk(walker,false,.05);
assert.equal(walker.userData.walkState.weight,0,'idle settles the walking pose');
for(const batch of walker.userData.walkBatches){const p=batch.geometry.attributes.position;for(const v of batch.vertices)for(let axis=0;axis<3;axis++)assert(Math.abs(p.array[v.index*3+axis]-batch.rest[v.index*3+axis])<1e-6,'idle restores original leg geometry');}
assert.equal(walker.userData.drawCalls,drawsBefore,'walking adds no draw calls');cleanupContext.disposeCharacterBody(walker);
console.log('PASS: alternating visible leg/foot strides, stationary upper body, idle reset and unchanged draw budget.');

const emoter=build({},look,assets());
for(const id of ['wave','cheer','dance']){
 context.window.Character3D.animateEmote(emoter,id,.4);let changed=0;for(const batch of emoter.userData.walkBatches)for(const v of batch.emoteVertices)if(Math.abs(batch.geometry.attributes.position.getY(v.index)-batch.rest[v.index*3+1])>.01)changed++;
 assert(changed>0,id+' animates visible arm/hand vertices');
}
context.window.Character3D.animateEmote(emoter,null,0);for(const batch of emoter.userData.walkBatches)for(const v of batch.emoteVertices)assert(Math.abs(batch.geometry.attributes.position.getY(v.index)-batch.rest[v.index*3+1])<1e-6,'emote cleanup restores hands');cleanupContext.disposeCharacterBody(emoter);
console.log('PASS: wave, cheer and dance animate visible batched hands and reset to rest.');

const addedEmotes=['clap','shrug','point','salute','facepalm','laugh','cry','shiver','stretch','yawn','flex','heart','disco','robot','sway','happyhop','stomp','tiptoe','peekaboo','airplane'];
const gestureModel=build({},look,assets());
for(const id of addedEmotes){
 context.window.Character3D.animateEmote(gestureModel,id,.4);let changed=0;
 for(const batch of gestureModel.userData.walkBatches){const p=batch.geometry.attributes.position;assert([...p.array].every(Number.isFinite));for(const v of batch.emoteVertices){const i=v.index*3;if(Math.abs(p.getX(v.index)-batch.rest[i])+Math.abs(p.getY(v.index)-batch.rest[i+1])+Math.abs(p.getZ(v.index)-batch.rest[i+2])>.001)changed++;}}
 assert(changed>0,id+' must have an actual arm or hand gesture');
 context.window.Character3D.animateEmote(gestureModel,null,0);
 for(const batch of gestureModel.userData.walkBatches)for(const v of batch.emoteVertices)for(let axis=0;axis<3;axis++)assert(Math.abs(batch.geometry.attributes.position.array[v.index*3+axis]-batch.rest[v.index*3+axis])<1e-6,id+' must reset cleanly');
}
cleanupContext.disposeCharacterBody(gestureModel);
console.log('PASS: all 20 added emotes animate finite visible hand geometry and restore their resting pose.');

const sitter=build({sitting:true},look,assets());
assert.equal(sitter.getObjectByName('leg').rotation.x,Math.PI/2,'sitting bends legs forward');assert.equal(sitter.getObjectByName('foot').position.z,.57+context.window.Character3D.proportions.seatedReach,'seated feet rest forward');assert.equal(sitter.getObjectByName('foot').position.y,-1+sitter.userData.upperLift,'seated feet line up with ground');cleanupContext.disposeCharacterBody(sitter);
console.log('PASS: seated legs bend forward and feet sit at ground level.');
