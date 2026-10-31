const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),THREE=require('../vendor/three.min.js');
const code=fs.readFileSync(require.resolve('../rowboat.js'),'utf8');
function setup(){const c=vm.createContext({THREE,window:{}});vm.runInContext(code,c);return c.window.Rowboat3D;}
test('personal rowboat is a hollow solid hull with paired pivoting oars and a small draw budget',()=>{
 const api=setup(),boat=api.build();boat.updateMatrixWorld(true);assert.equal(boat.name,'sailBoat');assert(boat.getObjectByName('hollowHull'));assert.equal(boat.userData.rowing.oars.length,2);
 let triangles=0,draws=0;boat.traverse(m=>{if(m.isMesh){draws++;assert(m.geometry.attributes.normal);assert([...m.geometry.attributes.position.array].every(Number.isFinite));triangles+=(m.geometry.index?m.geometry.index.count:m.geometry.attributes.position.count)/3;assert(!m.material.map);}});assert(draws<=12);assert(triangles<2000);
 const ray=new THREE.Raycaster(new THREE.Vector3(0,3,0),new THREE.Vector3(0,-1,0));const hit=ray.intersectObject(boat,true)[0];assert(hit);assert(hit.point.y<.3,'open center exposes the floor instead of a flat top');
});
test('rowing sweeps and dips both oars, emits one sound cue per stroke, and settles at rest',()=>{
 const api=setup(),boat=api.build(),row=boat.userData.rowing,left=row.oars[0],right=row.oars[1];let strokes=0;
 for(let i=0;i<131;i++)if(api.animate(boat,true,1/60))strokes++;assert.equal(strokes,2);assert(Math.abs(left.rotation.y+right.rotation.y)<1e-9);assert(Math.abs(left.rotation.z+right.rotation.z)<1e-9);
 const angle=left.rotation.y;api.animate(boat,true,.1);assert.notEqual(left.rotation.y,angle);
 for(let i=0;i<120;i++)assert.equal(api.animate(boat,false,1/60),false);
 assert.equal(row.weight,0);assert.equal(Math.abs(left.rotation.y),0);assert.equal(Math.abs(right.rotation.z),0);assert.equal(Math.abs(boat.rotation.x),0);assert.equal(Math.abs(boat.rotation.z),0);
 const meshes=[];boat.traverse(m=>{if(m.isMesh)meshes.push(m.geometry);});api.animate(boat,true,20);assert(boat.children.every(m=>Number.isFinite(m.rotation.x)));const after=[];boat.traverse(m=>{if(m.isMesh)after.push(m.geometry);});assert.deepEqual(after,meshes);
});
test('rowing sound is cached, smooth at its edges, dynamic through the stroke and safely below clipping',()=>{
 const audio=fs.readFileSync(require.resolve('../audio.js'),'utf8'),start=audio.indexOf('let rowingStrokeCache='),end=audio.indexOf('const createPanner',start);let buffers=0;
 const c=vm.createContext({Math,audioCtx:{sampleRate:24000,createBuffer(ch,n){buffers++;const data=new Float32Array(n);return {getChannelData:()=>data};}}});vm.runInContext(audio.slice(start,end),c);
 const buffer=c.rowingStrokeBuffer(),data=buffer.getChannelData(0);assert.equal(c.rowingStrokeBuffer(),buffer);assert.equal(buffers,1);assert.equal(data.length,19680);assert.equal(data[0],0);assert(Math.abs(data.at(-1))<.001);
 assert([...data].every(v=>Number.isFinite(v)&&Math.abs(v)<1));const rms=(a,b)=>Math.sqrt(data.slice(a,b).reduce((sum,v)=>sum+v*v,0)/(b-a));assert(rms(3000,9000)>.015);assert(rms(3000,9000)>rms(18000,19680)*3);
});
test('local and remote boat animations, the shop preview and deployment assets are wired',()=>{
 const ui=fs.readFileSync(require.resolve('../ui.js'),'utf8');assert(ui.includes('Rowboat3D.animate(personalBoat,rowing,dt)'));assert(ui.includes("Rowboat3D.animate(p.mesh.getObjectByName('sailBoat'),!!remoteSailing&&isMoving,dt)"));assert(ui.includes('Rowboat3D.thumbnail()'));assert(ui.includes('if(window.Rowboat3D)return Rowboat3D.build()'));assert(ui.includes('function createBoatTexture()'));
 for(const file of ['index.html','.cpanel.yml','deploy.ps1'])assert(fs.readFileSync(require.resolve('../'+file),'utf8').includes('rowboat.js'));
});
