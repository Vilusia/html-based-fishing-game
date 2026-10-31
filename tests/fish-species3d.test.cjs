const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),THREE=require('../vendor/three.min.js');
const root=path.join(__dirname,'..'),fishSource=fs.readFileSync(path.join(root,'fish.js'),'utf8'),a=fishSource.indexOf('const FISH_TYPES = ['),b=fishSource.indexOf('];',a)+2;
const fish=vm.runInNewContext(fishSource.slice(a,b)+';FISH_TYPES');
const c=vm.createContext({THREE,window:{},FISH_TYPES:fish});for(const file of ['character3d.js','furniture.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),c);
const build=c.window.Character3D.buildFish;
function dispose(model){const geometries=new Set(),materials=new Set();model.traverse(obj=>{if(obj.geometry)geometries.add(obj.geometry);if(obj.material)materials.add(obj.material);});geometries.forEach(v=>v.dispose());materials.forEach(v=>v.dispose());}
test('every catalog species resolves its actual shape and builds finite model surfaces',()=>{
 for(const entry of fish){const model=build(entry.name,entry.color);assert(model.userData.shape,entry.name+' uses its catalog rather than the legacy fallback');model.traverse(obj=>{if(obj.geometry)assert([...obj.geometry.attributes.position.array].every(Number.isFinite),entry.name);});const bounds=new THREE.Box3().setFromObject(model);assert(!bounds.isEmpty());dispose(model);}
});
test('species with distinct real anatomy no longer share unsuitable silhouettes',()=>{
 for(const [name,shape] of [['Koi','carp'],['Ozark Cavefish','cavefish'],['Corydoras','corydoras'],['Gourami','gourami'],['Permit','permit'],['Wahoo','mackerel']]){const model=build(name);assert.equal(model.userData.shape,shape);if(name==='Ozark Cavefish'){assert(model.userData.blind);assert(model.children.length<15);}dispose(model);}
 const seahorse=build('Seahorse');assert(seahorse.getObjectByName('curledTail'));dispose(seahorse);
 const rainbow=build('Rainbow Trout'),brook=build('Brook Trout');assert.notDeepEqual([...rainbow.getObjectByName('fishBody').geometry.attributes.color.array],[...brook.getObjectByName('fishBody').geometry.attributes.color.array]);dispose(rainbow);dispose(brook);
});
test('aquariums and plaques display the real 3D species inside their bounds without altering deposited fish',()=>{
 for(const entry of fish.filter(v=>v.name!=='Old Boot'))for(const type of ['aquarium','catch_plaque']){
  const item={displayCatch:{name:entry.name,color:entry.color,size:1,price:entry.price,rarity:entry.rarity,zone:entry.zone},displayOwned:true};const before=JSON.stringify(item);
  const mesh=c.window.Furniture.makeMesh(type,undefined,item),holder=mesh.getObjectByName('displayCatchModel');assert(holder&&holder.userData.is3D,entry.name+' '+type+' uses a solid model');assert.equal(mesh.getObjectByName('displayCatchSprite'),undefined);assert.equal(holder.userData.fishName,entry.name);
  const bounds=new THREE.Box3().setFromObject(holder),size=bounds.getSize(new THREE.Vector3());const limits=type==='aquarium'?[1.12,.38,.6]:[1.2,.56,.4];assert(size.x<=limits[0]+1e-5&&size.y<=limits[1]+1e-5&&size.z<=limits[2]+1e-5,entry.name+' fits '+type);
  if(type==='aquarium'){assert(bounds.min.y>=.2&&bounds.max.y<=.6);assert(mesh.getObjectByName('aquariumGlass').material.transparent);}else assert(bounds.min.z>=.1599);
  assert.equal(JSON.stringify(item),before,'displaying does not change the stored catch');dispose(mesh);
 }
});
