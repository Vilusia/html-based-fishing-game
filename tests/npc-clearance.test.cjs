const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),THREE=require('../vendor/three.min.js');
const source=fs.readFileSync(path.join(__dirname,'../ui.js'),'utf8');
test('default island scatter leaves all NPCs and seasonal stalls clear across room seeds',()=>{
 const mesh=()=>new THREE.Group();
 const c=vm.createContext({THREE,window:{},scene:new THREE.Scene(),treeMeshes:[],treeColliders:[],pickableFlowers:[],lavaColliders:[],customLevelDecor:null,LAKE_RADIUS:20,ISLAND_RADIUS:100,disposeDecorGroup(){},isInCaveEntranceZone:()=>false,createLeafTexture:()=>null,createDetailedTree:mesh,createRockMesh:mesh,createFlowerMesh:mesh,getTerrainHeight:()=>0,saveState:{skills:{}},getLevelFromXP:()=>1,getResourceForLevel:()=>({color:'#fff',id:'flower'}),FLOWER_TYPES:[]});
 vm.runInContext(source.slice(source.indexOf('function getDefaultNpcSpawns()'),source.indexOf('function handleDataFromClient(')),c);
 for(const name of ['mulberry32','xmur3'])vm.runInContext(source.split(/\r?\n/).find(line=>line.startsWith('function '+name+'(')),c);
 const spawns=Object.values(c.getDefaultNpcSpawns());assert.equal(spawns.length,8);
 for(const npc of spawns){assert(!c.isDefaultNpcAreaClear(npc.x,npc.z));assert(!c.isDefaultNpcAreaClear(npc.x+8.9,npc.z));}
 assert(c.isDefaultNpcAreaClear(90,90));
 let checked=0;
 for(let seed=0;seed<100;seed++){
  c.generateWorld('npc-clearance-'+seed);
  assert(c.treeColliders.length>0);
  for(const scenery of c.treeColliders){for(const npc of spawns)assert(Math.hypot(scenery.x-npc.x,scenery.z-npc.z)>=9,'tree or rock overlaps an NPC clearing');checked++;}
 }
 assert(checked>1000,'exercise many accepted tree and rock placements');
});
