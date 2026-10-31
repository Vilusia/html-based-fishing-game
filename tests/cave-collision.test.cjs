const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),THREE=require('../vendor/three.min.js');const source=fs.readFileSync(path.join(__dirname,'../ui.js'),'utf8');
function setup(){const c=vm.createContext({THREE,window:{},scene:new THREE.Scene(),staticColliders:[],treeColliders:[],waterfallMesh:null,document:{createElement:()=>({getContext:()=>({fillRect(){}})})},addHotspotParticles(){}});vm.runInContext(source.slice(source.indexOf('function createRockMesh('),source.indexOf('function createDetailedTree(')),c);for(const name of ['mulberry32','xmur3'])vm.runInContext(source.split(/\r?\n/).find(line=>line.startsWith('function '+name+'(')),c);vm.runInContext(source.slice(source.indexOf('function makeCaveRockCollider('),source.indexOf('function addHotspotParticles(')),c);return c;}
test('default cave entrance and pool approach stay clear until the visible rear rocks',()=>{const c=setup();c.createWaterfallZone();assert(c.staticColliders.length>100);assert.equal(c.treeColliders.length,0,'raised cave rocks must not become infinite floor cylinders');for(let z=-72;z>=-112;z-=2)assert(!c.staticColliders.some(b=>c.staticColliderHits(b,{x:0,y:0,z})),'invisible wall across entrance at '+z);assert(c.staticColliders.some(b=>c.staticColliderHits(b,{x:0,y:0,z:-116})),'visible back wall must stay solid');assert(c.staticColliders.every(b=>b.caveRock&&b.planes.length>0&&Number.isFinite(b.minY)));});
test('overhangs allow ground-level passage but block players who jump into the visible rock',()=>{const c=setup(),rock=c.createRockMesh(4);rock.position.set(0,8,0);rock.rotation.set(.2,.4,.1);const b=c.makeCaveRockCollider(rock);assert(!c.staticColliderHits(b,{x:0,y:0,z:0}));assert(c.staticColliderHits(b,{x:0,y:6,z:0}));assert(!c.staticColliderHits(b,{x:0,y:b.maxY,z:0}));assert(!c.caveRockBlocksLine({x:-10,y:0,z:0},{x:10,y:0,z:0},b));assert(c.caveRockBlocksLine({x:-10,y:6.8,z:0},{x:10,y:6.8,z:0},b));});
test('convex faces reject empty bounding-box corners while keeping actual rock interiors solid',()=>{const c=setup(),rock=new THREE.Mesh(new THREE.BoxGeometry(2,2,2));rock.position.y=1;rock.rotation.y=Math.PI/4;const b=c.makeCaveRockCollider(rock);assert(c.staticColliderHits(b,{x:0,y:0,z:0},.1));assert(!c.staticColliderHits(b,{x:1.3,y:0,z:1.3},.1));assert(!c.caveRockBlocksLine({x:1.3,y:0,z:1.1},{x:1.3,y:0,z:1.4},b));});
test('walking, diving and knockback share cave collision; existing houses retain their collider behavior',()=>{const c=setup(),house={minX:-2,maxX:2,minZ:-2,maxZ:2};assert(c.staticColliderHits(house,{x:0,y:0,z:0}));assert(!c.staticColliderHits(house,{x:3,y:0,z:0}));assert.equal((source.match(/staticColliderHits\(b,(?:np|testPos)\)/g)||[]).length,3);assert(source.includes('    createCabin();'));assert(source.includes("house.position.set(-40,0,10);house.name='playerHouseExterior';scene.add(house)"));});

test('all 25 cave platforms form a reachable route to the summit and clear the cave rocks',()=>{
 const c=setup();c.createWaterfallZone();const route=c.window.parkourPlatforms;assert.equal(route.length,25);assert.equal(route.at(-1).y,42);const start={x:route[0].x,y:0,z:route[0].z};
 for(let i=0;i<route.length;i++){
  const a=i?route[i-1]:start,b=route[i],rise=b.y-a.y;assert(rise>=0&&rise<=2);const time=(10+Math.sqrt(100-40*rise))/20;assert(Math.hypot(b.x-a.x,b.z-a.z)<=10*time);
  for(let t=0;t<=time;t+=.025){const k=t/time,p={x:a.x+(b.x-a.x)*k,y:a.y+10*t-10*t*t,z:a.z+(b.z-a.z)*k};assert(!c.staticColliders.some(col=>c.staticColliderHits(col,p)),'jump '+i+' intersects cave rock');}
 }
 const slabs=c.scene.children.filter(m=>m.name==='caveJumpPlatform');assert.equal(slabs.length,route.length);for(let i=0;i<slabs.length;i++){const bounds=new THREE.Box3().setFromObject(slabs[i]);assert(Math.abs(bounds.max.y-route[i].y)<1e-6);assert(Math.abs(bounds.max.x-bounds.min.x-route[i].halfX*2)<1e-6);}
});
test('platforms require a jump and catch descending players across frame boundaries',()=>{
 const c=setup();c.createWaterfallZone();for(const p of c.window.parkourPlatforms){assert.equal(c.cavePlatformTopAt(p.x,p.z,0),-Infinity);assert.equal(c.cavePlatformTopAt(p.x,p.z,p.y),p.y);assert.equal(c.cavePlatformTopAt(p.x,p.z,p.y-.4,p.y+.2),p.y);}
 const p=c.window.parkourPlatforms[0];assert.equal(c.cavePlatformTopAt(p.x+p.halfX+1,p.z,p.y),-Infinity);c.window.CUSTOM_LEVEL={};assert.equal(c.cavePlatformTopAt(p.x,p.z,p.y),-Infinity);
});
test('the normal jump physics can land on every platform at 60 FPS',()=>{
 const c=setup();c.createWaterfallZone();const route=c.window.parkourPlatforms;
 for(let i=0;i<route.length;i++){
  const a=i?route[i-1]:{...route[0],y:0},b=route[i],p={x:a.x,y:a.y,z:a.z};let previousY=p.y,velocity=10,landed=false;
  for(let frame=0;frame<120;frame++){
   const top=c.cavePlatformTopAt(p.x,p.z,p.y,previousY);if(velocity<=0&&p.y<=top&&Math.abs(top-b.y)<.001){landed=true;break;}
   previousY=p.y;const dx=b.x-p.x,dz=b.z-p.z,d=Math.hypot(dx,dz),step=Math.min(d,10/60);if(d){p.x+=dx/d*step;p.z+=dz/d*step;}velocity-=20/60;p.y+=velocity/60;
  }
  assert(landed,'could not land on platform '+i);
 }
});
test('visible cave rock tops support landings without lifting players underneath them',()=>{
 const c=setup(),rock=new THREE.Mesh(new THREE.BoxGeometry(8,2,8));rock.position.y=10;const col=c.makeCaveRockCollider(rock);c.staticColliders.push(col);assert.equal(c.caveRockTopAt(0,0,0),-Infinity);assert.equal(c.caveRockTopAt(0,0,11),11);assert.equal(c.caveRockTopAt(0,0,10.7,11.1),11);assert(!c.staticColliderHits(col,{x:0,y:11,z:0}));assert(c.staticColliderHits(col,{x:0,y:8,z:0}));
});
