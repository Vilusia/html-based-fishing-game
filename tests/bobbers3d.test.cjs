const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),THREE=require('../vendor/three.min.js');
const root=path.join(__dirname,'..'),core=fs.readFileSync(path.join(root,'core.js'),'utf8'),ui=fs.readFileSync(path.join(root,'ui.js'),'utf8');const a=core.indexOf('const BOBBER_TYPES = ['),b=core.indexOf('];',a)+2;const catalog=vm.runInNewContext(core.slice(a,b)+';BOBBER_TYPES');
function setup(){const c=vm.createContext({THREE,window:{},saveState:{model3D:true},BOBBER_TYPES:catalog});vm.runInContext(fs.readFileSync(path.join(root,'bobbers3d.js'),'utf8'),c);c.Bobbers3D=c.window.Bobbers3D;const start=ui.indexOf('function createBobberMesh('),end=ui.indexOf('function createBobber(targetPos)',start);vm.runInContext(ui.slice(start,end),c);return c;}
test('35 purchasable bobber designs build finite solid geometry at float scale',()=>{
 const c=setup(),ids=new Set();for(const type of catalog){assert(!ids.has(type.id));ids.add(type.id);const model=c.createBobberMesh(type.id);assert(model.isGroup&&model.userData.is3D);assert.equal(model.userData.bobberType,type.id);let triangles=0;model.traverse(obj=>{if(obj.geometry){const p=obj.geometry.attributes.position;assert([...p.array].every(Number.isFinite),type.id);triangles+=(obj.geometry.index?obj.geometry.index.count:p.count)/3;}});assert(triangles>20&&triangles<2000,type.id+' stays within geometry budget');const size=new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());assert(size.x<1&&size.y<1&&size.z<1,type.id+' fits the existing float scale');}
 assert.equal(ids.size,35);assert.equal(c.createBobberMesh('bad-id').userData.bobberType,'classic');
});
test('all 20 new designs have independent matching icon drawing paths',()=>{
 const c=setup();const start=ui.indexOf('    window.drawBobberIcon ='),end=ui.indexOf('    window.filterShopItems =',start);vm.runInContext(ui.slice(start,end),c);
 for(const type of catalog.slice(15)){
  let draws=0,balance=0;const ctx=new Proxy({}, {get:(obj,key)=>{if(key==='save')return()=>balance++;if(key==='restore')return()=>balance--;if(key==='createRadialGradient'||key==='createLinearGradient')return()=>({addColorStop(){}});return(...args)=>{for(const value of args)if(typeof value==='number')assert(Number.isFinite(value),type.id+' icon has finite coordinates');if(['fill','fillRect','stroke'].includes(key))draws++;};},set:()=>true});
  c.window.drawBobberIcon(ctx,type,64);assert(draws>0,type.id+' draws a shop icon');assert.equal(balance,0);
 }
});
test('bobber model module ships in both deployment methods',()=>{for(const file of ['index.html','.cpanel.yml','deploy.ps1'])assert(fs.readFileSync(path.join(root,file),'utf8').includes('bobbers3d.js'));});
